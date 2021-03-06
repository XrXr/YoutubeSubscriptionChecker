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
import { fetch_properties } from '../util';
import { filter_store } from "./storage";

const is_bool = val => (val === true || val === false);

const raw_filter_expectations = [
    ["channel_id", is_string],
    ["video_title_pattern", is_string],
    ["video_title_is_regex", is_bool],
    ["include_on_match", is_bool],
    ["inspect_tags", is_bool]
];

const full_filter_expectations = [
    raw_filter_expectations[0],
    ["video_title_pattern", val => is_string(val) && val.toLowerCase() === val],
    raw_filter_expectations[2],
    raw_filter_expectations[3],
    raw_filter_expectations[4],
];

function is_string(val) {
    return (typeof val === "string");
}

// Checks an object against some expectations
function validate (property_expectations, raw_filter) {
    if (!raw_filter) return false;
    for (let expectation of property_expectations) {
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

function Filter (channel_id, video_title_pattern, video_title_is_regex,
                 include_on_match, inspect_tags) {
    return {
        channel_id,
        include_on_match,
        inspect_tags,
        video_title_is_regex,
        video_title_pattern: video_title_pattern.toLowerCase()
    };
}
// Pay attention to
// the ordering of `raw_filter_expectations` and the ordering of
// arguments in `Filter()`. They *must* match.
Filter.arg_names = raw_filter_expectations.map(a => a[0]);
Filter.property_names = full_filter_expectations.map(a => a[0]);

// test whether a video match with conditions inside a filter
function test_filter (filter, video) {
    let regex;
    if (filter.video_title_is_regex) {
        regex = new RegExp(filter.video_title_pattern, "i");
    }
    const to_test = [video.title].concat(video.tags || [])
        .map(subject => subject.toLowerCase());
    return to_test.some(subject => regex ? regex.test(subject) :
        subject.includes(filter.video_title_pattern));
}

// put a group of videos from the same channel through filters,
// return [[include], [exclude]]
function filter_videos (videos, filters) {
    filters = filters || [];
    let include = videos.concat();
    let exclude = [];
    let include_filters = [];
    let exclude_filters = [];
    for (let filter of filters) {
        let target = filter.include_on_match ? include_filters :
                                               exclude_filters;
        target.push(filter);
    }
    let has_include_filters = include_filters.length > 0;
    let ordered_filters = include_filters.concat(exclude_filters);
    if (has_include_filters) {
        [include, exclude] = [exclude, include];
    }
    for (let filter of ordered_filters) {  // first apply the include filters
        let take_from = include;
        let put_to = exclude;
        let should_transfer = test_filter.bind(null, filter);
        if (filter.include_on_match) {
            [put_to, take_from] = [take_from, put_to];
        }
        let result = [];
        for (let i = take_from.length - 1; i >= 0; i--) {
            if (should_transfer(take_from[i])) {
                result.unshift(take_from[i]);
                take_from.splice(i, 1);
            }
        }
        // results from filters should be in same order as the filters
        put_to.push(...result);
    }
    return [include, exclude];
}

function add_list(trans, filters) {
    let store = filter_store(trans);
    for (let f of filters) {
        store.put(f);
    }
}

function update (trans, raw_filters) {
    // if any one of the raw filters fail validation, do nothing.
    if (!raw_filters.every(validate.bind(null, raw_filter_expectations))) {
        return;
    }

    filter_store(trans).clear();

    let trusted_filters = raw_filters.map(
        f => Filter(...fetch_properties(f, Filter.arg_names))
    );

    add_list(trans, trusted_filters);
}

// returns whether two filters are equal. This assumes the values passed in
// are valid full filters
function filters_equal (x, y) {
    for (let key of Filter.property_names) {
        if (x[key] !== y[key]) {
            return false;
        }
    }
    return true;
}

const is_full_filter = validate.bind(null, full_filter_expectations);

export {
    filter_videos,
    update,
    is_full_filter,
    filters_equal,
};
