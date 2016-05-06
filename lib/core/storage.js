const { storage } = require("sdk/simple-storage");
const base64 = require("sdk/base64");
const { indexedDB: idb } = require('sdk/indexed-db');

const config = require("../config");
const api_util = require("../api/util");
const util = require("../util");
const filters = require("../core/filters");

const max_history_size = 50;
const required_properties  = ["history", "subscriptions", "videos"];
const DB_NAME = "youtube-checker";

function id (a) {
    return a;
}

// forward the result of an IDBRequest to a Node style callabck
function forward_idb_request(req, cb, transformer = id) {
    req.onsuccess = () => cb(null, transformer(req.result));
    req.onerror = () => cb(req.error);
}

const video_store = trans => trans.objectStore("video");
const history_store = trans => trans.objectStore("history");
const channel_store = trans => trans.objectStore("channel");
const duration_fetch_store = trans => trans.objectStore("duration_fetch");
const filter_store = trans => trans.objectStore("filter");
const check_stamp_store = trans => trans.objectStore("check_stamp");

const video = {
    get_by_id: (id) => {
        for (let video of storage.videos) {
            if (video.video_id === id) {
                return video;
            }
        }
    },
    // remove a video from the video storage, then put it into the history
    // storage
    put_into_history(trans, to_remove, cb) {
        let vs = video_store(trans);
        let id = to_remove.video_id;
        let cursor_req = vs.openCursor(id);
        cursor_req.onerror = () => cb(cursor_req.error);
        cursor_req.onsuccess = () => {
            let cursor = cursor_req.result;
            if (!cursor) {
                cb(Error("trying to transfer a video not in video store to history"));
                return;
            }
            util.cb_join([done => {
                let req = vs.delete(id);
                forward_idb_request(req, done);
            }, done => {
                history.add_one(trans, cursor.value, done);
            }], cb);
        };
    },

    count(trans, cb) {
        let req = video_store(trans).count();
        forward_idb_request(req, cb);
    },
    get_all(trans, cb) {
        let req = video_store(trans).index("published_at").openCursor(null, "prev");
        collect_cursor(req, cb);
    },
    add_list(trans, vids) {
        let store = trans.objectStore("video");
        for (let video of vids) {
            store.add(video);
        }
    },
};

function maintain_maximum(store, cb) {
    let count = store.count();
    forward_idb_request(count, (err, history_count) => {
        if (err) {
            return cb(err);
        }

        if (history_count < max_history_size) {
            return cb(null);
        }

        store.openCursor().onsuccess = ev => {
            let cursor = ev.target.result;
            if (!cursor) {
                return cb(null);
            }
            let req = cursor.delete();
            forward_idb_request(req, err => {
                if (err) {
                    return cb(err);
                }
                maintain_maximum(store, cb);
            });
        };
    });
}

function add_one_history(store, video, cb) {
    let add_req = store.put(video);
    forward_idb_request(add_req, err => {
        if (err) {
            return cb(err);
        }
        maintain_maximum(store, cb);
    });
}

const history = {
    add_one(trans, video, cb) {
        let store = history_store(trans);
        add_one_history(store, video, cb);
    },
    add_list(trans, video_list) {
        let store = history_store(trans);
        for (let video of video_list) {
            add_one_history(store, video, util.noop);
        }
    },
    clear(trans, cb) {
        let req = history_store(trans).clear();
        forward_idb_request(req, cb);
    },

    get_all(trans, cb) {
        let req = history_store(trans).getAll();
        forward_idb_request(req, cb, e => e.reverse());
    },
};

const check_stamp = {
    update(trans, channel_id, timestamp) {
        return check_stamp_store(trans).put({
            channel_id,
            value: timestamp
        });
    },
    get_for_channel(trans, channel_id, cb) {
        let req = check_stamp_store(trans).get(channel_id);
        forward_idb_request(req, cb, e => e.value);
    }
};

