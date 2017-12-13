/*
This Source Code Form is subject to the terms of the
Mozilla Public License, v. 2.0.
If a copy of the MPL was not distributed with this file,
You can obtain one at http://mozilla.org/MPL/2.0/.
Author: XrXr
*/
import * as youtube_request from "./youtube/request";
import * as youtube_util from "./youtube/util";
import * as storage from "./persistent/storage";
import * as backup from "./persistent/backup";
import * as config from "./config";
import * as filters from "./persistent/filters";
import * as events from "./events";
import * as button from "./browser/button";
import * as notification from "./browser/notification";
import * as util from "./util";
import { initialize as logger_init, log_error } from "./logger";

const timers = {
    setTimeout: window.setTimeout.bind(window)
};

let db;  // will be set once db is opened
let fatal_error;  // puts hub page into a fail state when set

function get_db() {
    return db;
}

function get_fatal_error() {
    return fatal_error;
}

function fatal_error_recovered() {
    fatal_error = null;
}

const hub_url = browser.extension.getURL("/frontend/home.html");
let creating_hub_tab = false;
let hub_tab_id;
// Opens the hub page in a new tab or focus on it. Searches through all opened
// windows. Return whether a new hub tab was opened;
function open_or_focus () {
    if (hub_tab_id) {
        browser.tabs.get(hub_tab_id)
            .then(tab_info => {
                if (tab_info.url == hub_url) {
                    browser.tabs.update(tab_info.id, { active: true });
                    browser.windows.update(tab_info.windowId, { focused: true });
                } else {
                    // user navigated away
                    hub_tab_id = null;
                    make_hub_tab();
                }
            }, make_hub_tab);
    } else {
        make_hub_tab();
    }

    function make_hub_tab() {
        if (creating_hub_tab) {
            return;
        }
        creating_hub_tab = true;
        browser.tabs.create({
            active: true,
            url: "/frontend/home.html"
        }).then(tab => tab, err => {
            log_error("Failed to create hub tab", err);
        }).then(tab => {
            hub_tab_id = tab.id;
            creating_hub_tab = false;
        });
    }
}

browser.webNavigation.onCommitted.addListener(details => {
    if (hub_tab_id) {
        browser.tabs.query({}).then(tab_list => {
            for (let tab of tab_list) {
                if (tab.id === details.tabId) {
                    continue;
                }
                if (tab.url === hub_url) {
                    browser.tabs.remove(tab.id);
                }
            }
        });

        hub_tab_id = details.tabId;
    }
}, {
    url: [{
        urlEquals: hub_url,
    }]
});

function filter_and_store(new_uploads) {
    if (new_uploads.length === 0) {
        return Promise.resolve(null);
    }
    let include, exclude;

    const publish_dates = new_uploads.map(video => (new Date(video.published_at)).getTime());
    const most_recent = Math.max(...publish_dates);

    let trans = db.transaction(["video", "history", "check_stamp", "filter"], "readwrite");
    let channel_id = new_uploads[0].channel_id;
    storage.filter.get_for_channel(trans, channel_id, (err, video_filters) => {
        if (err) {
            log_error(`Can't get filters for ${channel_id} in a check `, err);
            return;
        }
        // update latest date to match the publish date of the most recent
        // video. One second more since two videos uploaded during the
        // same second is treated as both "later than each other".
        storage.check_stamp.update(trans, channel_id, most_recent + 1000);

        [include, exclude] = filters.filter_videos(new_uploads, video_filters);
        new_uploads.forEach(e => delete e.tags);

        storage.video.add_list(trans, include);
        storage.history.add_list(trans, exclude);

        new_uploads.filter(video => !video.duration)
            .map(v => v.video_id)
            .forEach(fetch_duration);
    });

    return new Promise((resolve, reject) => {
        trans.oncomplete = () => resolve(include.length > 0 ? channel_id : null);
        trans.onabort = () => reject(Error("Failed to filter and store"));
    });
}

