/*
This Source Code Form is subject to the terms of the
Mozilla Public License, v. 2.0.
If a copy of the MPL was not distributed with this file,
You can obtain one at http://mozilla.org/MPL/2.0/.
Author: XrXr
*/
import b64decode from "../base64";
import * as util from "../util";
import * as storage from "./storage";
import * as filters from "./filters";
import * as config from "../config";

const { forward_idb_request } = storage;

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
            }, done);
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

import_all.store_dependencies = ["channel", "video", "check_stamp", "filter", "config"];
function import_all (trans, encoded, cb) {
    let malform = () => Error("Malform backup");
    if (typeof encoded !== "string") {
        return cb(malform());
    }
    let backup;
    try {
        backup = JSON.parse(encoded);
    } catch (e) {
        try {
            backup = JSON.parse(b64decode(encoded));
        } catch (e) {
            return cb(malform());
        }
    }
    if (!["channels", "videos", "config"].every(key => backup.hasOwnProperty(key))) {
        return cb(malform());
    }
    try {
        for (let channel of backup.channels) {
            if (!channel.filters.every(filters.is_full_filter)) {
                return cb(malform());
            }
        }
    } catch (e) {
        return cb(malform());
    }

    util.cb_join([channels_done => {
        util.cb_each(backup.channels, (channel, done) => {
            storage.channel.get_by_id(trans, channel.id, (err, found_channel) => {
                if (err) {
                    return done(err);
                }
                util.cb_join([add_channel_done => {
                    if (found_channel) {
                        return add_channel_done();
                    }
                    storage.channel.add_one(trans, channel, add_channel_done);
                }, add_filters_done => {
                    insert_filters(channel, add_filters_done);
                }], done);
            });
        }, channels_done);
    }, videos_done => {
        let count = 0;
        util.cb_each(backup.videos, (video, done) => {
            if (!video.published_at) {  // old backups do not have this
                video.published_at = String(count++);
            }
            storage.video.add_one(trans, video, (err, ev) => {
                if (err) {
                    // already have it
                    if (err.name === "ConstraintError") {
                        ev.preventDefault();
                        ev.stopPropagation();
                        return done();
                    }
                    return done(err);
                }
                done();
            });
        }, videos_done);
    }, configs_done => {
        config.update(trans, backup.config, configs_done);
    }], cb);

    function insert_filters(channel, cb) {
        util.cb_each(channel.filters, (filter, filter_insert_done) => {
            let store = storage.filter_store(trans);
            let cursor_req = store.index("channel,pattern")
                                  .openCursor([filter.channel_id,
                                               filter.video_title_pattern]);
            cursor_req.onerror = filter_insert_done;
            cursor_req.onsuccess = () => {
                let cursor = cursor_req.result;

                let req = cursor ? cursor.update(filter) : store.add(filter);
                forward_idb_request(req, filter_insert_done);
            };
        }, cb);
    }
}

export {
    export_all,
    import_all,
};
