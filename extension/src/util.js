/*
This Source Code Form is subject to the terms of the
Mozilla Public License, v. 2.0.
If a copy of the MPL was not distributed with this file,
You can obtain one at http://mozilla.org/MPL/2.0/.
Author: XrXr
*/
const config = {};  // TODO: require("./config");
const { log_error } = {}  // TODO: require("./logger");

function noop () {};

function nice_duration (ISO_8601_string) {
    let time = ISO_8601_string.replace("PT", "").toUpperCase();
    let h = extract('H');
    let m = extract('M');
    let s = extract('S');
    return h !== '00' ? [h, m, s].join(':') : [m, s].join(':');

    function extract (stop) {
        for (let i = 0; i < time.length; i++) {
            if (time[i] === stop) {
                let val = time.slice(0, i);
                if (val.length === 1 && stop !== 'H') {
                    val = '0' + val;
                }
                time = time.slice(i + 1);
                return val;
            }
        }
        return '00';
    }
}

function wrap_promise (p) {
    // Wrap a promise in another promise that will always be accepted
    // On acceptance of the original promise.
    // Resolves with {success, value}
    return new Promise(function (resolve) {
        p.then(result => {
            // if (Math.random() < 0.5) {
            //     deferred.resolve([true, result]);
            // }else{
            //     deferred.resolve([false, "shabangbang!"]);
            // }
            resolve(new SettleResult(true, result));
        }, reason => {
            resolve(new SettleResult(false, reason));
        });
    });
}

function SettleResult(success, value) {
    this.success = success;
    this.value = value;
}

// sort videos so that videos from the same channel are grouped together,
// videos are sorted in reverse chronological order within each group, and
// groups are sorted in reverse chronological order by the most recent video
// in the group
function sort_videos(vids) {
    vids.sort((a, b) => {
        // by channel id then by published_at
        let ac = a.channel_id;
        let bc = b.channel_id;
        let ap = a.published_at;
        let bp = b.published_at;
        if (ac === bc) {
            return compare(bp, ap);
        } else {
            return compare(ac, bc);
        }
    });
    return flatten(group_by_channel(vids).sort((a, b) => {
        return compare(b[0].published_at, a[0].published_at);
    }));
}

function compare(a, b) {
    if (a === undefined && b !== undefined) {
        return -1;
    }
    if (b === undefined && a !== undefined) {
        return 1;
    }
    if (a === b) {
        return 0;
    }
    return a > b ? 1 : -1;
}

function group_by_channel(videos) {
    if (videos.length === 0) {
        return [];
    }
    let result = [];
    let current_channel = videos[0].channel_id;
    let current_group = [];
    for (let v of videos) {
        if (current_channel === v.channel_id) {
            current_group.push(v);
        } else {
            result.push(current_group);
            current_channel = v.channel_id;
            current_group = [v];
        }
    }
    result.push(current_group);
    return result;
}

// flatten by one level
function flatten(l) {
    return [].concat(...l);
}

// run a list of async operations and collect their result in an array with
// {success, value}. f is a function that gets passed an element of list and
// a callback to call when the operation is complete
function cb_settle(list, f, cb) {
    let total = list.length;
    let final_result = Array(list.length);
    if (list.length === 0) {
        return cb(null, final_result);
    }
    for (let i = 0; i < list.length; i++) {
        try {
            f(list[i], done.bind(null, i));
        } catch (e) {
            if (!final_result[i]) {
                done(i, e);
            }
        }
    }

    function done(idx, err, result) {
        final_result[idx] = {
            success: !err,
            value: err ? err : result
        };
        if (--total === 0) {
            cb(null, final_result);
        }
    }
}

// run async operation of a list of data, terminate when one of them fail or
// all of them complete. Main callback called with first failure.
// f is a function that gets passed an element of list and
// a callback to call when the operation is complete
function cb_each(list, f, cb) {
    let done = false;
    let total = list.length;
    if (list.length === 0) {
        return cb(null, list);
    }
    for (let i = 0; i < list.length; i++) {
        try {
            f(list[i], unit_done);
        } catch (e) {
            return unit_done(e);
        }
    }

    function unit_done(err) {
        if (done) {
            return;
        }
        if (err) {
            done = true;
            cb(err);
        } else if (--total === 0) {
            done = true;
            cb(null, list);
        }
    }
}

// call a list of functions with a node style callback, if all of them succeed
// call `handler` with the results as arguments, following a `null` as the
// first argument. If there are any failures `handler` is called with the
// first error. Inspired by bluebird's Promise.join
function cb_join(tasks, handler) {
    let done = false;
    let tasks_left = tasks.length;
    let results = Array(tasks.length);
    for (let i = 0; i < tasks.length; i++) {
        try {
            tasks[i](instance_done.bind(null, i));
        } catch (e) {
            return instance_done(i, e);
        }
    }

    function instance_done(write_to, err, instance_result) {
        if (done) {
            return;
        }
        --tasks_left;
        if (err) {
            done = true;
            return handler(err);
        }
        results[write_to] = instance_result;
        if (tasks_left === 0) {
            done = true;
            results.unshift(null);
            return handler.apply(null, results);
        }
    }
}

function open_video (trans, id) {
    if (typeof id !== "string") {
        return log_error("open_video was called with a non-string id");
    }
    config.get_one(trans, "in_background", (err, in_background) => {
        if (err) {
            log_error("could not get open in background setting for opening video", err);
            in_background = false;
        }
        chrome.tabs.create({
            url: "https://www.youtube.com/watch?v=" + id,
            active: !in_background
        });
    });
}

// The returned array's ording matches the ording of `property_names`
// fetch_properties :: Object -> [String] -> [a]
function fetch_properties (obj, property_names) {
    return property_names.map(name => obj[name]);
}

export {
    fetch_properties,
    open_video,
    nice_duration,
    wrap_promise,
    sort_videos,
    cb_settle,
    cb_each,
    cb_join,
};
