/*
This Source Code Form is subject to the terms of the
Mozilla Public License, v. 2.0.
If a copy of the MPL was not distributed with this file,
You can obtain one at http://mozilla.org/MPL/2.0/.
Author: XrXr
*/
const { data } = require("sdk/self");
const { ActionButton } = require("sdk/ui/button/action");

let button;

const inactive_label = "Youtube Subscription Checker\nNo new videos";

// Initialize the button in inactive state, with click action being `on_click`
function init (on_click) {
    button = ActionButton({
        id: "hub",
        icon: {
            "32": data.url("icons/inactive.png"),
            "64": data.url("icons/inactive64.png"),
        },
        label: inactive_label,
        onClick: on_click,
        badgeColor: '#5f5f5f'
    });
}

// Take the number of unwatched videos to update the button appropriately
// 0        -> disabled
// 1 and up -> activated icon with number on the corner
function update (video_count) {
    if (!button) {
        throw Error("ui/button: Attempt to update button before init");
    }

    if (video_count > 0) {
        button.label = "Youtube Subscription Checker\n" +
                        video_count + " new videos";

        button.icon = {
            "32": data.url("icons/active.png"),
            "64": data.url("icons/active64.png"),
        };
        button.badge = video_count;
    } else {
        button.badge = undefined;
        button.icon = {
            "32": data.url("icons/inactive.png"),
            "64": data.url("icons/inactive64.png"),
        };
        button.label = inactive_label;
    }
}

exports.init = init;
exports.update = update;