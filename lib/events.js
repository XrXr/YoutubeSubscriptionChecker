/*
This Source Code Form is subject to the terms of the
Mozilla Public License, v. 2.0.
If a copy of the MPL was not distributed with this file,
You can obtain one at http://mozilla.org/MPL/2.0/.
Author: XrXr

This module manage communication between hub instances and add-on code.
*/
const config = require("config");
const core = require("core/storage");
const filters = require("core/filters");
const request = require("api/request");
const util = require("util");
const button = require("ui/button");

let current_target = null;
let change_listener = null;

// due to the async nature of many operation such as channel search new video
// notification, target might be invalid when it is time to send the event.
function safe_emit (target, name, pay_load) {
    try {
        target.emit(name, pay_load);
    }catch(_){}
}

// registers a listener for when current_target changes. New listener will
// overwrite the previous one
function on_new_target (fn) {
    change_listener = fn;
}

function handle_basic_events (target) {
    // handle all the signals required by a hub instance
    core.ensure_valid();
    config.ensure_valid();

    target.emit("subscribed-channels", core.channel.get_all());
    target.emit("config", config.get_all(), filters.get_all());

    target.on("get-videos", () =>
        safe_emit(target, "videos", core.video.get_all())
    );
    target.on("search-channel", query => {
        request.search_channel(query).then(result =>
            safe_emit(target,"search-result", result)
        );
    });
    target.on("add-channel", new_channel => {
        if (core.channel.add(new_channel)) {
            safe_emit(target, "channel-added");
            return;
        }
        safe_emit(target, "channel-duplicate");
    });
    target.on("export", () => target.emit("export-result", core.export_all()));
    target.on("import", input => {
        if (!core.import_all(input)){
            safe_emit(target, "import-error");
        }
    });
    target.on("remove-channel", channel => {
        core.channel.remove(channel);
        button.update(core.video.get_count());
    });
    target.on("remove-video", (video, skip_opening) => {
        core.video.put_into_history(video);
        button.update(core.video.get_count());
        if (skip_opening) {
            return;
        }
        util.open_video(video);
    });
    target.on("open-video", util.open_video);
    target.on("update_config", new_config => {
        filters.update(new_config.filters);
        delete new_config.filters;
        config.update(new_config);
    });
    target.on("clear-history", () => core.video.clear_history());

    current_target = target;
    if (change_listener) {
        change_listener();
    }
}

function send_event (name, content) {
    safe_emit(current_target, name, content);
}

const notify = {
    all_videos: content => send_event("videos", core.video.get_all()),
    new_duration: content => send_event("duration-update", content),
    open_settings: () => send_event("open-settings")
};

exports.on_new_target = on_new_target;
exports.notify = notify;
exports.handle_basic_events = handle_basic_events;