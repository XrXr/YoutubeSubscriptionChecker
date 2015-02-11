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
const panels = require("sdk/panel");
const { storage } = require("sdk/simple-storage");
const self = require("sdk/self");

const request = require("api/request");
const core = require("core/storage");
const config = require("config");
const filters = require("core/filters");
const events = require("events");
const button = require("ui/button");
const notification = require("ui/notification");
const util = require("util");
const { log_error } = util;
const api_util = require("api/util");

const hub_url = data.url("hub/home.html");

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
function process_channel_activities (response_json) {
    if (response_json.hasOwnProperty("items")) {
        let new_uploads = response_json.items.
            filter(api_util.activity.is_upload);
        if (new_uploads.length > 0) {
            let channel = core.channel.get_by_id(
                api_util.activity.get_channel_id(new_uploads[0]));

            let most_recent = (new Date(api_util.activity.
                                        get_publish_date(new_uploads[0]))
                              ).getTime();
            for (let upload of new_uploads) {
                let date = (new Date(api_util.activity.get_publish_date(upload))
                           ).getTime();
                if (date > most_recent) {
                    most_recent = date;
                }
            }
            // update latest date to match the publish date of the most recent
            // video. One second more since two videos uploaded during the
            // same second is treated as both "later than each other".
            channel.latest_date = most_recent + 1000;

            new_uploads.map(api_util.activity.normalize);
            let [include, exclude] = filters.filter_videos(new_uploads,
                                                           channel.filters);
            include.map(core.video.add);
            exclude.map(core.video.add_history);

            let all_new_uploads = include.map(request.get_duration).
                                  concat(exclude.map(request.get_duration));
            for (let element of all_new_uploads) {
                element.then(duration_result => {
                    let { video_id, duration } = duration_result;
                    // update the duration of the video in storage
                    core.video.update_duration(video_id, duration);
                    // notify the ui about the duration
                    events.notify.new_duration({
                        id: duration_result.video_id,
                        duration: duration_result.duration
                    });
                }, log_error).then(null, log_error);
            }
            if (include.length > 0) {  // only count when videos pass filters
                return channel;
            }
        }
    }
    return null;
}

function check_all () {
    var promises = core.channel.get_all().map(request.get_activities);
    storage.last_checked = (new Date()).getTime();
    let wrapped = promises.map(util.wrap_promise);
    all(wrapped).then(results => {
        // foldl
        let processed = results.reduce((previous, current) => {
            if (current[0] === true) {
                return previous.concat(process_channel_activities(current[1]));
            }
            log_error("Video check failed.", current[1]);
            return previous;
        }, []);
        button.update(core.video.get_count());
        // process_channel_activities returns null when there is no upload
        processed = processed.filter(e => e !== null);
        if (processed.length > 0) {
            notification.notify_new_upload(processed);
            events.notify.all_videos();
        }
    }, log_error).then(null, log_error);
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
        core.transition.revert_storage_model();
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

if (self.loadReason === "upgrade" ||
    core.transition.legacy_in_use()) {
    core.transition.update_storage_model();
}
if (self.loadReason === "upgrade") {
    events.once_new_target(() => events.notify.open_changelog());
}
config.ensure_valid();
core.ensure_valid();
notification.init(open_or_focus);
button.init(open_or_focus);
button.update(core.video.get_count());

// if (require("sdk/self").loadReason === "install") {
//     let ss = require("sdk/simple-storage");
//     core.ensure_valid();
//     config.ensure_valid();
//     storage.subscriptions = [
//       {
//         "title": "Philip DeFranco",
//         "id": "UClFSU9_bUb4Rc6OYfTt5SPw",
//         "latest_date": ((new Date()).getTime())
//       },
//       {
//         "title": "SourceFed I made the name long just to test",
//         "id": "UC_gE-kg7JvuwCNlbZ1-shlA",
//         "latest_date": ((new Date()).getTime() - 12000000000)
//       },
//       {
//         "title": "Trump",
//         "id": "UCsQnAt5I56M-qx4OgCoVmeA",
//         "latest_date": ((new Date()).getTime() - 12000000000)
//       },
//       {
//         "title": "Northernlion",
//         "id": "UC3tNpTOHsTnkmbwztCs30sA",
//         "latest_date": ((new Date()).getTime() - 12000000000)
//       }
//     ];
//     storage.subscriptions.push({title: "LinusTechTips",
//                                    id: "UCXuqSBlHAE6Xw-yeJA0Tunw",
//                                    latest_date: ((new Date()).getTime())});
//     filters.update([{
//         channel_title: "Northernlion",
//         video_title_pattern: "long war",
//         video_title_is_regex: false,
//         include_on_match: false
//     }]);
// }

(() => {
    let { storage } = require("sdk/simple-storage");
    function check_cycle () {
        // check then start a timer according to current config
        config.ensure_valid();
        core.ensure_valid();
        check_all();
        timers.setTimeout(check_cycle, config.get_one("interval") * 60 * 1000);
    }
    // decide when to start the cycle
    const check_interval = config.get_one("interval") * 60 * 1000;
    const since_last = (new Date()).getTime() - storage.last_checked;
    if (storage.last_checked === undefined || since_last >= check_interval) {
        // checking imediately
        check_cycle();
    } else if (since_last <= 0) {
        // system time would have to be altered for this to be possible
        // first check occurs after 1 period to avoid flooding
        timers.setTimeout(check_cycle, check_interval);
    } else {
        // first check happens when the period finishes
        timers.setTimeout(check_cycle, check_interval - since_last);
    }
}).call();

// var { Hotkey } = require("sdk/hotkeys");

// var showHotKey = Hotkey({
//   combo: "accel-p",
//   onPress: () => {
//     storage.subscriptions[0].latest_date = ((new Date()).getTime() - 12000000000);
//     check_all();
//   }
// });