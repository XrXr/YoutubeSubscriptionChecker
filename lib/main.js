const Request = require("sdk/request").Request;
const { ActionButton } = require("sdk/ui/button/action");
const data = require("sdk/self").data;
const tabs = require("sdk/tabs");
const ss = require("sdk/simple-storage");
const timers = require("sdk/timers");
const { defer, all } = require('sdk/core/promise');
hub_worker = null;

require("sdk/page-mod").PageMod({
    include: data.url("hub/home.html"),
    contentScriptFile: data.url("hub/app/content.js"),
    onAttach: function(worker) {
        hub_worker = worker;
        worker.port.emit("subscribed-channels", ss.storage.subscriptions);
        worker.port.on("search-channel", search_channel);
        worker.port.on("add-channel", add_channel);
        worker.port.on("remove-channel", remove_channel);
        worker.port.on("get-videos", function(channel_id) {
            console.log(channel_id);
            if (channel_id === null){
                worker.port.emit("videos", get_all_videos());
            }else{
                worker.port.emit("videos", ss.storage.videos[channel_id]);
            }
        });
    }
});

function api_url (method, param) {
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

function make_request (url, complete_callback) {
    Request({
        url: url,
        onComplete: complete_callback
    }).get();
}

function make_request_promise (url) {
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
    }
    return result;
}

function get_all_videos () {
    var videos = [];
    for (var key in ss.storage.videos){
        if (ss.storage.videos.hasOwnProperty(key)) {
            videos.push.apply(videos, ss.storage.videos[key]);
        }
    }
    return videos;
}

function insert_duration (search_result) {
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
    }, function(response) {
        deferred.reject();
    });
    return deferred.promise;
}

function checker_call_back(subscription){
    return function (response) {
        if (response.json.hasOwnProperty('items')){
            if (response.json.items.length !== 0) {
                if (ss.storage.videos[subscription.id] === undefined){
                    ss.storage.videos[subscription.id] = [];
                }
                let promises = response.json.items.map(insert_duration);
                all(promises).then(
                    function(results) {
                        ss.storage.videos[subscription.id].push //concat in place
                            .apply(ss.storage.videos[subscription.id], results);
                    },
                    function() {
                        // if getting the duration fails, too bad
                        ss.storage.videos[subscription.id].push //concat in place
                            .apply(ss.storage.videos[subscription.id], results);
                    }
                );
            }
        }
        subscription.last_checked = (new Date()).getTime();
    };
}

function check_all () {
    for (var i = 0; i < ss.storage.subscriptions.length; i++) {
        let last_checked_date = new Date();
        last_checked_date.setTime(ss.storage.subscriptions[i].last_checked);
        last_checked_date = last_checked_date.toISOString();
        let api_arguments = {
            part: "snippet",
            channelId: ss.storage.subscriptions[i].id,
            publishedAfter: last_checked_date
        };
        make_request(api_url('search', api_arguments),
            checker_call_back(ss.storage.subscriptions[i])); 
    }
}

function search_channel(keyword) {
    let api_arguments = {
        part: "snippet",
        type: "channel",
        order: "relevance",
        q: keyword
    };
    make_request(api_url('search', api_arguments), function(response) {
        let pay_load = [];
        if (response.json.pageInfo.totalResults > 0){
            for (var i = 0; i < 3; i++) {  //only show the top 3 results
                pay_load.push({
                    title: response.json.items[i].snippet.title,
                    thumbnail: response.json.items[i].snippet.thumbnails.default.url,
                    id: response.json.items[i].id.channelId
                });
            }
        } else {
            pay_load.push(null);
        }
        hub_worker.port.emit("search-result", pay_load);
    });
}

function add_channel (channel) {
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

function remove_channel (channel) {
    ss.storage.subscriptions.some(function (element, index) {
        if (element.id == channel.id) {
            ss.storage.subscriptions.splice(index, 1);
            return true;
        }
        return false;
    });
}

ss.storage.subscriptions = [];
ss.storage.subscriptions.push({title: "Philip Defranco", id: "UCXuqSBlHAE6Xw-yeJA0Tunw",
                                last_checked: ((new Date()).getTime() - 186400000)});
ss.storage.videos = {};

check_all();
// checker_timer_id = timers.setInterval(check_all, 5000);

// insert_duration({id:{videoId:}})

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