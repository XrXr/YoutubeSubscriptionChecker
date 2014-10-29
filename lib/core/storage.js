const { storage } = require("sdk/simple-storage");
const config = require("config");
const base64 = require("sdk/base64");

const max_history_size = 50;
const required_properties  = ["history", "subscriptions", "videos"];

function add_history (video) {
    if (storage.history === undefined) {
        storage.history = [];
    }
    if (storage.history.length >= max_history_size){
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
            if (video.video_id == to_remove.video_id){
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
    // convert the old data structure
    legacy_update: () => {
        if (!Array.isArray(storage.videos) && storage.videos == "object") {
            let new_storage = [];
            for (let key in storage.videos) {
                if (storage.videos.hasOwnProperty(key)) {
                    new_storage.push(...storage.videos[key]);
                }
            }
            storage.videos = new_storage;
        }
    },
    clear_history: () => storage.history = [],
    add: video => storage.videos.push(video),
    get_count: () => storage.videos.length,
    get_all: () => [storage.videos, storage.history]
};

const channel = {
    get_by_id: id => {
        for (let channel of storage.subscriptions){
            if (channel.id == id) {
                return channel;
            }
        }
    },
    get_by_name: name => {
        name = name.toLowerCase();
        for (let channel of storage.subscriptions){
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
        for (let element of storage.subscriptions){
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
    for (let channel_ of input.channels) {
        if (channel.get_by_id(channel_.id) === undefined) {
            channel_.latest_date = (new Date()).getTime();
            storage.subscriptions.push(channel_);
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

exports.video = video;
exports.export_all = export_all;
exports.import_all = import_all;
exports.channel = channel;
exports.ensure_valid = ensure_valid;