const channel = {
    get_by_id(trans, id, cb) {
        let req = channel_store(trans).get(id);
        forward_idb_request(req, cb);
    },
    get_by_name(name) {
        name = name.toLowerCase();
        for (let channel of storage.subscriptions) {
            if (channel.title.toLowerCase().includes(name)) {
                return channel;
            }
        }
    },
    add_one(trans, channel, cb) {
        // call cb with error if channel is already there
        if (typeof channel.id !== "string") {
            throw Error("attempted to add invalid channel object");
        }

        util.cb_join([cb => {  // add the channel
            let req = channel_store(trans).add(channel);
            forward_idb_request(req, cb);
        }, cb => {  // add check_stamp
            let req = check_stamp.update(trans, channel.id, Date.now());
            forward_idb_request(req, cb);
        }], cb);
    },
    remove_one(trans, to_remove, cb) {
        let id = to_remove.id;
        util.cb_join([cb => {  // delete the channel
            let req = channel_store(trans).delete(id);
            forward_idb_request(req, cb);
        }, cb => {  // delete all videos the channel has
            let vs = video_store(trans);
            let index = vs.index("channel_id");
            index.openCursor().onsuccess = ev => {
                let cursor = ev.target.result;
                if (cursor) {
                    let del_req = cursor.delete();
                    del_req.onsuccess = () => cursor.continue();
                    del_req.onerror = () => cb(del_req.error);
                } else {
                    cb();
                }
            };
        }, cb => {  // delete the check_stamp of the channel
            let req = check_stamp_store(trans).delete(id);
            forward_idb_request(req, cb);
        }], cb);
    },
    get_all(trans, cb) {
        let req = channel_store(trans).getAll();
        forward_idb_request(req, cb);
    }
};

function ensure_valid () {
    required_properties.map(key => {
        if (!Array.isArray(storage[key])) {
            // if there are different default values in the future a different
            // approach will have to be used
            storage[key] = [];
        }
    });
}

