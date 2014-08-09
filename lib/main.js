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
const { defer, all } = require("sdk/core/promise");
const panels = require("sdk/panel");
var hub_worker = null;

function Filter (channel_name, matcher, is_regex, include) {
    if (!(this instanceof Filter)){
        return new Filter(channel_name, matcher, is_regex, include);
    }
    this.id = get_channel_by_name(channel_name).id;
    this.channel = channel_name;
    this.match = matcher.toLowerCase();
    this.is_regex = is_regex;
    this.include = include;
}

function filter_videos (videos, filters) {
    // put a group of videos from the same channel through
    // filters, return [[include], [exclude]]
    let include = videos;
    let exclude = [];
    filters = filters || [];
    for(let filter of filters){
        let regex;
        if (filter.is_regex){
            regex = new RegExp(filter.match, "i");
        }
        let result = [];
        for (let i = include.length - 1; i >= 0; i--){
            let passed;
            let title = videos[i].snippet.title.toLowerCase();
            passed = regex ? regex.test(title) :
                             title.contains(filter.match);
            if (filter.include){
                passed = !passed;
            }
            if (passed){
                result.unshift(videos[i]);
                include.splice(i, 1);
            }
        }
        exclude = exclude.concat(result);
    }
    return [include, exclude];
}

function update_filters (filters) {
    // overwrite all the filters
    for (let channel of ss.storage.subscriptions){
        channel.filters = [];
    }
    filters = filters.map(f => Filter(f.channel, f.match, f.regex, f.include));
    for (let filter of filters){
        let channel = get_channel_by_id(filter.id);
        channel.filters.push(filter);
    }
}

