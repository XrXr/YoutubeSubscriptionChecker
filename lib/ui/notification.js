/*
This Source Code Form is subject to the terms of the
Mozilla Public License, v. 2.0.
If a copy of the MPL was not distributed with this file,
You can obtain one at http://mozilla.org/MPL/2.0/.
Author: XrXr

Functions for notifiying the user about new video uploads.
*/
const { notify } = require("sdk/notifications");
const config = require("config");
const { Page } = require("sdk/page-worker");

let presist = null;  // this is set by init()

// Takes an array of channel names to display a desktop notification about new
// video upload
function show_notification(channels) {
    if (channels.length > 0){
        let base = " uploaded new video(s)!";
        let text = "";
        if (channels.length === 1) {
            text = channels[0].title + base;
        } else {
            base = " uploaded new videos!";
            text = channels[0].title +
                " (and " + (channels.length - 1) + " other)" + base;
        }
        notify({
            title: "Youtube Subscription Checker",
            text: text,
            onClick: open_or_focus
        });
    }
}

// Play the notification sound. Must be used after a call to init
function play_sound() {
    if (presist === null) {
        throw Error("ui/notification: Attempt to play sound before init");
    }
    presist.port.emit("play");
}

// The exported notification function. Show desktop notification and depending
// on config, play notificaiton sound
function notify_new_upload(channels) {
    show_notification(channels);
    if (config.get_one("play_sound")){
        play_sound();
    }
}

// Create the background page used for playing notification audio
function init() {
    presist = Page({
        contentScriptFile: data.url("notification/player.js"),
        contentURL: data.url("utility/blank.html")
    });
}

exports.init = init;
exports.notify_new_upload = notify_new_upload;