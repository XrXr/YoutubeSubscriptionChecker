/* jshint unused:strict */
const ss = require("sdk/simple-storage");
const storage = require("./storage");
const config = require("../config");
const filters = require("./filters");
const util = require("../util");
const api_util = require("../api/util");

function decide_migration_path(cb) {
    storage.initialize_db((err, did_db_setup) => {
        if (err) {
            return cb(err);
        }

        if (!did_db_setup) {  // already using indexed-db
            return cb();
        }

        if (Object.keys(ss.storage).length === 0) {
            return cb();
        } else if (ss.storage.videos && Array.isArray(ss.storage.videos)) {
            return cb(null, v2Tov3);
        } else {
            return cb(null, v1Tov3);
        }
    });
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
    do_migration((trans, done) => {
        // in v1 the video property has an object which maps channel
        // ids to list of videos
        util.cb_each(Object.keys(ss.storage.videos), (key, add_videos_done) => {
            let vids = ss.storage.videos[key].map(video => {
                let copy = JSON.parse(JSON.stringify(video));
                api_util.activity.normalize(copy);
                return copy;
            });
            storage.video.add_list(trans, vids, add_videos_done);
        }, done);
    }, cb);
}

function v2Tov3(cb) {
    do_migration((trans, done) => {
        let videos = ss.storage.videos.map((e, i) =>
            Object.assign({}, e, {
                // this is a guess. The exact date is not in the v2 model
                published_at: i
            }));
        storage.video.add_list(trans, videos, done);
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

exports.decide_migration_path = decide_migration_path;
exports.v1Tov3 = v1Tov3;
exports.v2Tov3 = v2Tov3;
