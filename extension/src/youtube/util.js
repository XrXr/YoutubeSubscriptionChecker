/*
This Source Code Form is subject to the terms of the
Mozilla Public License, v. 2.0.
If a copy of the MPL was not distributed with this file,
You can obtain one at http://mozilla.org/MPL/2.0/.
Author: XrXr

This module provide functions for processing response form Youtube's api.
*/

// property names that are in normalized activity object
let normalize_property_set = {};
for (let name of ["video_id", "thumbnails", "title", "channel_id",
                  "channel_title", "duration", "tags", "published_at"]) {
    normalize_property_set[name] = true;
}

let activity = {
    /*
    process `response` in place so that it has the following structure:
    {
        "video_id": string,
        "thumbnails": {
            (key): {
                "url": string,
                "width": unsigned integer,
                "height": unsigned integer
            }
        },
        "title": string,
        "channel_id": string,
        "published_at": string,
        "duration": ""  // will be filled later
    }
    properties that are not in the above structure are deleted.
    This function is pivotal to the application, since all other modules and
    the ui expects normalized keys.
    */
    normalize: response => {
        response.video_id = response.contentDetails.upload.videoId;
        response.thumbnails = response.snippet.thumbnails;
        response.title = response.snippet.title;
        response.channel_id = response.snippet.channelId;
        response.channel_title = response.snippet.channelTitle;
        response.published_at = response.snippet.publishedAt;
        for (let key in response) {
            if (!(key in normalize_property_set)) {
                delete response[key];
            }
        }
        if (!("duration" in response)) {
            response.duration = "";
        }
    },
    is_upload: response => response.snippet &&
                           response.snippet.type === 'upload',
    // below only works for upload activities
    get_channel_id: response => response.channel_id || (response.snippet &&
                                response.snippet.channelId),
    get_publish_date: response => response.snippet.publishedAt,
    get_video_id: response => response.video_id ||
                              (response.contentDetails &&
                               response.contentDetails.upload &&
                               response.contentDetails.upload.videoId)
};

export {
    activity,
};
