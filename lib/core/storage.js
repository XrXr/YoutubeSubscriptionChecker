const { storage } = require("sdk/simple-storage");
const config = require("config");
const base64 = require("sdk/base64");
const api_util = require("api/util");
const filters = require("core/filters");

const max_history_size = 50;
const required_properties  = ["history", "subscriptions", "videos"];

function add_history (video) {
    if (storage.history === undefined) {
        storage.history = [];
    }
    if (storage.history.length >= max_history_size) {
        storage.history.pop();
    }
    storage.history.unshift(video);
}

const video = {
    add_history: add_history,
    get_by_id: (id) => {
        for (let video of storage.videos) {
            if (video.video_id === id) {
                return video;
            }
        }
    },
    update_duration: (video_id, new_duration) => {
        for (let video of storage.videos) {
            if (video.video_id === video_id) {
                video.duration = new_duration;
                return true;
            }
        }
        for (let video of storage.history) {
            if (video.video_id === video_id) {
                video.duration = new_duration;
                return true;
            }
        }
        return false;
    },
    // remove a video from the video storage, then put it into the history
    // storage
    put_into_history: to_remove => {
        // remove from video list
        let index = 0;
        let found = false;
        for (let video of storage.videos) {
            if (video.video_id == to_remove.video_id) {
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
    clear_history: () => storage.history = [],
    add: video => storage.videos.push(video),
    get_count: () => storage.videos.length,
    get_all: () => [storage.videos, storage.history]
};

const channel = {
    get_by_id: id => {
        for (let channel of storage.subscriptions) {
            if (channel.id == id) {
                return channel;
            }
        }
    },
    get_by_name: name => {
        name = name.toLowerCase();
        for (let channel of storage.subscriptions) {
            if (channel.title.toLowerCase().contains(name)) {
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
            if (element.id == new_channel.id) {
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
            if (channel.id == to_remove.id) {
                storage.subscriptions.splice(index, 1);
            }
            index++;
        }
        // remove all the videos that channel has
        for (var i = storage.videos.length - 1; i >= 0; i--) {
            if (storage.videos[i].channel_id == to_remove.id) {
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
        if (Array.isArray(storage.videos)) {  // a safeguard
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

exports.transition = transition;
exports.video = video;
exports.export_all = export_all;
exports.import_all = import_all;
exports.channel = channel;
exports.ensure_valid = ensure_valid;