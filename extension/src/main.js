/*
This Source Code Form is subject to the terms of the
Mozilla Public License, v. 2.0.
If a copy of the MPL was not distributed with this file,
You can obtain one at http://mozilla.org/MPL/2.0/.
Author: XrXr
*/

import * as request from "./youtube/request";

// request.search_channel()
//     .then(r => {
//         browser.notifications.create(null, {
//             "type": "basic",
//             "title": "YoutubeSubscriptionChecker",
//             "message": JSON.stringify(r)
//         });
//     });

function logURL(requestDetails) {
  console.log("Loading: " + requestDetails.url);
  browser.tabs.update(requestDetails.tabId, {url: chrome.extension.getURL("hub/home.html")});
  return {cancel:true}
}

browser.webRequest.onBeforeRequest.addListener(
  logURL,
  {urls: ["https://youtube-subscription-checker/*"], types:["main_frame"]},
  ["blocking"]
);

browser.notifications.create(null, {
    "type": "basic",
    "title": "YoutubeSubscriptionChecker",
    "message": "Add-on loaded"
});

window.request = request


