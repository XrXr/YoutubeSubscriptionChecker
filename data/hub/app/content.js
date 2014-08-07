/*
This Source Code Form is subject to the terms of the
Mozilla Public License, v. 2.0.
If a copy of the MPL was not distributed with this file,
You can obtain one at http://mozilla.org/MPL/2.0/.
Author: XrXr
*/
function send_dom_event (type, name, data) {
    // passing pay_load as reference directly would result in cross-origin problems
    // passing the stringified version circumvents it.
    var result = JSON.stringify(data);
    var result_event = new CustomEvent(type);
    result_event.initCustomEvent(name, true, true, result);
    document.documentElement.dispatchEvent(result_event);
}

document.documentElement.addEventListener("search-channel", function(event) {
    self.port.emit("search-channel", document.getElementById('channel_search').value);
}, false);

document.documentElement.addEventListener("add-channel", function(event) {
    self.port.emit("add-channel", event.detail);
}, false);

document.documentElement.addEventListener("remove-channel", function(event) {
    self.port.emit("remove-channel", event.detail);
}, false);

document.documentElement.addEventListener("remove-video", function(event) {
    self.port.emit("remove-video", event.detail);
}, false);

document.documentElement.addEventListener("update_config", function(event) {
    self.port.emit("update_config", event.detail);
}, false);


self.port.on('videos', function(pay_load) {
    send_dom_event("frame", "videos", pay_load);
});

self.port.on('config', function(pay_load, filters) {
    pay_load.filters = filters;
    send_dom_event(null, "config", pay_load);
});

self.port.on('search-result', function(pay_load) {
    send_dom_event("subscriptions", "search-result", pay_load);
});

self.port.on('subscribed-channels', function(pay_load) {
    send_dom_event("subscriptions", "subscribed-channels", pay_load);
});

self.port.on("channel-added", function() {
    send_dom_event("subscriptions", "channel-added", null);
});

self.port.on("channel-duplicate", function() {
    send_dom_event("subscriptions", "channel-duplicate", null);
});

self.port.on("duration-update", function(pay_load) {
    send_dom_event("videos", "duration-update", pay_load);
});

self.port.emit("get-videos", null); //get all videos once contentscript loads