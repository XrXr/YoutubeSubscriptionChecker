document.documentElement.addEventListener("search-channel", function(event) {
    self.port.emit("search-channel", document.getElementById('channel_search').value);
}, false);

document.documentElement.addEventListener("add-channel", function(event) {
    self.port.emit("add-channel", channel);
}, false);

document.documentElement.addEventListener("remove-channel", function(event) {
    self.port.emit("remove-channel", channel);
}, false);

document.documentElement.addEventListener("get-videos", function(event) {
    self.port.emit("get-videos", event.detail);
}, false);

document.documentElement.addEventListener("remove-video", function(event) {
    self.port.emit("remove-video", event.detail);
}, false);

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