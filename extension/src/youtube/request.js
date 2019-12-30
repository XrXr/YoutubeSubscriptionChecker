/*
This Source Code Form is subject to the terms of the
Mozilla Public License, v. 2.0.
If a copy of the MPL was not distributed with this file,
You can obtain one at http://mozilla.org/MPL/2.0/.
Author: XrXr

This module provide functions for making api certain YouTube Data API V3
requests. All functions return promise.
*/
import { nice_duration } from "../util";

const api_key = "AIzaSyB6mi40O6WOd17yjeYkK-y5lIU4FvoR8fo";

const log_error = e => console.error(e);

const api_request = (() => {
    function make_request (url) {
        return window.fetch(url).then(response => response.json());
    }

    function api_url (action, param) {
        let url = "https://www.googleapis.com/youtube/v3/" + action + '?';
        url += new URLSearchParams({...param, key: api_key }).toString();
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
            duration: nice_duration(json.items[0].contentDetails.duration)
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
            duration: nice_duration(res.contentDetails.duration),
            tags: (res.snippet && res.snippet.tags) || []
        };
    });
}

function get_video_info (video_id_list) {
    let joined_id = video_id_list.join(",");
    return api_request("videos", {
        part: "snippet,contentDetails,id",
        fields: "items(id,contentDetails/duration,snippet(title,channelTitle,channelId,publishedAt,thumbnails/medium))",
        id: joined_id,
        maxResults: 50,
    }).then(response => {
        return response.items.map(video_item => ({
            duration: nice_duration(video_item.contentDetails.duration),
            thumbnails: video_item.snippet.thumbnails,
            video_id: video_item.id,
            title: video_item.snippet.title,
            published_at: video_item.snippet.publishedAt,
            channel_id: video_item.snippet.channelId,
            channel_title: video_item.snippet.channelTitle,
        }));
    });
}

get_video_info.batch_size = 50;

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

export {
    search_channel,
    get_duration,
    get_activities,
    get_tags_and_duration,
    get_video_info,
    VIDEO_DOES_NOT_EXIST,
};
