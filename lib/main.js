const Request = require("sdk/request").Request;
const { ActionButton } = require("sdk/ui/button/action");
const data = require("sdk/self").data;
const tabs = require("sdk/tabs");
const ss = require("sdk/simple-storage");
const timers = require("sdk/timers");


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
        tabs.open(data.url("settings.html"));
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
            channelId: ss.storage.subscriptions[i].channelId,
            publishedAfter: last_checked_date
        };
        make_request(api_url('search', api_arguments),
            checker_call_back(ss.storage.subscriptions[i])); 
    }
}

ss.storage.subscriptions = [];
ss.storage.subscriptions.push({name: "Philip Defranco", channelId: "UClFSU9_bUb4Rc6OYfTt5SPw",
                                last_checked: ((new Date()).getTime() - 86400000)});

checker_timer_id = timers.setInterval(check_all, 5000);