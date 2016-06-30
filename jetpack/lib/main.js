/*
This Source Code Form is subject to the terms of the
Mozilla Public License, v. 2.0.
If a copy of the MPL was not distributed with this file,
You can obtain one at http://mozilla.org/MPL/2.0/.
Author: XrXr
*/
const { data } = require("sdk/self");
const tabs = require("sdk/tabs");
const timers = require("sdk/timers");
const { browserWindows } = require("sdk/windows");
const { all } = require("sdk/core/promise");
const self = require("sdk/self");

let db;  // will be set once db is opened
let fatal_error;  // puts hub page into a fail state when set
// pagemod workers that attach before db opens. See `actual_init()` and pagemod
let pre_db_worker_buffer = new Set();

exports.get_db = get_db;

function get_db() {
    return db;
}

const request = require("./api/request");
const storage = require("./core/storage");
const migration = require("./core/migration");
const config = require("./config");
const filters = require("./core/filters");
const events = require("./events");
const button = require("./ui/button");
const notification = require("./ui/notification");
const util = require("./util");
const { initialize: logger_init, log_error, assert } = require("./logger");
const api_util = require("./api/util");

const hub_url = data.url("hub/home.html");

/*#BUILD_TIME_REPLACE_START*/
function init(cb=util.noop) {
    if ("YTCHECKERDEBUG" in require("sdk/system").env) {
        require("./development").run(actual_init.bind(null, cb));
    } else {
        actual_init(cb);
    }
}
/*#BUILD_TIME_REPLACE_END*/

// try to focus on the hub page, omitting a tab
// return true if focus was successful
function focus_on_hub (omit) {
    for (let win of browserWindows) {
        for (let tab of win.tabs) {
            if (tab === omit) {
                continue;
            }
            if (tab.url === hub_url) {
                win.activate();
                tab.activate();
                return true;
            }
        }
    }
    return false;
}

// Opens the hub page in a new tab or focus on it. Searches through all opened
// windows. Return whether a new hub tab was opened;
function open_or_focus () {
    if (!focus_on_hub()) {
        tabs.open(hub_url);
        return true;
    }
    return false;
}

// listen for navigations of a tab and close all other hub pages when it
// navigates to the hub page
function keep_single(tab) {
    // pageshow fires for back/forward navigation from cache in addition to
    // normal loads
    tab.on("pageshow", function close_other_hubs (tab) {
        if (tab.url === hub_url) {
            for (let t of tabs) {
                if (t === tab) {
                    continue;
                }
                if (t.url === hub_url) {
                    t.close();
                }
            }
        }
    });
}

tabs.on("open", keep_single);
for (let t of tabs) {
    keep_single(t);
}

require("sdk/page-mod").PageMod({
    include: hub_url,
    contentScriptFile: data.url("hub/app/bridge.js"),
    contentScriptWhen: "end",
    onAttach(worker) {
        if (db) {
            init_hub(worker);
        } else {
            pre_db_worker_buffer.add(worker);
            worker.on("detach", () => pre_db_worker_buffer.delete(worker));
        }
    }
});

function init_hub(worker) {
    if (fatal_error) {
        worker.port.emit("fail-state", fatal_error);
        handle_recovery_events(worker.port);
        return;
    }
    events.handle_basic_events(worker.port);
}

