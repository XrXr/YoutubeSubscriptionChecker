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

function process_channel_activities (response_json, cb) {
    if (!response_json.hasOwnProperty("items")) {
        return cb(null, null);
    }

    let new_uploads = response_json.items.filter(youtube_util.activity.is_upload);

    if (new_uploads.length === 0) {
        return cb(null, null);
    }
    let include, exclude;

    const publish_dates = new_uploads.map(e => (new Date(youtube_util.activity.
        get_publish_date(e))).getTime());
    const most_recent = Math.max(...publish_dates);

    let trans = db.transaction(["video", "history", "check_stamp", "filter"], "readwrite");
    let channel_id = youtube_util.activity.get_channel_id(new_uploads[0]);
    storage.filter.get_for_channel(trans, channel_id, (err, video_filters) => {
        if (err) {
            log_error(`Can't get filters for ${channel_id} in a check `, err);
            return;
        }
        // update latest date to match the publish date of the most recent
        // video. One second more since two videos uploaded during the
        // same second is treated as both "later than each other".
        storage.check_stamp.update(trans, channel_id, most_recent + 1000);
        new_uploads.forEach(youtube_util.activity.normalize);
        [include, exclude] = filters.filter_videos(new_uploads, video_filters);
        new_uploads.forEach(e => delete e.tags);

        storage.video.add_list(trans, include);
        storage.history.add_list(trans, exclude);

        new_uploads.filter(video => !video.duration)
            .map(v => v.video_id)
            .forEach(fetch_duration);
    });

    trans.oncomplete = () => cb(null, include.length > 0 ? channel_id : null);
    trans.onabort = () => cb(Error("processing aborted"));
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

function check_all () {
    let check = db.transaction(["channel", "config", "check_stamp", "filter"], "readwrite");
    storage.channel.get_all(check, (err, channel_list) => {
        if (err) {
            log_error("Fatal: Can't get channel list for check", err);
            return;
        }

        let promises = channel_list.map(channel => new Promise((resolve, reject) => {
            // get timestamp for latest video and the filters for a channel,
            // then send out requests accordingly
            util.cb_join([done => storage.check_stamp.get_for_channel(check, channel.id, done),
                          done => storage.filter.get_for_channel(check, channel.id, done)],
                (err, latest_date, filters) => {
                    if (err) {
                        return reject(err);
                    }
                    let fetch = youtube_request.get_activities(channel, latest_date);
                    if (filters.some(filter => filter.inspect_tags)) {
                        fetch = fetch_more(fetch);
                    }
                    fetch.then(resolve, reject);
                });
        }));
        handle_check_results(promises);
        storage.update_last_check(check);
    });

    // return a new promise which fetches video duration and tags in addition
    function fetch_more(activity_fetch) {
        let res_ref;
        return activity_fetch.then(res => {
            res_ref = res;
            if (!('items' in res)) {
                return;
            }

            let full_fetches = res.items.filter(youtube_util.activity.is_upload)
                .map(activity => {
                    let video_id = youtube_util.activity.get_video_id(activity);
                    return youtube_request.get_tags_and_duration(video_id)
                        .then(({duration, tags}) => {
                            activity.duration = duration;
                            activity.tags = tags;
                        });
                });
            return Promise.all(full_fetches);
        }).then(() => res_ref);
    }
}

function handle_check_results(request_promises) {
    let wrapped = request_promises.map(util.wrap_promise);
    Promise.all(wrapped).then(results => {
        for (let e of results) {
            if (!e.success) {
                log_error("Video check failed", e.value);
            }
        }
        util.cb_settle(results.filter(e => e.success), (req_result, cb) => {
            process_channel_activities(req_result.value, cb);
        }, (_, process_results) => {
            let uploaded = process_results
                .filter(e => e.success)
                .map(e => e.value)
                .filter(e => e !== null);
            if (uploaded.length > 0) {
                notify_new_uploads(uploaded);
            }
        });
    }, log_error).then(null, log_error);
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

function shuffle(arr) {
    for (let i = arr.length - 1; i >= 1; i--) {
        let j = Math.trunc(Math.random() * (i + 1))
        let tmp = arr[i];
        arr[i] = arr[j];
        arr[j] = tmp;
    }
}


let refreshing = false;
async function refresh_all_videos () {
    if (refreshing) {
        return;
    }
    refreshing = true;
    let refresh_videos = refresh_all_videos_body(storage.video);
    let refresh_history = refresh_all_videos_body(storage.history);
    await refresh_videos;
    await refresh_history;
    refreshing = false;
}

async function refresh_all_videos_body(store) {
    try {
        let updated_channel = new Set();
        let db = get_db();
        let trans = db.transaction(["channel", "video", "history"], "readwrite");
        let videos = await get_all_videos(trans);
        shuffle(videos); // so that even if we only get update a few batches before the user quits the browser, eventually we got everything
        const batch_size = youtube_request.get_video_info.batch_size;
        for (let slice_start = 0; slice_start < videos.length; slice_start += batch_size) {
            let videoSlice = videos.slice(slice_start, slice_start + batch_size);
            let fresh_video_response = await youtube_request.get_video_info(videoSlice.map(v => v.video_id));
            let update_trans = db.transaction(["channel", "video", "history"], "readwrite");
            for (let video of fresh_video_response) {
                store.update_one(update_trans, video, (err) => {
                    if (err) {
                        log_error("failed to store updated video", err, video);
                    }
                });
                if (video.channel_id && video.channel_title) {
                    if (!updated_channel.has(video.channel_id)) {
                        updated_channel.add(video.channel_id);
                        storage.channel.update_title(update_trans, video.channel_id, video.channel_title, err => {
                            if (err) {
                                log_error("failed to update channel title", err, video);
                            }
                        });
                    }
                }
            }
        }
    } catch (err) {
        log_error("refresh failed", err);
    }

    function get_all_videos(trans) {
        return new Promise((resolve, reject) => {
            store.get_all(trans, (err, videos) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(videos);
                }
            })
        });
    }
}

