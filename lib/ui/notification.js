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
const config = require("config");
const { Page } = require("sdk/page-worker");

let presist = null;  // this is set by init()
let notification_on_click = null;  // this is set by init()

// Takes an array of channel names to display a desktop notification about new
// video upload
function show_notification (channels) {
    if (channels.length > 0) {
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
            onClick: notification_on_click
        });
    }
}

// Play the notification sound. Must be used after a call to init
function play_sound () {
    presist.port.emit("play");
}

// The exported notification function. Show desktop notification and depending
// on config, play notificaiton sound
function notify_new_upload (channels) {
    if (presist === null || notification_on_click === null) {
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
    presist = Page({
        contentScriptFile: data.url("ui/notification/player.js"),
        contentURL: data.url("ui/notification/blank.html")
    });
}

exports.init = init;
exports.notify_new_upload = notify_new_upload;