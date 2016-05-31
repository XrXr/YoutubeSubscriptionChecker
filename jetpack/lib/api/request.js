/*
This Source Code Form is subject to the terms of the
Mozilla Public License, v. 2.0.
If a copy of the MPL was not distributed with this file,
You can obtain one at http://mozilla.org/MPL/2.0/.
Author: XrXr

This module provide functions for making api certain YouTube Data API V3
requests. All functions return promise.
*/
const { defer } = require("sdk/core/promise");

const util = require("../util");
const { log_error } = require("../logger");

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

// Request a channel's activities after a date
// Return a promise that resolves to api response
function get_activities (channel, after) {
    return api_request("activities", {
        part: "snippet,contentDetails",
        channelId: channel.id,
        publishedAfter: new Date(after).toISOString(),
        maxResults: 50
    });
}

const VIDEO_DOES_NOT_EXIST = Symbol("Video does not exist");
exports.VIDEO_DOES_NOT_EXIST = VIDEO_DOES_NOT_EXIST;
function get_duration (video_id) {
    return api_request("videos", {
        part: "contentDetails",
        fields: "items/contentDetails/duration",
        id: video_id,
    }).then(json => {
        if (json.items.length === 0) {
            throw VIDEO_DOES_NOT_EXIST;
        }
        return {
            video_id,
            duration: util.nice_duration(json.items[0].contentDetails.duration)
        };
    });
}

function get_tags_and_duration (video_id) {
    return api_request("videos", {
        part: "snippet,contentDetails",
        fields: "items/contentDetails/duration,items/snippet/tags",
        id: video_id,
    }).then(res => {
        res = res.items[0];
        return {
            duration: util.nice_duration(res.contentDetails.duration),
            tags: (res.snippet && res.snippet.tags) || []
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
    }, log_error).then(null, log_error);
}

exports.search_channel = search_channel;
exports.get_duration = get_duration;
exports.get_activities = get_activities;
exports.get_tags_and_duration = get_tags_and_duration;