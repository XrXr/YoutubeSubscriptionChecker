/*
This Source Code Form is subject to the terms of the
Mozilla Public License, v. 2.0.
If a copy of the MPL was not distributed with this file,
You can obtain one at http://mozilla.org/MPL/2.0/.
Author: XrXr

Tools for notifiying the user about new video uploads.
*/
import * as config from "../config";

let sound = null;  // set by init()

// Takes an array of channel names to display a desktop notification about new
// video upload
function show_notification (channels) {
    if (channels.length === 0) {
        return;
    }
    let base = " uploaded new video(s)!";
    let message = "";
    if (channels.length === 1) {
        message = channels[0] + base;
    } else {
        base = " uploaded new videos!";
        message = channels[0] + " (and " + (channels.length - 1) +
                  " others)" + base;
    }

    browser.notifications.create(null, {
        "type": "basic",
        "title": "Youtube Subscription Checker",
        message
    });
}

// Play the notification sound. Must be used after a call to init
function play_sound () {
    sound.play();
}

function notify_new_upload (trans, channels) {
    config.get_one(trans, "play_sound", (_, play_config) => {
        show_notification(channels);
        if (play_config) {
            play_sound();
        }
    });
}

function init (on_click) {
    sound = new Audio("notification.ogg");
    // this is the only place we create notification
    browser.notifications.onClicked.addListener(() => on_click());
}

export {
    init,
    notify_new_upload,
}