// fetch and update the duration of a video
function fetch_duration(video_id) {
    youtube_request.get_duration(video_id)
        .then(process_duration_result, err => {
            if (err === youtube_request.VIDEO_DOES_NOT_EXIST) {
                process_duration_result({ video_id, duration: "Deleted" });
            } else {
                log_error(err);
            }
        });

    function process_duration_result(duration_result) {
        let { video_id:vid, duration } = duration_result;
        if (vid !== video_id) {
            log_error("Youtube responded with different video id than requested");
            return;
        }
        let trans = db.transaction(["video", "history"], "readwrite");
        storage.update_duration(trans, video_id, duration, err => {
            if (!err) {
                // notify the ui about the duration
                events.notify.new_duration({
                    id: duration_result.video_id,
                    duration: duration_result.duration
                });
            }
        });
    }
}

function fetch_unfetched_durations() {
    let trans = db.transaction(["video", "history"]);
    find_and_fetch(storage.video_store(trans));
    find_and_fetch(storage.history_store(trans));

    function find_and_fetch(store) {
        // don't really care if this goes wrong, so no error handling
        store.index("duration").openCursor("").onsuccess = ev => {
            let cursor = ev.target.result;
            if (cursor && !cursor.value.duration) {
                fetch_duration(cursor.value.video_id);
                cursor.continue();
            }
        };
    }
}

function backfill_upload_playlist_ids() {
    let read_channels = db.transaction(["channel"], "readonly");
    storage.channel.get_all(read_channels, (err, channel_list) => {
        if (err) {
            log_error("Fatal: Can't get channel list for backfill", err);
            return;
        }
        for (let channel of channel_list) {
            if (typeof channel.upload_playlist_id === 'string') {
                continue;
            }
            youtube_request.get_playlist_id_for_upload(channel.id).then(playlist_id => {
                let write_back = db.transaction(["channel"], "readwrite");
                let cursor_req = storage.channel_store(write_back).index("id").openCursor(channel.id);
                cursor_req.onsuccess = ev => {
                    let cursor = ev.target.result;
                    cursor.value.upload_playlist_id = playlist_id;
                    cursor.update(cursor.value);
                    // fire and forget. Once this is stored it will be used in
                    // the next iteration
                }
            });
        }
    });
}

function gather_check_info(trans) {
    return new Promise((resolve, reject) => {
        storage.channel.get_all(trans, (err, channel_list) => {
            if (err) {
                return reject(err);
            }

            let info_promises = channel_list.map((channel, cb) => {
                return new Promise((resolve_info, reject_info) => {
                    util.cb_join([done => storage.check_stamp.get_for_channel(trans, channel.id, done),
                                  done => storage.filter.get_for_channel(trans, channel.id, done)],
                        (err, latest_date, filters) => {
                            if (err) {
                                return reject_info(err);
                            }
                            resolve_info({channel, latest_date, filters});
                        });
                });
            });
            resolve(Promise.all(info_promises));
        });
    });
}

function check_all () {
    let check = db.transaction(["channel", "check_stamp", "filter"], "readwrite");
    gather_check_info(check).then(info => {
        storage.update_last_check(db.transaction("config", "readwrite"));

        return Promise.all(info.map(({channel, latest_date, filters}) => {
            let promise;
            if (channel.upload_playlist_id) {
                promise = Promise.reject('not yet')
            } else {
                promise = check_using_activities(check, channel, latest_date, filters);
            }

            if (filters.some(filter => filter.inspect_tags)) {
                promise = promise.then(fetch_duration_and_tags);
            }

            return util.wrap_promise(promise.then(filter_and_store));
        }));
    }).then(check_result_list => {
        let uploaded = check_result_list
            .filter(e => e.success)
            .map(e => e.value)
            .filter(e => e !== null);
        if (uploaded.length > 0) {
            notify_new_uploads(uploaded);
        }
        for (let result of check_result_list) {
            if (!result.success) {
                log_error('Check failed', result.value)
            }
        }
    }).then(null, err => log_error('Check failed', err));
}

function check_using_activities(trans, channel, latest_date, filters) {
    return youtube_request.get_activities(channel, latest_date).then(response_json => {
        if (!response_json.hasOwnProperty("items")) {
            return [];
        }

        let new_uploads = response_json.items.filter(youtube_util.activity.is_upload);
        new_uploads.forEach(youtube_util.activity.normalize);
        return new_uploads;
    });
}

function fetch_duration_and_tags(video_list) {
    let extra_fetches = video_list.map(video => {
        return youtube_request.get_tags_and_duration(video.video_id)
            .then(({duration, tags}) => {
                video.duration = duration;
                video.tags = tags;
                return video;
            });
    });
    return Promise.all(extra_fetches);
}

