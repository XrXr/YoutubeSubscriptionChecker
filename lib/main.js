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

const request = require("./api/request");
const storage = require("./core/storage");
const config = require("./config");
const filters = require("./core/filters");
const events = require("./events");
const button = require("./ui/button");
const notification = require("./ui/notification");
const util = require("./util");
const { log_error } = util;
const api_util = require("./api/util");

const hub_url = data.url("hub/home.html");

let db;  // will be set once db is opened

// try to focus on the hub page, omitting a tab
// return true if focus was successful
function focus_on_hub (omit) {
    for (let w of browserWindows) {
        let found = false;
        for (let t of w.tabs) {
            if (t === omit) {
                continue;
            }
            if (t.url === hub_url) {
                found = true;
                t.activate();
                break;
            }
        }
        if (found) {
            w.activate();
            return true;
        }
    }
    return false;
}

// remove all other hub tabs if omit tab is a hub tab
function remove_other (omit) {
    if (omit.url === hub_url) {
        for (let t of tabs) {  // iterate through all tabs
            if (t === omit) {
                continue;
            }
            if (t.url === hub_url) {
                t.close();
            }
        }
    }
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

function duplicate_listener (tab) {
    remove_other(tab);
}

function listener_registrar (tab) {
    tab.on("pageshow", duplicate_listener);
}

tabs.on("ready", listener_registrar);

require("sdk/page-mod").PageMod({
    include: hub_url,
    contentScriptFile: data.url("hub/app/bridge.js"),
    contentScriptWhen: "end",
    onAttach: worker => events.handle_basic_events(worker.port)
});

// Look for uploads in a channel's activities.
// when there are new uploads:
// - update the lastest date for appropriate channel
// - apply filters on new uploads
// - synchronously add new uploads to storage
// - asynchronously get video duration
//     when complete:
//       - update the video in storage
//       - notify ui about the duration
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

    let trans = db.transaction(["video", "check_stamp", "filter", "duration_fetch"], "readwrite");
    let channel_id = api_util.activity.get_channel_id(new_uploads[0]);
    storage.filters.get_for_channel(trans, channel_id, (err, video_filters) => {
        if (err) {
            console.error("Could not get channel while processing a check", err);
            return;
        }
        // update latest date to match the publish date of the most recent
        // video. One second more since two videos uploaded during the
        // same second is treated as both "later than each other".
        storage.update_check_stamp(trans, channel_id, most_recent + 1000);

        new_uploads.forEach(api_util.activity.normalize);
        [include, exclude] = filters.filter_videos(new_uploads, video_filters);
        new_uploads.forEach(e => delete e.tags);

        storage.video.add_list(trans, include);
        storage.video.add_history(trans, exclude);

        const duration_fetches = new_uploads.filter(video => !video.duration)
            .map(v => ({video_id: v.video_id}));

        storage.duration_fetch.add_list(trans, duration_fetches, err => {
            if (err) {
                console.error("Could not write duration fetches", err);
                return;
            }
            fetch_durations(duration_fetches);
        });
    });

    trans.oncomplete = () => cb(null, include.length > 0 ? channel_id : null);
    trans.onabort = () => cb(Error("processing aborted"));
}

// get duration for a list of {video_id}. Update video and remove pending
// fetch from db if successful
function fetch_durations(pending_fetches) {
    for (let e of pending_fetches) {
        request.get_duration(e.video_id).then(duration_result => {
            let { video_id, duration } = duration_result;
            let trans = db.transaction(["video", "history", "duration_fetch"],
                                       "readwrite");
            storage.update_duration(trans, video_id, duration);
            storage.duration_fetch.remove_one(video_id);
            // notify the ui about the duration
            events.notify.new_duration({
                id: duration_result.video_id,
                duration: duration_result.duration
            });
            // TODO: remove pending fetch from db if YT says video doesn't exist
        }, log_error).then(null, log_error);
    }
}

function check_all () {
    let check = db.transaction(["channel", "config"], "readwrite");
    storage.channel.get_all(check, (err, channel_list) => {
        if (err) {
            console.error("Fatal Error! Can't get channel list for check", err);
            return;
        }
        let promises = channel_list.map(channel => {
            let activities = request.get_activities(channel);
            // TODO: this isn't work right now. filters are in a different store
            if ((channel.filters || []).some(filter => filter.inspect_tags)) {
                let original_res;
                activities = activities.then(res => {
                    original_res = res;
                    if (!('items' in res)) {
                        return;
                    }

                    let full_fetches = res.items.filter(api_util.activity.is_upload)
                        .map(activity => {
                            return request.get_tags_and_duration(api_util.activity.get_video_id(activity))
                                .then(({duration, tags}) => {
                                    activity.duration = duration;
                                    activity.tags = tags;
                                });
                        });
                    return all(full_fetches);
                }).then(() => original_res);
            }

            return activities;
        });
        handle_check_results(promises);
        storage.update_last_check(check);
    });

}

function handle_check_results(request_promises) {
    let wrapped = request_promises.map(util.wrap_promise);
    all(wrapped).then(results => {
        for (let e of results) {
            if (!e.success) {
                log_error("Video check failed.", e.value);
            }
        }
        util.cb_settle(results.filter(e => e.success), (req_result, cb) => {
            process_channel_activities(req_result.value, cb);
        }, (_, process_results) => {
            let success_vals = process_results.filter(e => e.success).map(e => e.value);
            maybe_notify_new_upload(success_vals);
        });
    }, log_error).then(null, log_error);
}

