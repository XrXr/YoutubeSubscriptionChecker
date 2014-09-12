const tabs = require("sdk/tabs");
const config = require("config");
const { defer } = require("sdk/core/promise");

function nice_duration (ISO_8601_string) {
    let result = ISO_8601_string.replace("PT", "")
                   .replace("M", ":").replace("S", "");
    let after = result.search('H') != -1 ?
        result.slice(result.search('H') + 1) : result;
    let colon = after.indexOf(":");
    if (colon == -1){
        return after.length == 1 ? "00:0" + after : "00:" + after;
    }
    if (colon == 1){
        after = "0" + after;
        colon += 1;
    }
    if (after.length - 2 == colon) {
        after = after.replace(":", ":0");
    }else if (after.length - 1 == colon){
        after += "00";
    }
    return result.search('H') != -1 ?
        result.slice(0, result.search('H')) + ":" + after : after;
}

function wrap_promise (p) {
    // Wrap a promise in another promise that will always be accepted
    // On acceptance of the original promise,
    // return a two array that looks like [true, result].
    // On failure, return [false, reason]
    let deferred = defer();
    p.then(function(result) {
        // if (Math.random() < 0.5){
        //     deferred.resolve([true, result]);
        // }else{
        //     deferred.resolve([false, "shabangbang!"]);
        // }
        deferred.resolve([true, result]);
    }, function(reason) {
        deferred.resolve([false, reason]);
    });
    return deferred.promise;
}

function open_video (video) {
    tabs.open({
        url: "https://www.youtube.com/watch?v=" + video.id.videoId,
        inBackground: config.get_one("in_background")
    });
}

exports.open_video = open_video;
exports.nice_duration = nice_duration;
exports.wrap_promise = wrap_promise;