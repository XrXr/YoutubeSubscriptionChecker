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

function handle_basic_events (target) {
    // handle all the signals required by a hub instance
    core.ensure_valid();
    config.ensure_valid();

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
}

function handle_extra_events (target) {
    // listen for special synchronization events
}

const synchronize = {};