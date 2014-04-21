document.documentElement.addEventListener("search", function(event) {
    start_search();
}, false);

function start_search() {
    self.port.emit("search-channel", document.getElementById('channel_search').value);
}