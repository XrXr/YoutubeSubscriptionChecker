const base64 = require("sdk/base64");

const util = require("../util");
const storage = require("./storage");
const config = require("../config");

function export_all (trans, cb) {
    util.cb_join([done => {
        storage.channel.get_all(trans, (err, channel_list) => {
            if (err) {
                return done(err);
            }
            util.cb_each(channel_list, (channel, filter_done) => {
                storage.filter.get_for_channel(trans, channel.id, (err, filters) => {
                    if (err) {
                        return filter_done(err);
                    }
                    channel.filters = filters;
                    filter_done();
                });
            }, () => done(null, channel_list));
        });
    }, done => {
        storage.video.get_all(trans, done);
    }, done => {
        config.get_all(trans, done);
    }], (err, channels, videos, config) => {
        if (err) {
            return cb(err);
        }
        cb(null, JSON.stringify({
            channels,
            videos,
            config
        }));
    });
}

function import_all (encoded) {
    let input;
    try {
        input = JSON.parse(base64.decode(encoded, "utf-8"));
    } catch (e) {
        return false;
    }
    if (!input.hasOwnProperty("channels") || !input.hasOwnProperty("videos") ||
        !input.hasOwnProperty("config")) {
        return false;
    }
    for (let channel_ of input.channels) {  // validate every filter
        if (!channel_.filters.every(filters.is_full_filter)) {
            return false;
        }
    }
    for (let channel_ of input.channels) {
        let existing_channel = channel.get_by_id(channel_.id);
        if (existing_channel === undefined) {
            channel_.latest_date = (new Date()).getTime();
            storage.subscriptions.push(channel_);
        } else {  // channel already exists
            // merge list of filters
            for (let filter_to_add of channel_.filters) {
                if (!existing_channel.filters.some(
                        filters.filters_equal.bind(null, filter_to_add))) {
                    existing_channel.filters.push(filter_to_add);
                }
            }
        }
    }
    for (let video_ of input.videos) {
        if (video.get_by_id(video_.video_id) === undefined) {
            storage.videos.push(video_);
        }
    }
    config.update(input.config);
    return true;
}

exports.import_all = import_all;
exports.export_all = export_all;
