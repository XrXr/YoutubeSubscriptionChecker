/* jshint unused:strict */
const ss = require("sdk/simple-storage");
const storage = require("./storage");
const config = require("../config");
const filters = require("./filters");
const util = require("../util");

// TODO: these work under the assumption that v3 is not in use, but that's not how they are used currently
function v2InUse() {
    return ss.storage.videos && Array.isArray(ss.storage.videos);
}

function v1InUse() {
    return !v2InUse();
}


// migrating from v1 and v2 is the same except for videos
function do_migration(video_migration, cb) {
    storage.initialize_db(err => {
        if (err) {
            return cb(err);
        }
        storage.open((err, db) => {
            if (err) {
                return cb(err);
            }
            let migrate = db.transaction(storage.STORE_NAMES, "readwrite");
            fill_configs(migrate, util.noop);
            fill_channels(migrate, util.noop);
            video_migration(migrate, util.noop);
            migrate.oncomplete = () => cb();
            migrate.onabort = () => cb(Error("migration failed"));
            db.close();
        });
    });
}

function v1Tov3(cb) {
    if (!v1InUse()) {
        throw Error("wrong migration routine called");
    }
    do_migration((trans, done) => {
        // in v1 the video property has an object which maps channel
        // ids to list of videos
        util.cb_each(Object.keys(ss.storage.videos), (key, add_videos_done) => {
            storage.video.add_list(trans, ss.storage.videos[key], add_videos_done);
        }, done);
    }, cb);
}

function v2Tov3(cb) {
    if (!v2InUse()) {
        throw Error("wrong migration routine called");
    }
    do_migration((trans, done) => {
        storage.video.add_list(trans, ss.storage.videos, done);
    }, cb);
}

function fill_configs(trans, cb) {
    util.cb_join([done => {
        config.update(trans, ss.storage.config, done);
    }, done => {
        storage.update_last_check(trans, done, storage.last_checked);
    }], cb);
}

function fill_channels(trans, cb) {
    util.cb_join([function add_channels(done) {
        util.cb_each(ss.storage.subscriptions, (channel, done) => {
            storage.channel.add_one(trans, channel, err => {
                if (err) {
                    return done(err);
                }
                storage.check_stamp.update(trans, channel.id, channel.latest_date, done);
            });
        }, done);
    }, function add_filters(done) {
        let all_filters = [];
        for (let channel of ss.storage.subscriptions) {
            if (Array.isArray(channel.filters)) {
                all_filters = all_filters.concat(channel.filters);
            }
        }

        filters.update(trans, all_filters, done);
    }], cb);
}

exports.v1InUse = v1InUse;
exports.v2InUse = v2InUse;
exports.v1Tov3 = v1Tov3;
exports.v2Tov3 = v2Tov3;