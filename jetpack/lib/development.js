/*
This Source Code Form is subject to the terms of the
Mozilla Public License, v. 2.0.
If a copy of the MPL was not distributed with this file,
You can obtain one at http://mozilla.org/MPL/2.0/.
Author: XrXr

This module fills test data into either the indexed-db or simple storage for
testing during development. This file is stripped out by the build tool from
the final xpi file.
*/
"use strict";

if (!("YTCHECKERDEBUG" in require("sdk/system").env)) {
    throw Error("this module is only for development");
}
console.log("Youtube Subscription Checker in development mode");

const storage = require("./core/storage");
const filters = require("./core/filters");

function run(cb) {
    storage.open((err, db) => {
        if (err) {
            console.error(err);
            return;
        }

        let trans = db.transaction(["channel", "filter", "video", "check_stamp"], "readwrite");

        const add_channel = (chan) => {
            storage.channel.add_one(trans, chan, () => {});
            //2013-10-28T00:00:00.000Z
            storage.check_stamp.update(trans, chan.id, 1382918400000);
        };

        add_channel({
            "title": "Northernlion",
            "id": "UC3tNpTOHsTnkmbwztCs30sA",
        });

        add_channel({
            "title": "Youtube's name has been modified to be long for testing",
            "id": "UCBR8-60-B28hp2BmDPdntcQ",
        });

        add_channel({
            "title": "Minute Physic",
            "id": "UCUHW94eEFW7hkUMVaZz4eDg",
        });

        add_channel({
            "title": `<div onmouseover="alert('cats')">hi!</div>`,
            "id": "this channel doesn't exist",
        });

        filters.update(trans, [{
            channel_id: "UC3tNpTOHsTnkmbwztCs30sA",
            video_title_pattern: "isaac",
            video_title_is_regex: false,
            include_on_match: true,
            inspect_tags: true
        }]);

        storage.video.add_one(trans, {
            "duration": "",
            "video_id": "this video is dummy",
            "thumbnails": {
                "medium": {
                    "url": "http://loremflickr.com/320/180",
                    "width": 320,
                    "height": 180
                },
            },
            "title": `Duration should say "Deleted"`,
            "channel_id": "UC3tNpTOHsTnkmbwztCs30sA",
            "channel_title": "Youtube Subscription Checker",
            "published_at": "2016-05-11T13:00:00.000Z"
        });

        trans.oncomplete = trans.onabort = () => {
            db.close();
            cb();
        };
    });
}

// var { Hotkey } = require("sdk/hotkeys");

// var showHotKey = Hotkey({
//   combo: "accel-p",
//   onPress: () => {
//     storage.subscriptions[0].latest_date = ((new Date()).getTime() - 12000000000);
//     check_all();
//   }
// });


exports.run = run;