window.refresh_all_videos = refresh_all_videos; // for debugging

function get_check_interval(trans, cb) {
    let get_interval = db.transaction("config");
    config.get_one(get_interval, "interval", (err, interval) => {
        if (err) {
            log_error("Failed to get interval, " +
                      "defaulting to 10 min for this check", err);
            interval = 10;
        }
        if (interval < 0) {
            interval = 10;
        }
        if (interval > 28800) {
            interval = 28800;
        }
        cb(null, interval);
    });
}

function start_checking() {
    function check_cycle () {
        // check then start a timer according to current config
        refresh_all_videos();
        check_all();
        fetch_unfetched_durations();

        let get_interval = db.transaction("config");
        config.get_one(get_interval, "interval", (err, interval) => {
            if (err) {
                log_error("should be unreachable");
                interval = 10;
            }
            timers.setTimeout(check_cycle, interval * 60 * 1000);
        });
    }
    // decide when to start the cycle
    let trans = db.transaction("config");
    config.get_one(trans, "interval", (err, interval) => {
        if (err) {
            log_error("should be unreachable");
            interval = 10;
        }
        config.get_one(trans, "last_checked", (err, last_checked) => {
            if (err) {
                log_error("Failed to get last_checked. Checking immediately.", err);
                last_checked = null;
            }
            const since_last = Date.now() - last_checked;
            const interval_mili = interval * 60 * 1000;
            let timeout;
            if (!last_checked || since_last >= interval_mili) {
                // the check is past due, checking immediately
                timeout = 0;
            } else if (since_last <= 0) {
                // system time would have to be altered for this to be possible
                // first check occurs after 1 period to avoid flooding
                timeout = interval_mili;
            } else {
                // first check happens when the period finishes
                timeout = interval_mili - since_last;
            }
            timers.setTimeout(check_cycle, timeout);
            console.info(`Time until first check: ${timeout}s`);
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

browser.runtime.onInstalled.addListener(details => {
    if (details.reason === "update") {
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
