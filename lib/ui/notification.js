/*
This Source Code Form is subject to the terms of the
Mozilla Public License, v. 2.0.
If a copy of the MPL was not distributed with this file,
You can obtain one at http://mozilla.org/MPL/2.0/.
Author: XrXr

Tools for notifiying the user about new video uploads.
*/
const { data } = require("sdk/self");
const { notify } = require("sdk/notifications");
const { Page } = require("sdk/page-worker");

const config = require("../config");

let sound_player = null;  // this is set by init()
let notification_on_click = null;  // this is set by init()

// Takes an array of channel names to display a desktop notification about new
// video upload
function show_notification (channels) {
    if (channels.length === 0) {
        return;
    }
    let base = " uploaded new video(s)!";
    let text = "";
    if (channels.length === 1) {
        text = channels[0] + base;
    } else {
        base = " uploaded new videos!";
        text = channels[0] + " (and " + (channels.length - 1) +
                             " others)" + base;
    }
    notify({
        title: "Youtube Subscription Checker",
        text,
        onClick: notification_on_click
    });
}

// Play the notification sound. Must be used after a call to init
function play_sound () {
    sound_player.port.emit("play");
}

// The exported notification function. Show desktop notification and depending
// on config, play notificaiton sound
function notify_new_upload (channels) {
    if (sound_player === null || notification_on_click === null) {
        throw Error("ui/notification: Attmpt to notify before init call");
    }
    show_notification(channels);
    if (config.get_one("play_sound")) {
        play_sound();
    }
}

// Create the background page used for playing notification audio
// save the reference to the onClick function of notification
function init (on_click) {
    notification_on_click = on_click;
    sound_player = Page({
        contentScriptFile: data.url("ui/notification/player.js"),
        contentURL: data.url("ui/notification/dummy.html")
    });
}

exports.init = init;
exports.notify_new_upload = notify_new_upload;