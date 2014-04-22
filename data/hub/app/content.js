document.documentElement.addEventListener("search", function(event) {
    start_search();
}, false);

function start_search() {
    self.port.emit("search-channel", document.getElementById('channel_search').value);
}

self.port.on('search-result', function(pay_load) {
    var result = JSON.stringify(pay_load); 
    // passing pay_load as reference directly would result in cross-origin problems
    // passing the stringified version circumvents it.
    var result_event = new CustomEvent('subscriptions');
    result_event.initCustomEvent("search-result", true, true, result);
    document.documentElement.dispatchEvent(result_event);
});