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
const api = require("api");
const util = require("util");
const ui = require("ui");

const targets = [];  // keep track of all the instances

function handle_basic_events (target) {
    // handle all the signals required by a hub instance
    core.ensure_valid();
    config.ensure_valid();
    // TODO: the two events below should be per request for pannel
    target.emit("subscribed-channels", core.channel.get_all());
    target.emit("config", config.get_all(), filters.get_all());
    target.on("get-videos", () =>
        target.emit("videos", core.video.get_all())
    );
    target.on("search-channel", query => {
        api.search_channel(query).then(result => {
            try{
                target.emit("search-result", pay_load);
            } catch(_){}
        });
    });
    target.on("add-channel", () => {
        if (core.channel.add()){
            hub_worker.port.emit("channel-added");
            return;
        }
        hub_worker.port.emit("channel-duplicate");
    });
    target.on("remove-channel", channel => {
        core.channel.remove(channel);
        ui.button.update();
    });
    target.on("remove-video", (video, skip_opening) => {
        core.video.put_into_history(video);
        if (skip_opening){
            return;
        }
        util.open_video(video);
    });
    target.on("open-video", util.open_video);
    target.on("update_config", new_config => {
        filters.update(new_config);
        config.update(new_config);
    });

    targets.push(target);  // add it to the list
}

// brodcast an event to all targets
function brodcast_event (name, content) {
    targets.map(target => target.emit(name, content));
}

const brodcast = {
    all_videos: content => brodcast_event("videos", core.video.get_all()),
    new_duration: content => brodcast_event("duration-update", content)
};

function handle_extra_events (target) {
    // listen for special synchronization events
}

exports.brodcast = brodcast;
exports.handle_basic_events = handle_basic_events;