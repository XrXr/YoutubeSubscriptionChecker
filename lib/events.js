/*
This Source Code Form is subject to the terms of the
Mozilla Public License, v. 2.0.
If a copy of the MPL was not distributed with this file,
You can obtain one at http://mozilla.org/MPL/2.0/.
Author: XrXr

This module manage communication between hub instances and add-on code.
*/
const config = require("./config");
const storage = require("./core/storage");
const backup = require("./core/backup");
const filters = require("./core/filters");
const request = require("./api/request");
const util = require("./util");
const noop = util.noop;
const button = require("./ui/button");
const { get_db } = require("./main");
const { log_error } = require("./logger");

let current_target = null;
let change_listeners = [];

// due to the async nature of many operation such as channel search new video
// notification, target might be invalid when it is time to send the event.
function safe_emit (target, name, pay_load) {
    try {
        target.emit(name, pay_load);
    } catch(_) {}
}

// registers a listener to be ran once for when current_target changes
function once_new_target (fn) {
    change_listeners.push(fn);
}

// handle all the event required by a hub instance
function handle_basic_events (target) {
    const emit = safe_emit.bind(null, target);

    send_channels();
    send_configs();

    target.on("get-videos", send_videos);
    target.on("search-channel", query => {
        request.search_channel(query).then(result =>
            emit("search-result", result)
        );
    });
    target.on("add-channel", new_channel => {
        let trans = get_db().transaction(["channel", "check_stamp"], "readwrite");
        storage.channel.add_one(trans, new_channel, err => {
            if (err) {
                if (err.name === "ConstrainError") {
                    emit("channel-duplicate");
                }
                //TODO: show something?
            }
            return emit("channel-added");
        });
    });
    target.on("export", () => {
        let trans = get_db().transaction(["channel", "video", "filter", "config"], "readonly");
        backup.export_all(trans, (err, export_result) => {
            if (err) {
                // TODO: show something
                return;
            }
            emit("export-result", export_result);
        });
    });
    target.on("import", input => {
        let trans = get_db().transaction(["channel", "video", "check_stamp", "filter", "config"], "readwrite");
        backup.import_all(trans, input, err => {
            if (err) {
                return emit("import-error");
            }
            send_channels();
            send_videos();
            send_configs();
            emit("import-success");
        });
    });
    target.on("remove-channel", channel => {
        let trans = get_db().transaction(["channel", "video", "check_stamp"], "readwrite");
        storage.channel.remove_one(trans, channel, err => {
            if (err) {
                log_error("could not remove a channel", err);
                return;
            }
            let count = get_db().transaction("video", "readonly");
            storage.video.count(count, (err, count) => {
                if (err) {
                    log_error("could not get video count removing a channel", err);
                    return;
                }
                button.update(count);
            });
        });
    });

    function remove_video (video, open_video) {
        let trans = get_db().transaction(["video", "history"], "readwrite");
        storage.video.put_into_history(trans, video, err => {
            if (err) {
                log_error("could not transfer video after user clicking");
                return;
            }
            storage.video.count(trans, (err, count) => {
                if (err) {
                    log_error("could not get video count after transfering a video", err);
                    return;
                }
                button.update(count);
            });
            if (open_video) {
                let open_request = get_db().transaction("config", "readonly");
                util.open_video(open_request, video);
            }
        });
    }

    target.on("remove-video", video => remove_video(video, true));
    target.on("skip-video", video => remove_video(video, false));
    target.on("open-video", util.open_video);
    target.on("update-config", new_config => {
        let trans = get_db().transaction(["config", "filter"], "readwrite");
        filters.update(trans, new_config.filters);
        delete new_config.filters;
        config.update(trans, new_config, noop);
    });
    target.on("clear-history", () => {
        let trans = get_db().transaction("history", "readwrite");
        storage.history.clear(trans, noop);
    });

    current_target = target;
    for (let fn of change_listeners) {
        fn();
    }
    change_listeners = [];


    function send_channels() {
        let get_channels = get_db().transaction("channel", "readonly");
        storage.channel.get_all(get_channels, (err, channel_list) => {
            if (err) {
                log_error("couldn't get channel list to send to hub");
                return;
            }
            emit("subscribed-channels", channel_list);
        });
    }

    function send_configs() {
        let get_configs = get_db().transaction(["config", "filter", "channel"], "readonly");
        util.cb_join([done => config.get_all(get_configs, done),
                      done => storage.filter.get_all(get_configs, done)],
            (err, config, filters) => {
                if (err) {
                    log_error("couldn't get configs to send to hub");
                    return;
                }
                emit("config", { config, filters });
            });
    }

    function send_videos() {
        let trans = get_db().transaction(["video", "history"], "readonly");
        util.cb_join([done => storage.video.get_all(trans, done),
                      done => storage.history.get_all(trans, done)],
            (err, video, history) => {
                if (err) {
                    log_error("couldn't get videos to send to hub");
                    return;
                }
                emit("videos", [video, history]);
            });
    }
}

function send_event (name, content) {
    safe_emit(current_target, name, content);
}

const notify = {
    new_duration: content => send_event("duration-update", content),
    open_settings: () => send_event("open-settings"),
    open_changelog: () => send_event("open-changelog"),
    all_videos: (videos, history) => send_event("videos", [videos, history]),
};

exports.once_new_target = once_new_target;
exports.notify = notify;
exports.handle_basic_events = handle_basic_events;