function get_all_filters () {
    let result = [];
    for (let channel of ss.storage.subscriptions){
        channel.filters = channel.filters || [];
        result.push(...channel.filters);
    }
    return result;
}

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
    var browserWindows = require("sdk/windows").browserWindows;
    var url = data.url("hub/home.html");
    if (omit.url == url){
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

function ensure_storage() {
    // call this to ensure all the storage objects are inplace
    ss.storage.subscriptions = ss.storage.subscriptions || [];
    ss.storage.videos = ss.storage.videos || {};
    ss.storage.history = ss.storage.history || [];
}

function _type_correction (obj, key, expect, fall_back) {
    if (obj){
        if (typeof obj[key] !== expect){
            obj[key] = fall_back;
        }
    }
}

function _isNumber(n) {
    return !isNaN(parseFloat(n)) && isFinite(n);
}

function ensure_configs() {
    if (ss.storage.config === undefined){
        ss.storage.config = {
            interval: 10,
            play_sound: true,
            in_background: true,
            animations: true
        };
    } else {
        ss.storage.config.interval = ss.storage.config.interval || 10;
        _type_correction(ss.storage.config, "interval", "number", 10);
        _type_correction(ss.storage.config, "play_sound", "boolean", true);
        _type_correction(ss.storage.config, "in_background", "boolean", true);
        _type_correction(ss.storage.config, "animations", "boolean", true);
    }
}

function update_config (config) {
    // sanitize config
    if (_isNumber(config.interval)){
        config.interval = Number(config.interval);
        if (config.interval < 5){
            config.interval = 5;
        }
    }else{
        config.interval = 10;
    }
    update_filters(config.filters);
    delete config.filters;
    ss.storage.config = config;
    ensure_configs();
}

function open_or_focus() {
    // Open a new tab with the hub in it, or focus on it
    // Look through all the tabs in all the windows
    if (!focus_on_hub()){
        tabs.open(data.url("hub/home.html"));
    }
}

function open_video (video) {
    tabs.open({
        url: "https://www.youtube.com/watch?v=" + video.id.videoId,
        inBackground: ss.storage.config.in_background
    });
}

require("sdk/page-mod").PageMod({
    include: data.url("hub/home.html"),
    contentScriptFile: data.url("hub/app/content.js"),
    contentScriptWhen: "end",
    onAttach: function(worker) {
        hub_worker = worker;
        worker.port.emit("subscribed-channels", ss.storage.subscriptions);
        ensure_configs();
        worker.port.emit("config", ss.storage.config, get_all_filters());
        worker.port.on("search-channel", search_channel);
        worker.port.on("add-channel", add_channel);
        worker.port.on("remove-channel", remove_channel);
        worker.port.on("get-videos", function(channel_id) {
            worker.port.emit("videos", [get_all_videos(), ss.storage.history || []]);
        });
        worker.port.on("remove-video", function(video, skip) {
            remove_video(video);
            add_history(video);
            if (skip){
                return;
            }
            open_video(video);
        });
        worker.port.on("open-video", open_video);
        worker.port.on("update_config", update_config);
    }
});

function duplicate_listener (tab) {
    remove_other(tab);
}

function listener_registrar (tab) {
    tab.on("pageshow", duplicate_listener);
}

tabs.on("ready", listener_registrar);

exports.onUnload = function() {
    //close all hub tabs on unload
    for (let w of require("sdk/windows").browserWindows){
        for (let t of w.tabs){
            if (t.url == data.url("hub/home.html")){
                t.close();
            }
        }
    }
};

function api_url(method, param) {
    let api_key = "AIzaSyB6mi40O6WOd17yjeYkK-y5lIU4FvoR8fo";
    let url = "https://www.googleapis.com/youtube/v3/"+method+'?';
    for (var key in param){
        if (param.hasOwnProperty(key)) {
            url = url + key + "=" + param[key] + "&";
        }
    }
    url += "key=" + api_key;
    return url;
}

function make_request_promise(url) {
    let deferred = defer();
    require("sdk/request").Request({
        url: url,
        onComplete: function(response) {
            if (response.status == 200){
                deferred.resolve(response.json);
            } else {
                deferred.reject(response);
            }
        }
    }).get();
    return deferred.promise;
}

function nice_duration(ISO_8601_string) {
    let result = ISO_8601_string.replace("PT", "")
                   .replace("M", ":").replace("S", "");
    let after = result.search('H') != -1 ?
        result.slice(result.search('H') + 1) : result;
    let colon = after.indexOf(":");
    if (colon == -1){
        return after.length == 1 ? "00:0" + after : "00:" + after;
    }
    if (colon == 1){
        after = "0" + after;
        colon += 1;
    }
    if (after.length - 2 == colon) {
        after = after.replace(":", ":0");
    }else if (after.length - 1 == colon){
        after += "00";
    }
    return result.search('H') != -1 ?
        result.slice(0, result.search('H')) + ":" + after : after;
}

function get_all_videos() {
    var videos = [];
    for (var key in ss.storage.videos){
        if (ss.storage.videos.hasOwnProperty(key)) {
            videos.push(...ss.storage.videos[key]);
        }
    }
    return videos;
}

function add_history (video) {
    ss.storage.history = ss.storage.history || [];
    if (ss.storage.history.length >= 50){
        ss.storage.history.pop();
    }
    ss.storage.history.unshift(video);
}

function get_duration(video) {
    // get duration of a video resource asynchronously
    // return an object with channel_id, video_id, and duration
    let deferred = defer();
    video.duration = "";
    let api_arguments = {
        part: "contentDetails",
        id: video.id.videoId,
    };
    make_request_promise(api_url("videos", api_arguments)).then(
        function(json) {
            var result = {
                channel_id: video.snippet.channelId,
                video_id: video.id.videoId,
                duration : nice_duration(json.items[0]
                                        .contentDetails.duration)
            };
            deferred.resolve(result);
        },
        function(response) {
            deferred.reject(response);
        }
    );
    return deferred.promise;
}

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

function get_channel_by_id (id) {
    for (let element of ss.storage.subscriptions){
        if (element.id == id) {
            return element;
        }
    }
}

function get_channel_by_name (name) {
    name = name.toLowerCase();
    for (let element of ss.storage.subscriptions){
        if (element.title.toLowerCase().contains(name)) {
            return element;
        }
    }
}

function insert_then_notify (duration_result) {
    insert_duration(duration_result);
    try{
        hub_worker.port.emit("duration-update",
            {
                id: duration_result.video_id,
                duration: duration_result.duration
            });
    }catch(_){}
}

function process_video_search_result(response_json){
    // Synchronously add videos to the video store, then asynchronously get
    // their duration
    if (response_json.hasOwnProperty("items")){
        let new_uploads = response_json.items.filter(
            a => a.contentDetails.upload !== undefined);
        if (new_uploads.length > 0) {
            let channel = get_channel_by_id(new_uploads[0].snippet.channelId);
            if (ss.storage.videos[channel.id] ===
                    undefined){
                ss.storage.videos[channel.id] = [];
            }

            let most_recent = (new Date(new_uploads[0]
                              .snippet.publishedAt)).getTime();
            for (let element of new_uploads){
                let date = (new Date(element.snippet.publishedAt)).getTime();
                if (date > most_recent){
                    most_recent = date;
                }
            }
            channel.latest_date = most_recent + 1000;
            // update latest date to match the publish date
            // of the most recent video

            let empty_duration = new_uploads.map(function(e) {
                e.duration = "";
                e.id = {};
                e.id.videoId = e.contentDetails.upload.videoId;
                return e;
            });
            let [include, exclude] = filter_videos(new_uploads, channel.filters);
            ss.storage.videos[channel.id].push(...include); // concat
            exclude.map(add_history);

            let promises = include.map(get_duration).concat(exclude.map(get_duration));
            for (let element of promises){
                element.then(insert_then_notify, console.log).
                    then(null, console.log);
            }
            if (include.length > 0){
                return channel;
            }
        }
    }
    return null;
}

function wrap_promise (p) {
    // Wrap a promise in another promise that will always be accepted
    // On acceptance of the original promise,
    // return a two array that looks like [true, result].
    // On failure, return [false, reason]
    let deferred = defer();
    p.then(function(result) {
        // if (Math.random() < 0.5){
        //     deferred.resolve([true, result]);
        // }else{
        //     deferred.resolve([false, "shabangbang!"]);
        // }
        deferred.resolve([true, result]);
    }, function(reason) {
        deferred.resolve([false, reason]);
    });
    return deferred.promise;
}

function check_all() {
    var promises = [];
    ss.storage.subscriptions.forEach(function(channel) {
        let latest_date = new Date(channel.latest_date)
                                .toISOString();
        let api_arguments = {
            part: "snippet,contentDetails",
            channelId: channel.id,
            publishedAfter: latest_date,
            maxResult: 50
        };
        promises.push(make_request_promise(api_url("activities", api_arguments)));
    });
    ss.storage.last_checked = (new Date()).getTime();
    //checker_call_back(ss.storage.subscriptions[i]));
    let wrapped = promises.map(wrap_promise);
    all(wrapped).then(
        function(results) {
            var process_result = [];
            results.forEach(function(element, index) {
                if (element[0] === true){
                    process_result.push(
                        process_video_search_result(element[1]));
                } else {
                    console.log("Video check failed.", element[1], "id",
                        ss.storage.subscriptions[index].id);
                }
            });
            button.update();
            let uploaded = process_result.filter(e => e);
            if (uploaded.length > 0){
                let base = " uploaded new video(s)!";
                let text = "";
                if (uploaded.length === 1){
                    text = uploaded[0].title + base;
                } else {
                    base = " uploaded new videos!";
                    text = uploaded[0].title +
                    " (and " + (uploaded.length - 1) + " other)" + base;
                }
                require("sdk/notifications").notify({
                    title: "Youtube Subscription Checker",
                    text: text,
                    onClick: open_or_focus
                });
                if (ss.storage.config.play_sound){
                    utility.port.emit("play");
                }
                try{
                    panel.port.emit("videos", [get_all_videos(), ss.storage.history || []]);
                    hub_worker.port.emit("videos", [get_all_videos(), ss.storage.history || []]);
                }catch(_){}
            }
        },
        function(reason) {console.log(reason);}
    ).then(null, function(reason) {console.log(reason);});
}

function search_channel(keyword) {
    let api_arguments = {
        part: "snippet",
        type: "channel",
        order: "relevance",
        q: keyword
    };
    make_request_promise(api_url("search", api_arguments)).then(function(response_json) {
        let pay_load = [];
        if (response_json.pageInfo.totalResults > 0){
            // only show top 3 or less
            for (var i = 0; i < Math.min(response_json.pageInfo.totalResults, 3); i++) {
                pay_load.push({
                    title: response_json.items[i].snippet.title,
                    thumbnail: response_json.items[i].snippet.thumbnails.default.url,
                    id: response_json.items[i].id.channelId
                });
            }
        } else {
            pay_load.push(null); //this is a signals the UI to warn that no channels were found
        }
        try{
            hub_worker.port.emit("search-result", pay_load);
        }catch(_){}
    }, function(reason) {console.log(reason);})
    .then(null, function(reason) {console.log(reason);});
}

function add_channel(channel) {
    ensure_storage();
    let new_channel = JSON.parse(JSON.stringify(channel));
    new_channel.latest_date = (new Date()).getTime();
    new_channel.video_count = 0;
    let duplicate = ss.storage.subscriptions.some(function (element) {
        if (element.id == new_channel.id) {
            return true;
        }
        return false;
    });
    if (!duplicate){
        ss.storage.videos[new_channel.id] = [];
        ss.storage.subscriptions.push(new_channel);
        try{
            // tell the content script the addition was successful
            hub_worker.port.emit("channel-added");
        }catch(_){}
    }else{
        try{
            hub_worker.port.emit("channel-duplicate");
        }catch(_){}
    }
}

function remove_channel(channel) {
    // remove the channel
    ss.storage.subscriptions.some(function (element, index) {
        if (element.id == channel.id) {
            ss.storage.subscriptions.splice(index, 1);
            return true;
        }
        return false;
    });
    // remove all the videos the channel has
    delete ss.storage.videos[channel.id];
    button.update();
}

function remove_video(video) {
    function some_callback(element, index, array){
        if (element.id.videoId == video.id.videoId) {
            array.splice(index, 1);
            return true;
        }
        return false;
    }

    for (var key in ss.storage.videos){
        if (ss.storage.videos.hasOwnProperty(key)) {
            let found_video = ss.storage.videos[key].some(some_callback);
            if (found_video){
                button.update();
                return;
            }
        }
    }
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


var button = {
    button: null,
    init: function() {
        this.button = require("sdk/ui/button/action").ActionButton({
            id: "hub",
            icon: {
                "32": data.url("icons/inactive.png"),
                "64": data.url("icons/inactive64.png"),
            },
            label: "Youtube Subscription Checker\nNo new videos",
            onClick: _ => panel.show({position: this.button})
        });
    },
    inactive: function() {
        this.button.icon = {
            "32": data.url("icons/inactive.png"),
            "64": data.url("icons/inactive64.png"),
        };
    },
    update: function() {
        let video_count = get_all_videos().length;
        if (video_count > 0){
            this.button.label = "Youtube Subscription Checker\n" +
                                 video_count + " new videos";
            utility.port.emit("draw", video_count);
        } else {
            this.inactive();
            this.button.label = "Youtube Subscription Checker\nNo new videos";
        }
    },
    set_icons: function(icon_set) {
        if (get_all_videos().length !== 0){
            this.button.icon = icon_set;
        }
    }
};

var utility = require("sdk/page-worker").Page({
    contentScriptFile: data.url("utility/on_demand.js"),
    contentURL: data.url("utility/on_demand.html")
});

// not passing directly to set_icons since "this" will be port that way
utility.port.on("icons", i => button.set_icons(i));

button.init();
button.update();

(function() {
    ensure_storage();
    ensure_configs();
    function check_cycle() {
        // update the interval then check
        ensure_storage();
        ensure_configs();
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
    }else {
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

panel.port.emit("subscribed-channels", ss.storage.subscriptions);
panel.port.emit("config", ss.storage.config, get_all_filters());
panel.port.on("remove-video", function(video, skip) {
    remove_video(video);
    add_history(video);
    if (skip){
        return;
    }
    open_video(video);
});
panel.port.on("get-videos", function() {
    panel.port.emit("videos", [get_all_videos(), ss.storage.history || []]);
});

exports.Filter = Filter;
exports.filter_videos = filter_videos;
exports.nice_duration = nice_duration;

// var { Hotkey } = require("sdk/hotkeys");

// var showHotKey = Hotkey({
//   combo: "accel-p",
//   onPress: function() {
//     ss.storage.subscriptions[0].latest_date = ((new Date()).getTime() - 12000000000);
//     check_all();
//   }
// });