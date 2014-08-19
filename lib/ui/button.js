/*
This Source Code Form is subject to the terms of the
Mozilla Public License, v. 2.0.
If a copy of the MPL was not distributed with this file,
You can obtain one at http://mozilla.org/MPL/2.0/.
Author: XrXr
*/
const { ActionButton } = require("sdk/ui/button/action");
const { Page } = require("sdk/page-worker");

let button = null;
let presist = null;

// Initialize the button in inactive state, with click action being `on_click`
function init(on_click) {
    presist = Page({
        contentScriptFile: data.url("ui/button/renderer.js"),
        contentURL: data.url("ui/button/renderer.html")
    });
    presist.port.on("icons", new_icons => button.icons = new_icons);
    button = ActionButton({
        id: "hub",
        icon: {
            "32": data.url("icons/inactive.png"),
            "64": data.url("icons/inactive64.png"),
        },
        label: "Youtube Subscription Checker\nNo new videos",
        onClick: on_click
    });
}

function inactive() {
    button.icon = {
        "32": data.url("icons/inactive.png"),
        "64": data.url("icons/inactive64.png"),
    };
}

// Take the number of unwatched videos to update the button appropriately
// 0        -> disabled
// 1 and up -> activated icon with number on the corner
function update(video_count) {
    if (presist === null) {
        throw Error("ui/button: Attempt to update button before init");
    }
    if (video_count > 0) {
        button.label = "Youtube Subscription Checker\n" +
                        video_count + " new videos";
        // handler for the drawing result is in init
        presist.port.emit("draw", video_count);
    } else {
        inactive();
        button.label = "Youtube Subscription Checker\nNo new videos";
    }
}

exports.init = init;
exports.update = update;