function notify_new_uploads(uploaded_channels) {
    let trans = db.transaction(["video", "history", "channel"], "readonly");
    let channel_names = [];
    let videos, history;
    storage.video.get_all(trans, (_, vids) => {
        videos = vids;
    });
    storage.history.get_all(trans, (_, his) => {
        history = his;
    });
    const collect_title = (_, channel) => {
        channel_names.push(channel.title);
    };
    for (let channel_id of uploaded_channels) {
        storage.channel.get_by_id(trans, channel_id, collect_title);
    }
    trans.oncomplete = () => {
        button.update(videos.length);
        let config_trans = db.transaction("config", "readonly");
        notification.notify_new_upload(config_trans, channel_names);
        events.notify.all_videos(videos, history);
    };
}

function start_checking() {
    function check_cycle () {
        // check then start a timer according to current config
        check_all();
        fetch_unfetched_durations();

        let get_interval = db.transaction("config");
        config.get_one(get_interval, "interval", (err, interval) => {
            if (err) {
                log_error("Failed to get interval, " +
                          "defaulting to 10 min for this check", err);
                interval = 10;
            }
            timers.setTimeout(check_cycle, interval * 60 * 1000);
        });

        backfill_upload_playlist_ids();
    }
    // decide when to start the cycle
    let trans = db.transaction("config");
    config.get_one(trans, "interval", (err, interval) => {
        if (err) {
            log_error("Failed to get check interval setting. " +
                      "Defaulting to 10 min for this check", err);
            interval = 10;
        }
        config.get_one(trans, "last_checked", (err, last_checked) => {
            if (err) {
                log_error("Failed to get last_checked. Checking immediately.", err);
                last_checked = null;
            }
            const since_last = Date.now() - last_checked;
            const interval_mili = interval * 60 * 1000;
            if (!last_checked || since_last >= interval_mili) {
                // the check is past due, checking immediately
                check_cycle();
            } else if (since_last <= 0) {
                // system time would have to be altered for this to be possible
                // first check occurs after 1 period to avoid flooding
                timers.setTimeout(check_cycle, interval_mili);
            } else {
                // first check happens when the period finishes
                timers.setTimeout(check_cycle, interval_mili - since_last);
            }
        });
    });
}

function actual_init(cb=util.noop) {
    button.init(open_or_focus);
    notification.init(open_or_focus);
    storage.open((err, opened_db) => {
        if (err) {
            log_error("Fatal: Can't open database");
            fatal_error = "open-db-error";
            return cb(err);
        }
        db = opened_db;
        timers.setTimeout(() => cb(), 0);

        const get_vid_count = db.transaction("video", "readonly");
        storage.video.count(get_vid_count, (err, count) => {
            if (err) {
                log_error("Failed to get video count to update button", err);
                return;
            }
            button.update(count);
        });

        logger_init(err => {
            if (err) {
                log_error("Could not initialize logger. Logs won't be persisted", err);
            }
            start_checking();
        });
    });
}

browser.runtime.onInstalled.addListener(reason => {
    if (reason === "update") {
        events.once_new_receiver(() => events.notify.open_changelog());
    }
});

/*#BUILD_TIME_REPLACE_START*/
import run_development_tasks from "./development";
function init(cb=util.noop) {
    run_development_tasks(actual_init.bind(null, cb));
}
/*#BUILD_TIME_REPLACE_END*/

storage.initialize_db((err, first_ever_boot) => {
    events.once_new_receiver(() => {
        if (err) {
            log_error(err);
            events.notify.migration_failed_notice();
        }
    });
    init(err => {
        if (err) {
            return;
        }
        if (first_ever_boot) {
            browser.runtime.sendMessage("jetpack-data-please").then(reply => {
                if (reply) {
                    let trans = get_db().transaction(backup.import_all.store_dependencies, "readwrite");
                    backup.import_all(trans, reply, () => {
                        events.notify.migration_finished();
                    });
                } else {
                    events.notify.migration_finished();
                }
            });
        }
    });
});

// browser.notifications.create(null, {
//     "type": "basic",
//     "title": "YoutubeSubscriptionChecker",
//     "message": "extension loaded"
// });

export {
    get_db,
    check_all, // for debugging purposes
    fetch_unfetched_durations, // for debugging purposes
    notification,
    get_fatal_error,
    fatal_error_recovered,
    init
}
