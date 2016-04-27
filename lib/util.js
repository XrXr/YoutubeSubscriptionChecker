const tabs = require("sdk/tabs");
const { defer } = require("sdk/core/promise");
const add_on_name = require("sdk/self").name;

const config = require("./config");

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
    for (let i = 0; i < list.length; i++) {
        f(list[i], unit_done);
    }

    function unit_done(err) {
        if (err && !done) {
            cb(err);
            done = true;
        }
        if (--total === 0) {
            cb(null);
        }
    }
}

function SettleResult(success, value) {
    this.success = success;
    this.value = value;
}

function open_video (video) {
    tabs.open({
        url: "https://www.youtube.com/watch?v=" + video.video_id,
        inBackground: config.get_one("in_background")
    });
}

// The returned array's ording matches the ording of `property_names`
// fetch_properties :: Object -> [String] -> [a]
function fetch_properties (obj, property_names) {
    return property_names.map(name => obj[name]);
}

const log_error = console.log.bind(console, add_on_name);

exports.fetch_properties = fetch_properties;
exports.open_video = open_video;
exports.nice_duration = nice_duration;
exports.wrap_promise = wrap_promise;
exports.log_error = log_error;
exports.cb_settle = cb_settle;
exports.cb_each = cb_each;
