/*
This Source Code Form is subject to the terms of the
Mozilla Public License, v. 2.0.
If a copy of the MPL was not distributed with this file,
You can obtain one at http://mozilla.org/MPL/2.0/.
Author: XrXr

*/
import * as request from "./youtube/request";

request.search_channel()
    .then(r => {
        // browser.notifications.create(null, {
        //     "type": "basic",
        //     "title": "YoutubeSubscriptionChecker",
        //     "message": JSON.stringify(r)
        // });
        console.log(r)
    });


        browser.notifications.create(null, {
            "type": "basic",
            "title": "YoutubeSubscriptionChecker",
            "message": "sd"
        });

window.request = request
