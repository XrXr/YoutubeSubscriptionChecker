/*
This Source Code Form is subject to the terms of the
Mozilla Public License, v. 2.0.
If a copy of the MPL was not distributed with this file,
You can obtain one at http://mozilla.org/MPL/2.0/.
Author: XrXr

This module provide functions for making api certain YouTube Data API V3
requests. All functions return promise.
*/
const util = require("util");
const { defer } = require("sdk/core/promise");
const api_util = require("api/util");

const api_request = (() => {
    const api_key = "AIzaSyB6mi40O6WOd17yjeYkK-y5lIU4FvoR8fo";

    function make_request (url) {
        let deferred = defer();
        require("sdk/request").Request({
            url: url,
            onComplete: response => {
                if (response.status === 200) {
                    deferred.resolve(response.json);
                } else {
                    deferred.reject(response);
                }
            }
        }).get();
        return deferred.promise;
    }

    function api_url (method, param) {
        let url = "https://www.googleapis.com/youtube/v3/" + method + '?';
        for (var key in param) {
            if (param.hasOwnProperty(key)) {
                url = url + key + "=" + param[key] + "&";
            }
        }
        url += "key=" + api_key;
        return url;
    }
    return (action, api_args) => make_request(api_url(action, api_args));
})();

// Request a channel's activities.
// Return a promise that resolves to api response
function get_activities (channel) {
    return api_request("activities", {
        part: "snippet,contentDetails",
        channelId: channel.id,
        publishedAfter: (new Date(channel.latest_date)).toISOString(),
        maxResult: 50
    });
}

// Request duration of a video resource. Return a promise that resolves
// to an object with channel_id, video_id, and duration
function get_duration (video) {
    // video.duration = "";
    return api_request("videos", {
        part: "contentDetails",
        id: video.video_id,
    }).then(json => {
        return {
            channel_id: video.channel_id,
            video_id: video.video_id,
            duration: util.nice_duration(json.items[0].
                        contentDetails.duration)
        };
    });
}

// Request to search channel matching `query`. Return a promise that will
// resolve to either [null] or [channels]
function search_channel (query) {
    return api_request("search", {
        part: "snippet",
        type: "channel",
        order: "relevance",
        q: query
    }).then(response_json => {
        let pay_load = [null];  // null tells the UI no channels were found
        if (response_json.pageInfo.totalResults > 0) {
            pay_load = [];
            // show top 3 or less
            let how_many = Math.min(response_json.pageInfo.totalResults, 3);
            for (var i = 0; i < how_many; i++) {
                pay_load.push({
                    title: response_json.items[i].snippet.title,
                    thumbnail: response_json.items[i].
                        snippet.thumbnails.medium.url,
                    id: response_json.items[i].id.channelId
                });
            }
        }
        return pay_load;
    }, console.log).then(null, console.log);
}

exports.search_channel = search_channel;
exports.get_duration = get_duration;
exports.get_activities = get_activities;