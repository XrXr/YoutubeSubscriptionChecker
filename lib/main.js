const data = require("sdk/self").data;
const load_reason = require("sdk/self").loadReason;
const tabs = require("sdk/tabs");
const ss = require("sdk/simple-storage");
const timers = require("sdk/timers");
const { defer, all } = require('sdk/core/promise');
var hub_worker = null;

function write_log (string) {
    return;
    var fileIO = require("sdk/io/file");
    let original = fileIO.read("G:\\log.txt");
    var writer = fileIO.open("G:\\log.txt", "w");
    if (!writer.closed) {
        writer.write(original + "\n" +
                    (new Date()).toString() + "  " + string);
        writer.close();
    }
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

function open_or_focus() {
    // Open a new tab with the hub in it, or focus on it
    // Look through all the tabs in all the windows
    if (!focus_on_hub()){
        tabs.open(data.url("hub/home.html"));
    }
}

require("sdk/page-mod").PageMod({
    include: data.url("hub/home.html"),
    contentScriptFile: data.url("hub/app/content.js"),
    contentScriptWhen: "end",
    onAttach: function(worker) {
        hub_worker = worker;
        worker.port.emit("subscribed-channels", ss.storage.subscriptions);
        worker.port.emit("configs", ss.storage.configs);
        worker.port.on("search-channel", search_channel);
        worker.port.on("add-channel", add_channel);
        worker.port.on("remove-channel", remove_channel);
        worker.port.on("get-videos", function(channel_id) {
            if (channel_id === null){
                worker.port.emit("videos", get_all_videos());
            }else{
                worker.port.emit("videos", ss.storage.videos[channel_id]);
            }
        });
        worker.port.on("remove-video", function(video) {
            remove_video(video);
            tabs.open({
                url: "https://www.youtube.com/watch?v=" + video.id,
                inBackground: ss.storage.configs.in_background
            });
        });
        worker.port.on("update_configs", function(configs) {
            // sanitize config
            function isNumber(n) {
                return !isNaN(parseFloat(n)) && isFinite(n);
            }
            function correct_bool(value, correction) {
                if (value === true || value === false){
                    return value;
                }
                return correction;
            }
            if (isNumber(configs.interval)){
                if (configs.interval < 5){
                    configs.interval = 5;
                }
            }
            configs.play_sound = correct_bool(configs.play_sound, true);
            in_background = correct_bool(configs.play_sound, false);
            ss.storage.configs = configs;
        });
    }
});

function duplicate_listener (tab) {
    remove_other(tab);
}

function listener_registrar (tab) {
    tab.on("pageshow", duplicate_listener);
}

tabs.on('ready', listener_registrar);

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

//not using nsISound here because it might soon be deprecated
//this could also be done with a page-mod that inserts into
var notification_sound = require("sdk/page-worker").Page({
    contentScriptFile: data.url("sound/on_demand.js"),
    contentURL: data.url("sound/blank.html")
});

function update_video_count() {
    function set_video_count(id, new_value) {
        ss.storage.subscriptions.some(function (element) {
            if (element.id == id) {
                element.video_count = new_value;
                return true;
            }
            return false;
        });
    }

    for (var id in ss.storage.videos) {
        if (ss.storage.videos.hasOwnProperty(id)) {
            set_video_count(id, ss.storage.videos[id].length);
        }
    }
}

function api_url(method, param) {
    api_key = "AIzaSyB6mi40O6WOd17yjeYkK-y5lIU4FvoR8fo";
    url = "https://www.googleapis.com/youtube/v3/"+method+'?';
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

function get_channel_by_id (id) {
    var channel = null;
    ss.storage.subscriptions.some(function (element) {
        if (element.id == id) {
            channel = element;
            return true;
        }
        return false;
    });
    return channel;
}

function ISODate_to_ms (ISO_8601_string) {
    return (new Date(ISO_8601_string)).getTime();
}

function process_playlistItem(response_json){
    if (response_json.hasOwnProperty('items')){
        return response_json.items.map(e => e.snippet.resourceId.videoId);
    }
    return [];
}

function wrap_promise (p) {
    // Wrap a promise in another promise that will always be accepted
    // On acceptance of the original promise,
    // return a two array that looks like [true, result].
    // On failure, return [false, reason]
    let deferred = defer();
    p.then(function(result) {
        deferred.resolve([true, result]);
    }, function(reason) {
        deferred.resolve([false, reason]);
    });
    return deferred.promise;
}

function find_new_videos (video_ids){
    let deferred = defer();
    if (video_ids.length === 0){
        deferred.resolve([]);
        return deferred.promise;
    }
    let api_arguments = {
        part: "contentDetails,snippet",
        id: video_ids.join(",")
    };
    make_request_promise(api_url("videos", api_arguments)).
        then(function(result) {
            try{
                let channel_id = result.items[0].snippet.channelId;
                let latest_date = get_channel_by_id(channel_id).latest_date;
                let new_videos = result.items.filter(
                    e => ISODate_to_ms(e.snippet.publishedAt) > latest_date);
                new_videos.forEach(e => e.duration =
                    nice_duration(e.contentDetails.duration));
                deferred.resolve(new_videos);
            }catch(err){
                console.log(err);
                deferred.reject("Bad response");
            }
        }, deferred.reject);
    return deferred.promise;
}

function add_new_videos (videos) {
    if (videos.length > 0){
        let channel_id = videos[0].snippet.channelId;
        if (ss.storage.videos[channel_id] === undefined){
            ss.storage.videos[channel_id] = [];
        }
        // sort videos by their publish time from most recent to least
        videos.sort((a, b) => -(ISODate_to_ms(a.snippet.publishedAt) -
                              ISODate_to_ms(b.snippet.publishedAt)));
        ss.storage.videos[channel_id].push(...videos);
        return [videos[0].snippet.channelTitle, channel_id];
    }
    return null;
}

function send_notification (channels) {
    if (channels.length > 0){
        let base = " uploaded new video(s)!";
        let text = "";
        if (channels.length === 1){
            text = channels[0] + base;
        } else {
            base = " uploaded new videos!";
            text = channels[0] + " (and " + (channels.length - 1) +
                   " other)" + base;
        }
        require("sdk/notifications").notify({
            title: "Youtube Subscription Checker",
            text: text,
            onClick: open_or_focus
        });
        if (ss.storage.configs.play_sound){
            notification_sound.port.emit("play");
        }
    }
}

function update_latest (channel_id_list) {
    ss.storage.subscriptions.forEach(function(element) {
        if (channel_id_list.indexOf(element.id) == -1){
            return;
        }
        if (ss.storage.videos[element.id]){
            if (ss.storage.videos[element.id][0]){
                element.latest_date = ISODate_to_ms(ss.storage.
                    videos[element.id][0].snippet.publishedAt);
                return;
            }
        }
        element.latest_date = (new Date()).getTime();
    });
}

function check_all() {
    var promises = [];
    ss.storage.subscriptions.forEach(function(channel) {
        let latest_date = new Date(channel.latest_date)
                                .toISOString();
        let api_arguments = {
            part: "snippet",
            playlistId: channel.id.replace("UC", "UU"),
            maxResults: 50,
            fields: "items"
        };
        promises.push(make_request_promise(api_url('playlistItems',
                      api_arguments)));
    });
    ss.storage.last_checked = (new Date()).getTime();
    let wrapped = promises.map(wrap_promise);
    all(wrapped).then(
        function(results) {
            var video_ids = [];
            results.forEach(function(element) {
                if (element[0] === true){
                    video_ids.push(process_playlistItem(element[1]));
                } else {
                    console.log("Video listing failed", element[1], "id",
                        ss.storage.subscriptions[index].id);
                    write_log("Video listing failed. Status: " +
                        JSON.stringify(element[1].status) + " id: " +
                        ss.storage.subscriptions[index].id);
                }
            });
            let video_promises = video_ids.map(find_new_videos);
            let wrapped_result = video_promises.map(wrap_promise);
            all(wrapped_result).then(function(new_videos) {
                let check_result = [];
                new_videos.forEach(function(element) {
                    if (element[0] === true){
                        check_result.push(element[1]);
                    } else {
                        console.log("Getting video info failed.", element[1], "id",
                            ss.storage.subscriptions[index].id);
                        write_log("Getting video info failed. Status: " +
                            JSON.stringify(element[1].status) + " id: " +
                            ss.storage.subscriptions[index].id);
                    }
                });
                let active_channels = check_result.map(add_new_videos);
                active_channels = active_channels.filter(e => e !== null);
                update_video_count();
                if (hub_worker){
                    hub_worker.port.emit("subscribed-channels", ss.storage.subscriptions);
                }
                button.update();
                let title_list = active_channels.map(a => a[0]);
                let id_list = active_channels.map(a => a[1]);
                update_latest(id_list);
                send_notification(title_list);
            }, function(reason) {console.log(reason);});
        },
        function(reason) {console.log(reason);}
    );
    write_log("Checking all subscriptions... "+ (new Date()).getTime());
}

function search_channel(keyword) {
    let api_arguments = {
        part: "snippet",
        type: "channel",
        order: "relevance",
        q: keyword
    };
    make_request_promise(api_url('search', api_arguments)).then(function(response_json) {
        let pay_load = [];
        if (response_json.pageInfo.totalResults > 0){
            for (var i = 0; i < Math.min(response_json.pageInfo.totalResults, 3); i++) { //only show top 3 or less
                pay_load.push({
                    title: response_json.items[i].snippet.title,
                    thumbnail: response_json.items[i].snippet.thumbnails.default.url,
                    id: response_json.items[i].id.channelId
                });
            }
        } else {
            pay_load.push(null); //this is signals the UI to warn that no channels were found
        }
        hub_worker.port.emit("search-result", pay_load);
    }, function(reason) {console.log(reason);});  // do noting on fail
}

function add_channel(channel) {
    if (ss.storage.subscriptions === undefined){
        ss.storage.subscriptions = [];
    }
    if (ss.storage.videos === undefined){
        ss.storage.videos = {};
    }
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
        hub_worker.port.emit("channel-added"); // tell the content script the addition was successful
    }else{
        hub_worker.port.emit("channel-duplicate");
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
            update_video_count();
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

if (load_reason == "install"){
    ss.storage.configs = {
        interval: 10,
        play_sound: true,
        in_background: false
    };
    ss.storage.videos = {};
    ss.storage.subscriptions = [];
    ss.storage.subscriptions = [
      {
        "title": "Philip DeFranco",
        "id": "UClFSU9_bUb4Rc6OYfTt5SPw",
        "latest_date": ((new Date()).getTime())
      },
      {
        "title": "SourceFed",
        "id": "UC_gE-kg7JvuwCNlbZ1-shlA",
        "latest_date": ((new Date()).getTime() - 120000000)
      },
      {
        "title": "Trump",
        "id": "UCsQnAt5I56M-qx4OgCoVmeA",
        "latest_date": ((new Date()).getTime() - 120000000)
      },
      {
        "title": "Northernlion",
        "id": "UC3tNpTOHsTnkmbwztCs30sA",
        "latest_date": ((new Date()).getTime() - 120000000)
      }
    ];
    ss.storage.subscriptions.push({title: "LinusTechTips", id: "UCXuqSBlHAE6Xw-yeJA0Tunw",
                                    latest_date: ((new Date()).getTime())});
}

update_video_count();
var check_interval_id = null;
(function() {
    const since_last = (new Date()).getTime() - ss.storage.last_checked;
    const check_interval = ss.storage.configs.interval * 60 * 1000;
    if (ss.storage.last_checked === undefined || since_last >= check_interval){
        // checking imediately
        check_all();
        check_interval_id = timers.setInterval(check_all, check_interval);
    } else if (since_last <= 0) {
        // system time would have to be altered for this to be possible
        // first check occurs after 1 period
        check_interval_id = timers.setInterval(check_all, check_interval);
    }else {
        // first check happens when the period finishes
        timers.setTimeout(function() {
            check_all();
            check_interval_id = timers.setInterval(check_all, check_interval);
        }, check_interval - since_last);
    }
})();

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
            onClick: open_or_focus
        });
    },
    inactive: function() {
        this.button.icon = {
            "32": data.url("icons/inactive.png"),
            "64": data.url("icons/inactive64.png"),
        };
    },
    active: function() {
        this.button.icon = {
            "32": data.url("icons/active.png"),
            "64": data.url("icons/active64.png"),
        };
    },
    update: function() {
        let video_count = get_all_videos().length;
        if (video_count > 0){
            this.active();
            this.button.label = "Youtube Subscription Checker\n" +
                                 video_count + " new videos";
        } else {
            this.inactive();
            this.button.label = "Youtube Subscription Checker\nNo new videos";
        }
    }
};

button.init();
button.update();