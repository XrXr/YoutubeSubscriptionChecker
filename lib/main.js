const data = require("sdk/self").data;
const load_reason = require("sdk/self").loadReason;
const tabs = require("sdk/tabs");
const ss = require("sdk/simple-storage");
const timers = require("sdk/timers");
const { defer, all } = require('sdk/core/promise');
var hub_worker = null;

function write_log (string) {
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
                url: "https://www.youtube.com/watch?v=" + video.id.videoId,
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

tabs.on('open', function(tab){
    tab.on("pageshow", function(tab) {
        remove_other(tab);
    });
});

tabs.on('ready', function(tab){
    tab.on("pageshow", function(tab) {
        remove_other(tab);
    });
});

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
            videos.push.apply(videos, ss.storage.videos[key]);
        }
    }
    return videos;
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
            deferred.reject();
        }
    );
    return deferred.promise;
}

function insert_duration (duration_result) {
    // Takes an object that is a result of get_duration then insert
    // the duration into the right video object
    ss.storage.videos[duration_result.channel_id].some(function(element) {
        if (element.id.videoId == duration_result.video_id){
            element.duration = duration_result.duration;
            return true;
        }
        return false;
    });
}

function process_video_search_result(channel, response_json){
    // synchronously add videos to the video store, then asynchronously get
    // their duration
    if (response_json.hasOwnProperty('items')){
        write_log(JSON.stringify(response_json)+"  "+ channel.last_checked);
        channel.last_checked = (new Date()).getTime(); // update last checked time
        if (response_json.items.length > 0) {
            if (ss.storage.videos[channel.id] ===
                    undefined){
                ss.storage.videos[channel.id] = [];
            }
            let empty_duration = response_json.items.map(function(e) {
                e.duration = "";
                return e;
            });
            ss.storage.videos[channel.id].push //concat in place
                .apply(ss.storage.videos[channel.id], empty_duration);

            let promises = response_json.items.map(get_duration);
            promises.forEach(function(element) {
                element.then(insert_duration, function() {});
            });
            return true;
        }
    }
    return false;
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

function check_all() {
    var promises = [];
    ss.storage.subscriptions.forEach(function(channel) {
        let last_checked_date = new Date(channel.last_checked)
                                .toISOString();
        let api_arguments = {
            part: "snippet",
            channelId: channel.id,
            publishedAfter: last_checked_date,
            order: "date",
            type: "video"
        };
        promises.push(make_request_promise(api_url('search', api_arguments)));
    });
    //checker_call_back(ss.storage.subscriptions[i]));
    let wrapped = promises.map(wrap_promise);
    all(wrapped).then(
        function(results) {
            var new_videos_uploaded = [];
            results.forEach(function(element, index) {
                if (element[0] === true){
                    new_videos_uploaded.push(
                        process_video_search_result(
                            ss.storage.subscriptions[index], element[1]));
                } else {
                    console.log("Video check failed.", element[1], "id",
                        ss.storage.subscriptions[index].id);
                    write_log("Video check failed. Status: " +
                        JSON.stringify(element[1].status) + " id: " +
                        ss.storage.subscriptions[index].id);
                }
            });
            update_video_count();
            if (hub_worker){
                hub_worker.port.emit("subscribed-channels", ss.storage.subscriptions);
            }
            button.update();
            if (new_videos_uploaded.indexOf(true) !== -1){
                require("sdk/notifications").notify({
                    title: "Youtube Subscription Checker",
                    text: "Someone from your subscriptions uploaded new a video!",
                    onClick: open_or_focus
                });
                if (ss.storage.configs.play_sound){
                    notification_sound.port.emit("play");
                }
            }
        },
        function(reason) {}
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
            for (var i = 0; i < Math.min(response_json.pageInfo.totalResults, 3); i++) {  //only show top 3 or less
                pay_load.push({
                    title: response_json.items[i].snippet.title,
                    thumbnail: response_json.items[i].snippet.thumbnails.default.url,
                    id: response_json.items[i].id.channelId
                });
            }
        } else {
            pay_load.push(null); //this is a signals the UI to warn that no channels were found
        }
        hub_worker.port.emit("search-result", pay_load);
    }, function() {});  // do noting on fail
}

function add_channel(channel) {
    if (ss.storage.subscriptions === undefined){
        ss.storage.subscriptions = [];
    }
    if (ss.storage.videos === undefined){
        ss.storage.videos = {};
    }
    let new_channel = JSON.parse(JSON.stringify(channel));
    new_channel.last_checked = (new Date()).getTime();
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
        "last_checked": ((new Date()).getTime()),
        video_count: 100
      },
      {
        "title": "SourceFed",
        "id": "UC_gE-kg7JvuwCNlbZ1-shlA",
        "last_checked": ((new Date()).getTime() - 12000000000)
      },
      {
        "title": "Trump",
        "id": "UCsQnAt5I56M-qx4OgCoVmeA",
        "last_checked": ((new Date()).getTime()),
        video_count: 15
      },
      {
        "title": "Northernlion",
        "id": "UC3tNpTOHsTnkmbwztCs30sA",
        "last_checked": ((new Date()).getTime())
      }
    ];
    ss.storage.subscriptions.push({title: "LinusTechTips", id: "UCXuqSBlHAE6Xw-yeJA0Tunw",
                                    last_checked: ((new Date()).getTime())});
}

update_video_count();
check_all();

checker_timer_id = timers.setInterval(check_all, ss.storage.configs.interval * 60 * 1000);

var button = {
    button: null,
    init: function() {
        this.button = require("sdk/ui/button/action").ActionButton({
            id: "hub",
            icon: {
                "32": data.url("icons/inactive.png"),
                "64": data.url("icons/inactive32.png"),
            },
            label: "Youtube Subscription Checker\nNo new videos",
            onClick: open_or_focus
        });
    },
    inactive: function() {
        this.button.icon = {
            "32": data.url("icons/inactive.png"),
            "64": data.url("icons/inactive32.png"),
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