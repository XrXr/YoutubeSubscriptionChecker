const tabs = require("sdk/tabs");

exports.noop = function () {};
exports.fetch_properties = fetch_properties;
exports.open_video = open_video;
exports.nice_duration = nice_duration;
exports.wrap_promise = wrap_promise;
exports.cb_settle = cb_settle;
exports.cb_each = cb_each;
exports.cb_join = cb_join;

const config = require("./config");
const { log_error } = require("./logger");

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
        f(list[i], done.bind(null, i));
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
        return cb(null);
    }
    for (let i = 0; i < list.length; i++) {
        f(list[i], unit_done);
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
            cb(null);
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
        tasks[i](instance_done.bind(null, i));
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

function SettleResult(success, value) {
    this.success = success;
    this.value = value;
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
        tabs.open({
            url: "https://www.youtube.com/watch?v=" + id,
            inBackground: in_background
        });
    });
}

// The returned array's ording matches the ording of `property_names`
// fetch_properties :: Object -> [String] -> [a]
function fetch_properties (obj, property_names) {
    return property_names.map(name => obj[name]);
}
