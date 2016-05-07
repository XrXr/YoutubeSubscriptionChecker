const { storage } = require("sdk/simple-storage");

const { indexedDB: idb } = require('sdk/indexed-db');
const config = require("../config");
const util = require("../util");

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
        let call_time = Date.now();
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
                history.add_one(trans, cursor.value, done, call_time);
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

function add_one_history(store, video, cb, entry_time = Date.now()) {
    video.entry_time = entry_time;
    let add_req = store.put(video);
    forward_idb_request(add_req, err => {
        if (err) {
            return cb(err);
        }
        maintain_maximum(store, cb);
    });
}

const history = {
    add_one(trans, video, cb, entry_time) {
        let store = history_store(trans);
        add_one_history(store, video, cb, entry_time);
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
        let req = history_store(trans).index("entry_time").openCursor(null, "prev");
        collect_cursor(req, cb);
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
    },
    get_all(trans, cb) {
        let req = filter_store(trans).getAll();
        forward_idb_request(req, (err, filter_list) =>  {
            if (err) {
                return cb(err);
            }
            util.cb_each(filter_list, (filter, done) => {
                channel.get_by_id(trans, filter.channel_id, (err, channel) => {
                    if (err) {
                        return done(err);
                    }
                    filter.channel_title = channel.title;
                    done(null);
                });
            }, () => cb(null, filter_list));
        });
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
        db.createObjectStore("channel", { keyPath: "id" });
        db.createObjectStore("config", { keyPath: "name" });
        db.createObjectStore("duration_fetch", { keyPath: "video_id" });
        db.createObjectStore("check_stamp", { keyPath: "channel_id" });

        let video = db.createObjectStore("video", { keyPath: "video_id" });
        video.createIndex("published_at", "published_at");
        video.createIndex("channel_id", "channel_id");

        let history = db.createObjectStore("history", { keyPath: "video_id" });
        history.createIndex("entry_time", "entry_time");

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

exports.video = video;
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
exports.filter_store = filter_store;
