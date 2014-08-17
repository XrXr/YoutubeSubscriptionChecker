/*
This Source Code Form is subject to the terms of the
Mozilla Public License, v. 2.0.
If a copy of the MPL was not distributed with this file,
You can obtain one at http://mozilla.org/MPL/2.0/.
Author: XrXr

Filters are stored inside each channel objects, instead a centralized location.
This property make them hard to work with as a group. This module provide
utilities to help with said issue plus tools for working with individual filters
*/
const core = require("core/storage");
const { storage } = require("sdk/simple-storage");

function Filter (channel_name, matcher, is_regex, include) {
    if (!(this instanceof Filter)){
        return new Filter(channel_name, matcher, is_regex, include);
    }
    this.id = get_channel_by_name(channel_name).id;
    this.channel = channel_name;
    this.match = matcher.toLowerCase();
    this.is_regex = is_regex;
    this.include = include;
}

function filter_videos (videos, filters) {
    // put a group of videos from the same channel through filters,
    // return [[include], [exclude]]
    let include = videos;
    let exclude = [];
    filters = filters || [];
    for(let filter of filters){
        let regex;
        if (filter.is_regex){
            regex = new RegExp(filter.match, "i");
        }
        let result = [];
        for (let i = include.length - 1; i >= 0; i--){
            let passed;
            let title = videos[i].snippet.title.toLowerCase();
            passed = regex ? regex.test(title) :
                             title.contains(filter.match);
            if (filter.include){
                passed = !passed;
            }
            if (passed){
                result.unshift(videos[i]);
                include.splice(i, 1);
            }
        }
        exclude = exclude.concat(result);
    }
    return [include, exclude];
}

function update(filters) {
    // overwrite all the filters.
    for (let channel of storage.subscriptions){
        channel.filters = [];
    }
    filters = filters.map(f => Filter(f.channel, f.match, f.regex, f.include));
    for (let filter of filters){
        let channel = core.channel.get_by_id(filter.id);
        channel.filters.push(filter);
    }
}

function get_all() {
    let result = [];
    for (let channel of storage.subscriptions){
        channel.filters = channel.filters || [];
        result.push(...channel.filters);
    }
    return result;
}

exports.filter_videos = filter_videos;
exports.update = update;
exports.get_all = get_all;