function process_channel_activities (response_json, cb) {
    if (!response_json.hasOwnProperty("items")) {
        return cb(null, null);
    }

    let new_uploads = response_json.items.filter(api_util.activity.is_upload);

    if (new_uploads.length === 0) {
        return cb(null, null);
    }
    let include, exclude;

    const publish_dates = new_uploads.map(e => (new Date(api_util.activity.
        get_publish_date(e))).getTime());
    const most_recent = Math.max(...publish_dates);

    let trans = db.transaction(["video", "history", "check_stamp", "filter"], "readwrite");
    let channel_id = api_util.activity.get_channel_id(new_uploads[0]);
    storage.filter.get_for_channel(trans, channel_id, (err, video_filters) => {
        if (err) {
            log_error(`Can't get filters for ${channel_id} in a check `, err);
            return;
        }
        // update latest date to match the publish date of the most recent
        // video. One second more since two videos uploaded during the
        // same second is treated as both "later than each other".
        storage.check_stamp.update(trans, channel_id, most_recent + 1000);
        new_uploads.forEach(api_util.activity.normalize);
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
    request.get_duration(video_id)
        .then(process_duration_result, err => {
            if (err === request.VIDEO_DOES_NOT_EXIST) {
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
                    let fetch = request.get_activities(channel, latest_date);
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

            let full_fetches = res.items.filter(api_util.activity.is_upload)
                .map(activity => {
                    let video_id = api_util.activity.get_video_id(activity);
                    return request.get_tags_and_duration(video_id)
                        .then(({duration, tags}) => {
                            activity.duration = duration;
                            activity.tags = tags;
                        });
                });
            return all(full_fetches);
        }).then(() => res_ref);
    }
}

function handle_check_results(request_promises) {
    let wrapped = request_promises.map(util.wrap_promise);
    all(wrapped).then(results => {
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

function handle_recovery_events(port) {
    if (fatal_error === "open-db-error") {
        port.on("drop-db", function () {
            assert(!db);

            storage.drop_db(err => {
                if (err) {
                    log_error("Could not drop db", err);
                    return port.emit("drop-db-error");
                }
                fresh_install_init(err => {
                    if (err) {
                        log_error("Could not init after dropping db", err);
                        return port.emit("drop-db-error");
                    }
                    fatal_error = null;
                    port.emit("drop-db-success");
                });
            });
        });
    }
}

function fresh_install_init(cb=util.noop) {
    storage.initialize_db(err => {
        if (err) {
            log_error(err);
            fatal_error = "open-db-error";
            return cb(err);
        }
        init(cb);
    });
}

// register listener for the button in Add-on Manager
require("sdk/simple-prefs").on("open_settings", () => {
    if (open_or_focus()) {  // if a new hub tab is opened
        events.once_new_target(() => events.notify.open_settings());
        return;
    }
    events.notify.open_settings();
});

exports.onUnload = reason => {
    if (db) {
        db.close();
    }
    if (reason === "shutdown") {
        return;
    }
    // close all hub tabs on unload
    for (let t of tabs) {
        if (t.url === hub_url) {
            if (tabs.length === 1) {
                // closing the last tab would terminate Firefox
                tabs.open("about:blank");
            }
            t.close();
        }
    }
};

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
            // should init button even if initial get fails
            button.init(open_or_focus);
            if (err) {
                log_error("Failed to get video count to update button", err);
                return;
            }
            button.update(count);
        });

        if (pre_db_worker_buffer) {
            pre_db_worker_buffer.forEach(init_hub);
            pre_db_worker_buffer = null;
        }

        logger_init(err => {
            if (err) {
                log_error("Could not initialize logger. Logs won't be persisted", err);
            }
            start_checking();
        });
    });
}

{
    const show_fatal_error = err => {
        button.init(open_or_focus);
        fatal_error = "open-db-error";
        log_error(err);
    };

    const init_and_show_changelog = err => {
        init();
        events.once_new_target(() => {
            if (err) {
                events.notify.migration_failed_notice();
            }
            if (self.loadReason === "upgrade") {
                events.notify.open_changelog();
            }
        });
    };

    // Note that the add-on might need to migrate on install, since Firefox
    // doesn't delete simple-storage data when an add-on is uninstalled
    migration.decide_migration_path((err, migration_proc) => {
        if (err) {
            return show_fatal_error(err);
        }
        if (migration_proc) {
            migration_proc(err => {
                if (err instanceof storage.DBSetupError) {
                    // setting up object stores have failed
                    show_fatal_error(err);
                } else {
                    // migration failed
                    init_and_show_changelog(err);
                }
            });
        } else {
            init_and_show_changelog();
        }
    });
}
