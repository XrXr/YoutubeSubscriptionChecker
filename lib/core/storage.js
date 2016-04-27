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

function add_history (video) {
    if (storage.history === undefined) {
        storage.history = [];
    }
    if (storage.history.length >= max_history_size) {
        storage.history.pop();
    }
    storage.history.unshift(video);
}

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

const video = {
    add_history: add_history,
    get_by_id: (id) => {
        for (let video of storage.videos) {
            if (video.video_id === id) {
                return video;
            }
        }
    },
    // remove a video from the video storage, then put it into the history
    // storage
    put_into_history: to_remove => {
        // remove from video list
        let index = 0;
        let found = false;
        for (let video of storage.videos) {
            if (video.video_id === to_remove.video_id) {
                found = true;
                storage.videos.splice(index, 1);
                break;
            }
            index++;
        }
        // only add the video to history if it was found
        if (found) {
            add_history(to_remove);
        }
    },

    count(trans, cb) {
        let req = video_store(trans).count();
        forward_idb_request(req, cb);
    },
    get_all(trans, cb) {
        let req = video_store(trans).getAll();
        forward_idb_request(req, cb);
    },
    add_list(trans, vids) {
        let store = trans.objectStore("video");
        for (let video of vids) {
            store.add(video);
        }
    },
};

const history = {
    clear(trans, cb) {
        let req = history_store(trans).getAll();
        forward_idb_request(req, cb);
    },

    get_all(trans, cb) {
        let req = history_store(trans).getAll();
        forward_idb_request(req, cb);
    },
};

const channel = {
    get_by_id: id => {
        for (let channel of storage.subscriptions) {
            if (channel.id === id) {
                return channel;
            }
        }
    },
    get_by_name: name => {
        name = name.toLowerCase();
        for (let channel of storage.subscriptions) {
            if (channel.title.toLowerCase().includes(name)) {
                return channel;
            }
        }
    },
    add: channel => {
        // return wheter the channel was successfully added
        ensure_valid();
        let new_channel = JSON.parse(JSON.stringify(channel));
        new_channel.latest_date = (new Date()).getTime();
        for (let element of storage.subscriptions) {
            if (element.id === new_channel.id) {
                return false;
            }
        }
        storage.subscriptions.push(new_channel);
        return true;
    },
    remove: to_remove => {
        ensure_valid();
        // remove the channel
        let index = 0;
        for (let channel of storage.subscriptions) {
            if (channel.id === to_remove.id) {
                storage.subscriptions.splice(index, 1);
            }
            index++;
        }
        // remove all the videos that channel has
        for (var i = storage.videos.length - 1; i >= 0; i--) {
            if (storage.videos[i].channel_id === to_remove.id) {
                storage.videos.splice(i, 1);
            }
        }
    },
    get_all: () => storage.subscriptions
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
            req.onsuccess = done;
            req.onerror = () => done(req.error);
        }, cb);
    },
    remove_one(trans, video_id) {
        duration_fetch_store(trans).delete(video_id);
    }
};

// attempt to update the duration for a given video_id in both video and
// history store.
function update_duration(trans, video_id, new_duration) {
    update_in_store(video_store(trans));
    update_in_store(history_store(trans));

    function update_in_store(store) {
        let req = store.open_cusor(video_id);
        store.onsuccess = () => {
            let cursor = req.result;
            if (!cursor) {
                return;
            }
            cursor.value.duration = new_duration;
            cursor.update(cursor.value);
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
    const store_names = ["channel", "config", "duration_fetch", "filter",
                         "history", "video"];
    let open_req = idb.open(DB_NAME);

    let just_populated = false;
    open_req.onupgradeneeded = () => {
        let db = open_req.result;
        db.createObjectStore("video", { keyPath: "video_id" });
        db.createObjectStore("history", { keyPath: "video_id" });
        db.createObjectStore("channel", { keyPath: "channel_id" });
        db.createObjectStore("config", { keyPath: "name" });
        db.createObjectStore("duration_fetch", { keyPath: "video_id" });
        db.createObjectStore("check_stamp", { keyPath: "channel_id" });

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
