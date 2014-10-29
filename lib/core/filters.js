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
const { fetch_properties } = require('util');
const { storage } = require("sdk/simple-storage");
const { isString } = require('sdk/lang/type');

const is_bool = val => (val === true || val === false);

const type_expectations = [
    ["channel_title", isString],
    ["video_title_pattern", isString],
    ["video_title_is_regex", is_bool],
    ["include_on_match", is_bool]
];
// Checks a raw filter input against some expectations
// Expect an object, return bool.
function validate (raw_filter) {
    for (let expectation of type_expectations){
        let [key, predicate] = expectation;
        // is expected property present?
        if (!raw_filter.hasOwnProperty(key)) {
            return false;
        }
        // if so, run it through the predicate
        if (predicate.call(null, raw_filter[key]) === false) {
            return false;
        }
    }
    return true;
}

function Filter (channel_title, video_title_pattern,
                 video_title_is_regex, include_on_match) {
    return {
        channel_id: core.channel.get_by_name(channel_title).id,
        channel_title: channel_title,
        video_title_pattern: video_title_pattern.toLowerCase(),
        video_title_is_regex: video_title_is_regex,
        include_on_match: include_on_match
    };
}
// Pay attention to
// the ordering of `type_expectations` and the ordering of
// arguments in `Filter()` *must* match.
Filter.arg_names = type_expectations.map(a => a[0]);

// put a group of videos from the same channel through filters,
// return [[include], [exclude]]
function filter_videos (videos, filters) {
    let include = videos;
    let exclude = [];
    filters = filters || [];
    for(let filter of filters){
        let regex;
        if (filter.video_title_is_regex){
            regex = new RegExp(filter.video_title_pattern, "i");
        }
        let result = [];
        for (let i = include.length - 1; i >= 0; i--){
            let passed;
            let title = videos[i].title.toLowerCase();
            passed = regex ? regex.test(title) :
                             title.contains(filter.video_title_pattern);
            if (filter.include_on_match){
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

function update (raw_filters) {
    // if any one of the raw filters fail validation, do nothing.
    if (raw_filters.every(validate) === false) {
        return;
    }
    // overwrite all the filters.
    for (let channel of storage.subscriptions) {
        channel.filters = [];
    }
    let trusted_filters = raw_filters.map(
        f => Filter(...fetch_properties(f, Filter.arg_names))
    );
    for (let filter of trusted_filters) {
        let channel = core.channel.get_by_id(filter.channel_id);
        channel.filters.push(filter);
    }
}

function get_all () {
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