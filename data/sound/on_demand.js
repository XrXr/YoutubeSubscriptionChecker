var sound = new Audio('notification.ogg');
self.port.on("play", function() {
    sound.play();
});