function export_all () {
    let channels = [];
    for (let channel of storage.subscriptions) {
        channels.push({
            id: channel.id,
            title: channel.title,
            filters: channel.filters || []
        });
    }
    return base64.encode(JSON.stringify({
        channels: channels,
        videos: video.get_all()[0],
        config: config.get_all()
    }), "utf-8");
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

/*
  This object is responsible for transitioning the old model to the new one
*/
const transition = {
    // change the old video storage model used in 1.0 to the new one
    // this function assumes the old model is in use.
    update_storage_model: () => {
        if (storage.backup) {  // we are downgrading from version 2.0 or above
            storage.videos = storage.backup;
            storage.backup = undefined;
            return;
        }
        if (Array.isArray(storage.videos)) {
            return;
        }
        let videos = [];
        for (let key in storage.videos) {
            videos = videos.concat(storage.videos[key]);
        }
        let durations = [];
        // copy video duration since api_util.activity.normalize wipes the
        // property to empty string
        for (let video of videos) {
            let video_duration = video.duration;
            if (video_duration === undefined) {
                video_duration = "";
            }
            durations.push(video_duration);
        }
        videos.map(api_util.activity.normalize);
        for (let i = 0; i < durations.length; i++) {
            videos[i].duration = durations[i];
        }
        storage.videos = videos;
    },
    // go back to the old model used by 1.0. This wipes currently unwatched
    // videos and clear the "video_count" property of every channel object.
    // The unwatched object would be stored in a property called "backup", so
    // versions > 1.0 can use that to downgrade more easily.
    revert_storage_model: () => {
        storage.backup = storage.videos;
        storage.videos = {};
        for (let channel of storage.subscriptions) {
            channel.video_count = 0;
        }
    },
    // returns whether the legacy (1.0) model is in use
    legacy_in_use: () => {
        return !Array.isArray(storage.videos);
    }
};

const duration_fetch = {
    add_list(trans, video_ids, cb) {
        let store = duration_fetch_store(trans);
        util.cb_each(video_ids, (video_id, done) => {
            let req = store.add({video_id});
            forward_idb_request(req, done);
        }, cb);
    },
    remove_one(trans, video_id) {
        duration_fetch_store(trans).delete(video_id);
    }
};

const filter = {
    get_for_channel(trans, id, cb) {
        let req = filter_store(trans).index("channel_id").openCursor(id);
        collect_cursor(req, cb);
    }
};


function collect_cursor(cursor_req, cb) {
    let l = [];
    cursor_req.onsuccess = ev => {
        let cursor = ev.target.result;
        if (cursor) {
            l.push(cursor.value);
            cursor.continue();
        } else {
            cb(null, l);
        }
    };

    cursor_req.onerror = () => cb(cursor_req.error);
}

// attempt to update the duration for a given video_id in both video and
// history store.
function update_duration(trans, video_id, new_duration) {
    update_in_store(video_store(trans));
    update_in_store(history_store(trans));

    function update_in_store(store) {
        let req = store.openCursor(video_id);
        req.onsuccess = () => {
            let cursor = req.result;
            if (!cursor) {
                return;
            }
            cursor.value.duration = new_duration;
            cursor.update(cursor.value);
            cursor.continue();
        };
    }
}

// this assumes that the db already exist.
function open(cb) {
    let open_req = idb.open(DB_NAME);
    open_req.onsuccess = () => {
        cb(null, open_req.result);
    };
    open_req.onerror = err => {
        cb(err);
    };
}

// update the last check timestamp to current time
function update_last_check(trans) {
    let now = (new Date()).getTime();
    let store = trans.objectStore("config");
    store.put({
        name: "last_checked",
        value: now
    });
}

// Create object stores and settup indexes that the app is going to use.
// Should only be called once during initial settup
function initialize_db(cb) {
    const store_names = ["channel", "check_stamp", "config", "duration_fetch",
                         "filter", "history", "video"];
    let open_req = idb.open(DB_NAME);

    let just_populated = false;
    open_req.onupgradeneeded = () => {
        let db = open_req.result;
        db.createObjectStore("history", { keyPath: "video_id" });
        db.createObjectStore("channel", { keyPath: "id" });
        db.createObjectStore("config", { keyPath: "name" });
        db.createObjectStore("duration_fetch", { keyPath: "video_id" });
        db.createObjectStore("check_stamp", { keyPath: "channel_id" });

        let video = db.createObjectStore("video", { keyPath: "video_id" });
        video.createIndex("published_at", "published_at");
        video.createIndex("channel_id", "channel_id");

        let filter = db.createObjectStore("filter", { autoIncrement: true });
        filter.createIndex("channel_id", "channel_id");
        just_populated = true;
    };

    open_req.onsuccess = () => {
        let db = open_req.result;
        if (!just_populated) {
            // we opened the database but it doens't have all the expected stores
            if (idb.cmp(db.objectStoreNames, store_names) !== 0) {
                console.error("Not all object store present. DB corrupted?");
                db.close();
                return cb(Error("Stores missing"));
            }
        }
        let trans = db.transaction("config", "readwrite");
        config.maybe_fill_defaults(trans);
        db.close();
        trans.oncomplete = () => cb(null);
        trans.onerror = () => cb(Error("Failed to populate db with default configs"));
    };
}

exports.transition = transition;
exports.video = video;
exports.export_all = export_all;
exports.import_all = import_all;
exports.channel = channel;
exports.ensure_valid = ensure_valid;
exports.open = open;
exports.update_last_check = update_last_check;
exports.initialize_db = initialize_db;
exports.update_duration = update_duration;
exports.history = history;
exports.duration_fetch = duration_fetch;
exports.forward_idb_request = forward_idb_request;
exports.check_stamp = check_stamp;
exports.filter = filter;