function maybe_notify_new_upload(process_result) {
    // process_channel_activities returns null when there is no upload
    process_result = process_result.filter(e => e !== null);
    if (process_result.length <= 0) {
        return;
    }

    let trans = db.transaction(["video", "history"], "readonly");
    let channel_names = [];
    let videos, history;
    storage.video.get_all(trans, (_, vids) => {
        videos = vids;
    });
    storage.history.get_all(trans, (_, his) => {
        history = his;
    });
    for (let channel_id of process_result) {
        storage.channel.get_by_id(channel_id, (_, channel) => {
            channel_names.push(channel.title);
        });
    }
    trans.oncomplete = () => {
        button.update(videos.length);
        notification.notify_new_upload(channel_names);
        events.notify.all_videos(videos, history);
    };
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
    // if the same version is reinstalled, "loadReason" would be "downgrade"
    if (reason === "downgrade") {
        //core.transition.revert_storage_model();
    }
    if (reason === "shutdown") {
        return;
    }
    // since closing the only tab left would close the browser, this case is
    // handled specially
    if (tabs.length === 1) {
        for (let t of tabs) {
            if (t.url === hub_url) {
                // setting the url property doesn't work since the navigation
                // happens asynchronously
                tabs.open("about:blank");
                t.close();
                return;
            }
            return;
        }
    }
    // close all hub tabs on unload
    for (let w of browserWindows) {
        for (let t of w.tabs) {
            if (t.url === hub_url) {
                t.close();
            }
        }
    }
};

function start_checking() {
    function check_cycle () {
        // check then start a timer according to current config
        // config.ensure_valid();
        // core.ensure_valid();
        check_all();

        let get_interval = db.transaction("config");
        config.get_one(get_interval, "interval", (err, interval) => {
            if (err) {
                console.error("Failed to get interval, " +
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
            console.error("Failed to get interval, " +
                          "defaulting to 10 min for this check", err);
            interval = 10;
        }
        config.get_one(trans, "last_checked", (err, last_checked) => {
            if (err) {
                console.error("Failed to get last_checked. " +
                              "Checking imediately.", err);
                last_checked = null;
            }
            const since_last = (new Date()).getTime() - last_checked;
            const interval_mili = interval * 60 * 1000;
            if (!last_checked || since_last >= interval_mili) {
                // checking imediately
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

function init() {
    // config.ensure_valid();
    // core.ensure_valid();
    notification.init(open_or_focus);
    storage.open((err, opened_db) => {
        if (err) {
            // TODO: show something in the hub page about this
            console.error("Fatal error! Cannot open database.");
            return;
        }
        db = opened_db;

        const get_vid_count = db.transaction("video", "readonly");
        storage.video.count(get_vid_count, (err, count) => {
            // should init button even if initial get fails
            button.init(open_or_focus);
            if (err) {
                console.error("Failed to get video count to update button",
                              err);
                return;
            }
            button.update(count);
        });

        start_checking();
    });
}

if (self.loadReason === "upgrade") {
    const init_and_show_changelog = (err) => {
        if (err) {
            //TODO: migration failed. maybe show something so the user can
            //report bug?
        }
        init();
        events.once_new_target(() => events.notify.open_changelog());
    };

    if (storage.transition.v1InUse()) {
        storage.transition.v1Tov3(init_and_show_changelog);
    } else if (storage.transition.v2InUse()) {
        storage.transition.v2Tov3(init_and_show_changelog);
    } else {
        init_and_show_changelog();
    }
} else if (self.loadReason === "install") {
    storage.initialize_db(err => {
        if (err) {
            console.error(err);
            // TODO: right now the only error is db doesn't have all the stores
            // show something on the hub page
            return;
        }
        init();
    });
} else {
    init();
}

if ("YTCHECKERDEBUG" in require("sdk/system").env &&
    require("sdk/self").loadReason === "install") {
    storage.subscriptions = [
      {
        "title": "Philip DeFranco",
        "id": "UClFSU9_bUb4Rc6OYfTt5SPw",
        "latest_date": ((new Date()).getTime())
      },
      {
        "title": "response has no contentDetails",
        "id": "UCDbWmfrwmzn1ZsGgrYRUxoA",
        "latest_date": 1453513806000
      },
      {
        "title": "SourceFed I made the name long just to test",
        "id": "UC_gE-kg7JvuwCNlbZ1-shlA",
        "latest_date": ((new Date()).getTime() - 12000000000)
      },
      {
        "title": "Super Panic Frenzy",
        "id": "UCxsbRjOUPXeFGj7NSCOl8Cw",
        "latest_date": ((new Date()).getTime() - 12000000000)
      },
      {
        "title": "Northernlion",
        "id": "UC3tNpTOHsTnkmbwztCs30sA",
        "latest_date": ((new Date()).getTime() - 12000000000)
      },
    ];
    storage.subscriptions.push({title: "LinusTechTips",
                                   id: "UCXuqSBlHAE6Xw-yeJA0Tunw",
                                   latest_date: ((new Date()).getTime())});
    filters.update([{
        channel_title: "Super Panic Frenzy",
        video_title_pattern: "japan",
        video_title_is_regex: false,
        include_on_match: true,
        inspect_tags: true
    }]);
}

// var { Hotkey } = require("sdk/hotkeys");

// var showHotKey = Hotkey({
//   combo: "accel-p",
//   onPress: () => {
//     storage.subscriptions[0].latest_date = ((new Date()).getTime() - 12000000000);
//     check_all();
//   }
// });
