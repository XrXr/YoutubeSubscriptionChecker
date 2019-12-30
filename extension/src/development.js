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
import * as storage from "./persistent/storage";
import * as filters from "./persistent/filters";
import { get_db } from './main';
import * as youtube_request from "./youtube/request";

console.log("Running in development mode");

function run(cb) {
    storage.open((err, db) => {
        if (err) {
            console.error(err);
            return;
        }

        let trans = db.transaction(["channel", "filter", "video", "history", "check_stamp"], "readwrite");

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

        // add_channel({
        //     "title": "Minute Physic",
        //     "id": "UCUHW94eEFW7hkUMVaZz4eDg",
        // });

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
            "video_id": "Z3IPVWN-1ks",
            "thumbnails": {
                "medium": {
                    "url": "http://loremflickr.com/320/180",
                    "width": 320,
                    "height": 180
                },
            },
            "title": `title is wrong`,
            "channel_id": "UC3tNpTOHsTnkmbwztCs30sA",
            "published_at": "2016-05-11T13:00:00.000Z"
        });

        storage.video.add_one(trans, {
            "video_id": "m45rcGuC9v0",
            "thumbnails": {
                "medium": {
                    "url": "http://loremflickr.com/320/180",
                    "width": 320,
                    "height": 180
                },
            },
            "title": `deleted video`,
            "channel_id": "UC3tNpTOHsTnkmbwztCs30sA",
            "published_at": "2016-05-11T13:00:00.000Z"
        });

        storage.history.add_one(trans, {
            "video_id": "pgzEI4kvJFo",
            "thumbnails": {
                "medium": {
                    "url": "http://loremflickr.com/320/180",
                    "width": 320,
                    "height": 180
                },
            },
            "title": `title is wrong (sci show video)`,
            "channel_id": "UCZYTClx2T1of7BRZ86-8fow",
            "published_at": "2016-05-11T13:00:00.000Z"
        });

        // storage.video.add_one(trans, {
        //     "duration": "",
        //     "video_id": "this video is dummy",
        //     "thumbnails": {
        //         "medium": {
        //             "url": "http://loremflickr.com/320/180",
        //             "width": 320,
        //             "height": 180
        //         },
        //     },
        //     "title": `Duration should say "Deleted"`,
        //     "channel_id": "UC3tNpTOHsTnkmbwztCs30sA",
        //     "channel_title": "Youtube Subscription Checker",
        //     "published_at": "2016-05-11T13:00:00.000Z"
        // });

        trans.oncomplete = trans.onabort = () => {
            db.close();
            cb();
        };
    });
}

export default run;
