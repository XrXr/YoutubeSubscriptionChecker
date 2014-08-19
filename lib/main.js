/*
This Source Code Form is subject to the terms of the
Mozilla Public License, v. 2.0.
If a copy of the MPL was not distributed with this file,
You can obtain one at http://mozilla.org/MPL/2.0/.
Author: XrXr
*/
const data = require("sdk/self").data;
const tabs = require("sdk/tabs");
const ss = require("sdk/simple-storage");
const timers = require("sdk/timers");
const { browserWindows } = require("sdk/windows");
const { all } = require("sdk/core/promise");
const panels = require("sdk/panel");

const events = require("events");
const button = require("ui/button");
const notification = require("ui/notification");

const hub_url = data.url("hub/home.html");

function focus_on_hub (omit){
    // try to focus on the hub page
    // return true if focus was successful
    // pass in a tab object to be omitted
    var browserWindows = require("sdk/windows").browserWindows;
    var url = data.url("hub/home.html");
    for (let w of browserWindows){
        let found = false;
        for (let t of w.tabs){
            if (t == omit){
                continue;
            }
            if (t.url == url){
                found = true;
                t.activate();
                break;
            }
        }
        if (found){
            w.activate();
            return true;
        }
    }
    return false;
}

function remove_other (omit){
    // remove all other tab if omit tab is a hub tab
    if (omit.url == hub_url){
        for (let w of browserWindows){
            for (let t of w.tabs){
                if (t == omit){
                    continue;
                }
                if (t.url == url){
                    t.close();
                }
            }
        }
    }
}

function open_or_focus() {
    // Open a new tab with the hub in it, or focus on it
    // Look through all the tabs in all the windows
    if (!focus_on_hub()){
        tabs.open(data.url("hub/home.html"));
    }
}


function duplicate_listener (tab) {
    remove_other(tab);
}

function listener_registrar (tab) {
    tab.on("pageshow", duplicate_listener);
}

tabs.on("ready", listener_registrar);

require("sdk/page-mod").PageMod({
    include: data.url("hub/home.html"),
    contentScriptFile: data.url("hub/app/bridge.js"),
    contentScriptWhen: "end",
    onAttach: worker => event.handle_basic_events(worker.port)
});

// TODO: access storage directly
function insert_duration (duration_result) {
    // Takes an object that is a result of get_duration then insert
    // the duration into the right video object
    function insert (video) {
        if (video.id.videoId == duration_result.video_id){
            video.duration = duration_result.duration;
            return true;
        }
        return false;
    }
    ss.storage.videos[duration_result.channel_id].some(insert);
    ss.storage.history.some(insert);
}

// Look for uploads in a channel's activities. Synchronously add videos to
// the video storage, then asynchronously get their duration
// TODO: this function do too much
function process_channel_activities(response_json) {
    if (response_json.hasOwnProperty("items")){
        let new_uploads = response_json.items.filter(
            a => a.contentDetails.upload !== undefined);
        if (new_uploads.length > 0) {
            let channel = core.channel.get_by_id(
                new_uploads[0].snippet.channelId);

            let most_recent = (new Date(new_uploads[0]
                              .snippet.publishedAt)).getTime();
            for (let element of new_uploads){
                let date = (new Date(element.snippet.publishedAt)).getTime();
                if (date > most_recent){
                    most_recent = date;
                }
            }
            // update latest date to match the publish date of the most recent
            // video. One second more since two videos uploaded during the
            // same second is treated as both "later than each other".
            channel.latest_date = most_recent + 1000;

            let empty_duration = new_uploads.map(function(e) {
                e.duration = "";
                e.id = {};
                e.id.videoId = e.contentDetails.upload.videoId;
                return e;
            });
            let [include, exclude] = filter_videos(new_uploads,
                                                   channel.filters);
            include.map(core.video.add);
            exclude.map(add_history);

            let all_new_uploads = include.map(get_duration).
                                  concat(exclude.map(get_duration));
            for (let element of all_new_uploads) {
                element.then(duration_result => {
                    insert_duration(duration_result);
                    events.brodcast.new_duration({
                        id: duration_result.video_id,
                        duration: duration_result.duration
                    });
                }, console.log).then(null, console.log);
            }
            if (include.length > 0) {
                return channel;
            }
        }
    }
    return null;
}

function check_all() {
    var promises = ss.storage.subscriptions.map(get_activities);
    ss.storage.last_checked = (new Date()).getTime();
    let wrapped = promises.map(wrap_promise);
    all(wrapped).then(results => {
        // foldl
        let processed = results.reduce((previous, current, index) => {
            if (current[0] === true){
                return previous.concat(process_channel_activities(current));
            }
            console.log("Video check failed.", current[1], "channel name:",
                ss.storage.subscriptions[index].title);
            return previous;
        }, []);
        button.update(core.video.get_all()[0].length);
        // process_video_search_result returns null when there is no upload
        processed = processed.filter(e => e !== null);
        if (processed.length > 0) {
            notification.notify_new_upload(processed);
            events.brodcast.all_videos();
        }
    }, console.log).then(null, console.log);
}

if (require("sdk/self").loadReason == "install"){
    ensure_configs();
    ensure_configs();
    ss.storage.videos = {};
    ss.storage.subscriptions = [];
    ss.storage.subscriptions = [
      {
        "title": "Philip DeFranco",
        "id": "UClFSU9_bUb4Rc6OYfTt5SPw",
        "latest_date": ((new Date()).getTime())
      },
      {
        "title": "SourceFed I made the name long just to test",
        "id": "UC_gE-kg7JvuwCNlbZ1-shlA",
        "latest_date": ((new Date()).getTime() - 12000000000)
      },
      {
        "title": "Trump",
        "id": "UCsQnAt5I56M-qx4OgCoVmeA",
        "latest_date": ((new Date()).getTime() - 12000000000)
      },
      {
        "title": "Northernlion",
        "id": "UC3tNpTOHsTnkmbwztCs30sA",
        "latest_date": ((new Date()).getTime() - 12000000000)
      }
    ];
    ss.storage.subscriptions.push({title: "LinusTechTips", id: "UCXuqSBlHAE6Xw-yeJA0Tunw",
                                    latest_date: ((new Date()).getTime())});
    update_filters([Filter('Northernlion', "super show", false, false)]);
}

(function() {
    function check_cycle() {
        // update the interval then check
        check_all();
        timers.setTimeout(check_cycle, ss.storage.config.interval * 60 * 1000);
    }
    let check_interval = ss.storage.config.interval * 60 * 1000;
    const since_last = (new Date()).getTime() - ss.storage.last_checked;
    if (ss.storage.last_checked === undefined || since_last >= check_interval){
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
})();

let panel = panels.Panel({
  width: 660,
  height: 500,
  contentURL: data.url("hub/panel.html"),
  contentScriptFile: data.url("hub/app/content.js"),
});

events.handle_basic_events(panel.port);

exports.onUnload = function(reason) {
    if (reason === "shutdown"){
        return;
    }
    // close all hub tabs on unload
    for (let w of require("sdk/windows").browserWindows){
        for (let t of w.tabs){
            if (t.url == data.url("hub/home.html")){
                t.close();
            }
        }
    }
};

// var { Hotkey } = require("sdk/hotkeys");

// var showHotKey = Hotkey({
//   combo: "accel-p",
//   onPress: function() {
//     ss.storage.subscriptions[0].latest_date = ((new Date()).getTime() - 12000000000);
//     check_all();
//   }
// });