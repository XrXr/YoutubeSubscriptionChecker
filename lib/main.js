const Request = require("sdk/request").Request;
const { ActionButton } = require("sdk/ui/button/action");
const data = require("sdk/self").data;
const load_reason = require("sdk/self").loadReason;
const tabs = require("sdk/tabs");
const ss = require("sdk/simple-storage");
const timers = require("sdk/timers");
const { defer, all } = require('sdk/core/promise');

var hub_worker = null;

require("sdk/page-mod").PageMod({
    include: data.url("hub/home.html"),
    contentScriptFile: data.url("hub/app/content.js"),
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

//not using nsISound here because it might soon be deprecated
//this could also be done with a page-mod that inserts into 
var notification_sound = require("sdk/page-worker").Page({
    contentScriptFile: data.url("sound/on_demand.js"),
    contentURL: data.url("sound/blank.html")
});

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
    Request({
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
    let colon = result.indexOf(":");
    if (colon == 1){
        result = "0" + result;
        colon += 1;
    }
    if (result.length - 2 == colon) {
        result = result.replace(":", ":0");
    }else if (result.length - 1 == colon){
        result += "00";
    }
    return result.replace("H", ":");
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

function insert_duration(search_result) {
    // video search result object
    // insert the duration of the video into search_result.duration
    // returns a promise
    let deferred = defer();
    search_result.duration = "";
    let api_arguments = {
        part: "contentDetails",
        id: search_result.id.videoId,
    };
    make_request_promise(api_url("videos", api_arguments)).then(
        function(json) {
            search_result.duration = nice_duration(json.items[0]
                                                   .contentDetails.duration);
            deferred.resolve(search_result);
        }, 
        function(response) {
            deferred.reject();
        }
    );
    return deferred.promise;
}

function process_video_search_result(subscription, response_json){
    if (response_json.hasOwnProperty('items')){
        subscription.last_checked = (new Date()).getTime();
        if (response_json.items.length > 0) {
            if (ss.storage.videos[subscription.id] === undefined){
                ss.storage.videos[subscription.id] = [];
            }
            let promises = response_json.items.map(insert_duration);
            all(promises).then(
                function(results) {
                    ss.storage.videos[subscription.id].push //concat in place
                        .apply(ss.storage.videos[subscription.id], results);
                },
                function() {
                    // if getting the duration fails, too bad. 
                    // All videos from that user will not have length with them.
                    ss.storage.videos[subscription.id].push //concat in place
                        .apply(ss.storage.videos[subscription.id], response_json.items);
                }
            );
            return true;
        }
    }
    return false;
}

function check_all() {
    var promises = [];
    for (var i = 0; i < ss.storage.subscriptions.length; i++) {
        let last_checked_date = new Date();
        last_checked_date.setTime(ss.storage.subscriptions[i].last_checked);
        last_checked_date = last_checked_date.toISOString();
        let api_arguments = {
            part: "snippet",
            channelId: ss.storage.subscriptions[i].id,
            publishedAfter: last_checked_date,
            order: "date"
        };
        promises.push(make_request_promise(api_url('search', api_arguments)));
    }
    //checker_call_back(ss.storage.subscriptions[i])); 
    var results = all(promises).then(
        function(results) {
            //all() should return an array with results in the order matching the order of the promise array
            //even if it doesn't its not a big deal
            var new_videos_uploaded = [];
            for (var i = 0; i < results.length; i++) { 
                new_videos_uploaded.push(
                    process_video_search_result(ss.storage.subscriptions[i],
                                                results[i]));
            }
            if (new_videos_uploaded.indexOf(true) !== -1){
                require("sdk/notifications").notify({
                    title: "Youtube Subscription Checker",
                    text: "Someone from your subscriptions uploaded new a video!",
                    onClick: function () {
                        tabs.open(data.url("hub/home.html"));
                    }
                });
                if (ss.storage.configs.play_sound){
                    notification_sound.port.emit("play");
                }
            }
        },
        function(reason) {console.log("Video check failed.", reason);});
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
    let duplicate = ss.storage.subscriptions.some(function (element) {
        if (element.id == new_channel.id) {
            return true;
        }
        return false;
    });
    if (!duplicate){
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
            if (found_video) return;
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
}
// ss.storage.subscriptions = [
//   {
//     "title": "Philip DeFranco",
//     "id": "UClFSU9_bUb4Rc6OYfTt5SPw",
//     "last_checked": ((new Date()).getTime() - 186400000)
//   },
//   {
//     "title": "SourceFed",
//     "id": "UC_gE-kg7JvuwCNlbZ1-shlA",
//     "last_checked": ((new Date()).getTime() - 186400000)
//   },
//   {
//     "title": "Trump",
//     "id": "UCsQnAt5I56M-qx4OgCoVmeA",
//     "last_checked": ((new Date()).getTime() - 186400000)
//   },
//   {
//     "title": "Northernlion",
//     "id": "UC3tNpTOHsTnkmbwztCs30sA",
//     "last_checked": ((new Date()).getTime() - 186400000)
//   }
// ];
// ss.storage.subscriptions.push({title: "LinusTechTips", id: "UCXuqSBlHAE6Xw-yeJA0Tunw",
//                                 last_checked: ((new Date()).getTime() - 186400000)});   
check_all();

checker_timer_id = timers.setInterval(check_all, ss.storage.configs.interval * 60 * 1000);

ActionButton({
    id: "hub",
    label: "Youtube Subscription Checker",
    icon: {
      "16": data.url("icon16"),
      "32": data.url("icon32")
    },
    onClick: function(state) {
        tabs.open(data.url("hub/home.html"));
    }
});