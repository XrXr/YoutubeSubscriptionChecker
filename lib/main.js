const Request = require("sdk/request").Request;
const { ActionButton } = require("sdk/ui/button/action");
const data = require("sdk/self").data;
const tabs = require("sdk/tabs");
const ss = require("sdk/simple-storage");
const timers = require("sdk/timers");

hub_worker = null;

require("sdk/page-mod").PageMod({
    include: data.url("hub/home.html"),
    contentScriptFile: data.url("hub/app/content.js"),
    onAttach: function(worker) {
        hub_worker = worker;
        worker.port.emit("subscribed-channels", ss.storage.subscriptions);
        worker.port.on("search-channel", search_channel);
        worker.port.on("add-channel", add_channel);
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

ActionButton({
    id: "set-up",
    label: "Click to configure Youtube Subscription Checker",
    icon: {
      "16": data.url("icon16"),
      "32": data.url("icon32")
    },
    onClick: function(state) {
        tabs.open(data.url("hub/home.html"));
    }
  });

function checker_call_back(subscription){
    return function (response) {
        if (response.json.hasOwnProperty('items')){
            console.log(response.json);
            if (response.json.items.length !== 0) {
                console.log(subscription.name+" uploaded a new video");
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
    let new_channel = JSON.parse(JSON.stringify(channel));
    new_channel.last_checked = (new Date()).getTime();
    let duplicate = !ss.storage.subscriptions.every(function (element) {
        if (element.id == new_channel.id) {
            return false;
        }
        return true;
    });
    if (!duplicate){
        ss.storage.subscriptions.push(new_channel);
        hub_worker.port.emit("channel-added"); // tell the content script the addition was successful
    }else{
        hub_worker.port.emit("channel-duplicate");
    }
}
ss.storage.subscriptions = [];
ss.storage.subscriptions.push({title: "Philip Defranco", id: "UClFSU9_bUb4Rc6OYfTt5SPw",
                                last_checked: ((new Date()).getTime() - 86400000)});

// checker_timer_id = timers.setInterval(check_all, 5000);