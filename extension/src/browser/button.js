/*
This Source Code Form is subject to the terms of the
Mozilla Public License, v. 2.0.
If a copy of the MPL was not distributed with this file,
You can obtain one at http://mozilla.org/MPL/2.0/.
Author: XrXr
*/
const inactive_tooltip = "Youtube Subscription Checker\nNo new videos";
const button = browser.browserAction
// Initialize the button in inactive state, with click action being `on_click`
function init (on_click) {
    button.setBadgeBackgroundColor({color: "#5f5f5f"});
    button.onClicked.addListener(on_click);
}

// Take the number of unwatched videos to update the button appropriately
// 0        -> disabled
// 1 and up -> activated icon with number on the corner
function update (video_count) {
    let badget_text, title, icon;
    if (video_count > 0) {
        badget_text = {text: String(video_count)};
        title = {title: "Youtube Subscription Checker\n" +
                        video_count + " new videos"};
        icon = {
            path: {
                32: browser.extension.getURL("icons/active.png"),
                64: browser.extension.getURL("icons/active64.png"),
            },
        };
    } else {
        badget_text = {text: ""};
        title = {title: inactive_tooltip};
        icon = {
            path: {
                32: browser.extension.getURL("icons/inactive.png"),
                64: browser.extension.getURL("icons/inactive64.png"),
            },
        };
    }
    button.setBadgeText(badget_text);
    button.setTitle(title);
    button.setIcon(icon);
}

export {
    init,
    update,
};
