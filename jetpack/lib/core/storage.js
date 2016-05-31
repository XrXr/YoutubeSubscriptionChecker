exports.forward_idb_request = forward_idb_request;

const { indexedDB: idb } = require('sdk/indexed-db');
const config = require("../config");
const util = require("../util");

const max_history_size = 50;
const DB_NAME = "youtube-checker";
const STORE_NAMES = ["channel", "check_stamp", "config", "filter", "history", "video"];

function id (a) {
    return a;
}

// forward the result of an IDBRequest to a Node style callabck
function forward_idb_request(req, cb, transformer=id) {
    req.onsuccess = () => {
        let val = req.result;
        if (val) {
            val = transformer(req.result);
        }
        cb(null, val);
    };
    req.onerror = ev => cb(req.error, ev);
}

const video_store = trans => trans.objectStore("video");
const history_store = trans => trans.objectStore("history");
const channel_store = trans => trans.objectStore("channel");
const filter_store = trans => trans.objectStore("filter");
const check_stamp_store = trans => trans.objectStore("check_stamp");

exports.video_store = video_store;
exports.history_store = history_store;
exports.channel_store = channel_store;
exports.filter_store = filter_store;
exports.check_stamp_store = check_stamp_store;

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

const video = {
    // remove a video from the video storage, then put it into the history
    // storage
    put_into_history(trans, id, cb=util.noop) {
        let vs = video_store(trans);
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
        let req = video_store(trans).getAll();
        //TODO: videos that a channel have should be sorted
        forward_idb_request(req, cb, vids => {
            vids.sort((a, b) => {
                // by channel id then by published_at
                let ac = a.channel_id;
                let bc = b.channel_id;
                let ap = a.published_at;
                let bp = b.published_at;
                if (ac === bc) {
                    return compare(ap, bp);
                } else {
                    return compare(ac, bc);
                }
            }).reverse();
            return vids;
        });
    },
    add_one(trans, video, cb=util.noop) {
        let req = video_store(trans).add(new Video(video));
        forward_idb_request(req, cb);
    },
    add_list(trans, vids, cb=util.noop) {
        let store = trans.objectStore("video");
        util.cb_each(vids, (video, done) => {
            let req = store.add(new Video(video));
            forward_idb_request(req, done);
        }, cb);
    },
};

const video_property_names = ["channel_id", "video_id", "title", "duration",
                              "thumbnails", "published_at"];
function Video(obj) {
    for (let key of video_property_names) {
        this[key] = obj[key];
    }
}

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

function add_one_history(store, video, cb, entry_time=Date.now()) {
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
    update(trans, channel_id, timestamp, cb=util.noop) {
        let req = check_stamp_store(trans).put({
            channel_id,
            value: timestamp
        });
        forward_idb_request(req, cb);
    },
    get_for_channel(trans, channel_id, cb) {
        let req = check_stamp_store(trans).get(channel_id);
        forward_idb_request(req, cb, e => e.value);
    }
};

const channel = {
    get_by_id(trans, id, cb) {
        let req = channel_store(trans).index("id").openCursor(id);
        forward_idb_request(req, cb, e => e.value);
    },
    add_one(trans, channel, cb=util.noop) {
        // would call cb with error if channel is already there
        util.cb_join([cb => {  // add the channel
            let req = channel_store(trans).add(new Channel(channel.id, channel.title));
            forward_idb_request(req, cb);
        }, cb => {  // add check_stamp
            check_stamp.update(trans, channel.id, Date.now(), cb);
        }], cb);
    },
    remove_one(trans, to_remove, cb=util.noop) {
        let id = to_remove.id;
        util.cb_join([cb => {  // delete the channel
            let req = channel_store(trans).index("id").openCursor(id);
            req.onerror = () => cb(req.error);
            req.onsuccess = () => {
                let del_req = req.result.delete();
                forward_idb_request(del_req, cb);
            };
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
        // this ensure that the records are in order. The order of elements
        // in getAll doesn't seem well defined
        let req = channel_store(trans).openCursor();
        collect_cursor(req, cb);
    }
};

function Channel(id, title) {
    this.id = id;
    this.title = title;
}

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
function open(cb, db_name=DB_NAME) {
    let open_req = idb.open(db_name);
    forward_idb_request(open_req, cb);
}

function update_last_check(trans, cb=util.noop, now=Date.now()) {
    let store = trans.objectStore("config");
    store.put({
        name: "last_checked",
        value: now
    });
}

// Create object stores and setup indexes that the app is going to use if
// they don't already exist. Passes true to the cb if setup happened.
function initialize_db(cb, db_name=DB_NAME) {
    let open_req = idb.open(db_name);

    open_req.onerror = () => cb(open_req.error);

    let just_populated = false;
    open_req.onupgradeneeded = () => {
        let db = open_req.result;
        db.createObjectStore("config", { keyPath: "name" });
        db.createObjectStore("check_stamp", { keyPath: "channel_id" });

        let channel = db.createObjectStore("channel", { autoIncrement: true });
        channel.createIndex("id", "id", { unique: true });

        let video = db.createObjectStore("video", { keyPath: "video_id" });
        video.createIndex("published_at", "published_at");
        video.createIndex("channel_id", "channel_id");
        video.createIndex("duration", "duration");

        let history = db.createObjectStore("history", { keyPath: "video_id" });
        history.createIndex("entry_time", "entry_time");
        history.createIndex("duration", "duration");

        let filter = db.createObjectStore("filter", { autoIncrement: true });
        filter.createIndex("channel_id", "channel_id");
        filter.createIndex("pattern", "video_title_pattern");
        just_populated = true;
    };

    open_req.onsuccess = () => {
        let db = open_req.result;
        if (!just_populated) {
            // we opened the database but it doens't have all the expected stores
            if (idb.cmp(Array.from(db.objectStoreNames), STORE_NAMES) !== 0) {
                db.close();
                return cb(Error("Not all object store present and db is not new. DB corrupted?"));
            }
        }
        let trans = db.transaction("config", "readwrite");
        config.maybe_fill_defaults(trans);
        db.close();
        trans.oncomplete = () => cb(null, just_populated);
        trans.onerror = () => cb(Error("Failed to populate db with default configs"));
    };
}

function drop_db(cb=util.noop) {
    let req = idb.deleteDatabase(DB_NAME);
    forward_idb_request(req, cb);
}

exports.video = video;
exports.channel = channel;
exports.open = open;
exports.drop_db = drop_db;
exports.update_last_check = update_last_check;
exports.initialize_db = initialize_db;
exports.update_duration = update_duration;
exports.history = history;
exports.check_stamp = check_stamp;
exports.filter = filter;
exports.STORE_NAMES = STORE_NAMES;