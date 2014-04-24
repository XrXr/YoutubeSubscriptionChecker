document.documentElement.addEventListener("search", function(event) {
    start_search();
}, false);

document.documentElement.addEventListener("add", function(event) {
    add_channel(event.detail);
}, false);

document.documentElement.addEventListener("remove", function(event) {
    remove_channel(event.detail);
}, false);

document.documentElement.addEventListener("get-videos", function(event) {
    self.port.emit("get-videos", event.detail);
}, false);

function start_search() {
    self.port.emit("search-channel", document.getElementById('channel_search').value);
}

function add_channel (channel) {
    self.port.emit("add-channel", channel);
}

function remove_channel (channel) {
    self.port.emit("remove-channel", channel);
}

self.port.on('videos', function(pay_load) {
    var result = JSON.stringify(pay_load); 
    var result_event = new CustomEvent('frame');
    result_event.initCustomEvent("videos", true, true, result);
    document.documentElement.dispatchEvent(result_event);    
});

self.port.on('search-result', function(pay_load) {
    var result = JSON.stringify(pay_load); 
    // passing pay_load as reference directly would result in cross-origin problems
    // passing the stringified version circumvents it.
    var result_event = new CustomEvent('subscriptions');
    result_event.initCustomEvent("search-result", true, true, result);
    document.documentElement.dispatchEvent(result_event);
});

self.port.on('subscribed-channels', function(pay_load) {
    var channels = JSON.stringify(pay_load);
    var result_event = new CustomEvent('subscriptions');
    result_event.initCustomEvent("subscribed-channels", true, true, channels);
    document.documentElement.dispatchEvent(result_event);
});

self.port.on("channel-added", function() {
    var result_event = new CustomEvent('subscriptions');
    result_event.initCustomEvent("channel-added", true, true, null);
    document.documentElement.dispatchEvent(result_event);
});

self.port.on("channel-duplicate", function() {
    var result_event = new CustomEvent('subscriptions');
    result_event.initCustomEvent("channel-duplicate", true, true, null);
    document.documentElement.dispatchEvent(result_event);
});

self.port.emit("get-videos", null); //get all videos once contentscript loads