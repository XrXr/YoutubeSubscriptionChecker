/*
This Source Code Form is subject to the terms of the
Mozilla Public License, v. 2.0.
If a copy of the MPL was not distributed with this file,
You can obtain one at http://mozilla.org/MPL/2.0/.
Author: XrXr

This module manages communication between hub instances and add-on code.
*/
import * as config from "./config";
import * as storage from "./persistent/storage";
import * as backup from "./persistent/backup";
import * as filters from "./persistent/filters";
import * as request from"./youtube/request";
import * as util from "./util";
import * as button from "./browser/button";
import { get_db, get_fatal_error, fatal_error_recovered, init as main_init } from "./main";
import {
    assert,
    log_error,
    dump as dump_logs,
    clear as clear_logs,
} from "./logger";

const noop = util.noop;
let current_port = null;
let change_listeners = [];

// due to the async nature of many operation such as channel search new video
// notification, target might be invalid when it is time to send the event.
function safe_emit (target, name, payload) {
    try {
        target.postMessage({
            name,
            payload
        });
    } catch(_) {}
}

// registers a listener to be ran once for when current_port changes
function once_new_receiver (fn) {
    change_listeners.push(fn);
}

function on_connection (port) {
    let callbacks = new Map();
    const emit = safe_emit.bind(null, port);
    const listen = (name, cb) => {
        callbacks.set(name, cb);
    };

    if (get_fatal_error() === "open-db-error") {
        emit("fail-state", "open-db-error");
        port.onMessage.addListener(message => {
            if (message && message.name == "drop-db") {
                assert(!get_db());
                storage.drop_db(err => {
                    if (err) {
                        log_error("Could not drop db", err);
                        return emit("drop-db-error");
                    }
                    storage.initialize_db(err => {
                        if (err) {
                            return emit("drop-db-error");
                        }
                        main_init(err => {
                            if (err) {
                                return emit("drop-db-error");
                            }
                            fatal_error_recovered();
                            emit("drop-db-success");
                        });
                    });
                });
            }
        });
        return;
    }

    listen("get-videos", send_videos);
    listen("search-channel", query => {
        request.search_channel(query).then(result =>
            emit("search-result", result)
        );
    });
    listen("add-channel", new_channel => {
        let trans = get_db().transaction(["channel", "check_stamp"], "readwrite");
        storage.channel.add_one(trans, new_channel, err => {
            if (err) {
                if (err.name === "ConstrainError") {
                    emit("channel-duplicate");
                }
                //TODO: show something?
            }
            // send configs since the newly added channel might have unorphaned
            // some filters
            send_configs(() => emit("channel-added"));
        });
    });
    listen("export", () => {
        let trans = get_db().transaction(["channel", "video", "filter", "config"], "readonly");
        backup.export_all(trans, (err, export_result) => {
            if (err) {
                // TODO: show something
                return;
            }
            emit("export-result", export_result);
        });
    });
    listen("import", input => {
        let trans = get_db().transaction(backup.import_all.store_dependencies, "readwrite");
        backup.import_all(trans, input, err => {
            if (err) {
                return emit("import-error");
            }
            update_button_count("after import");
            send_channels();
            send_videos();
            send_configs(() => emit("import-success"));
        });
    });
    listen("remove-channel", channel => {
        let trans = get_db().transaction(["channel", "video", "check_stamp"], "readwrite");
        storage.channel.remove_one(trans, channel, err => {
            if (err) {
                log_error("could not remove a channel", err);
                return;
            }
            update_button_count("after removing a channel");
        });
    });

    function update_button_count(when) {
        let count = get_db().transaction("video", "readonly");
        storage.video.count(count, (err, count) => {
            if (err) {
                log_error(`Could not get video count ${when}`, err);
                return;
            }
            button.update(count);
        });
    }

    function remove_video (id, open_video) {
        let trans = get_db().transaction(["video", "history"], "readwrite");
        storage.video.put_into_history(trans, id, err => {
            if (err) {
                log_error("after user clicking");
                return;
            }
            update_button_count("after transfering a video to history");
            if (open_video) {
                let open_request = get_db().transaction("config", "readonly");
                util.open_video(open_request, id);
            }
        });
    }

    listen("remove-video", id => remove_video(id, true));
    listen("skip-video", id => remove_video(id, false));
    listen("open-video", id => {
        let trans = get_db().transaction("config");
        util.open_video(trans, id);
    });
    listen("update-config", new_config => {
        let trans = get_db().transaction(["config", "filter"], "readwrite");
        filters.update(trans, new_config.filters);
        delete new_config.filters;
        config.update(trans, new_config, noop);
    });
    listen("clear-history", () => {
        let trans = get_db().transaction("history", "readwrite");
        storage.history.clear(trans, noop);
    });
    listen("get-error-logs", () => {
        dump_logs((err, logs) => {
            if (err) {
                emit("dump-logs-failed");
            } else {
                emit("error-logs", logs);
            }
        });
    });
    listen("clear-logs", () => {
        clear_logs();
    });

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

    function send_configs(cb=noop) {
        let get_configs = get_db().transaction(["config", "filter", "channel"], "readonly");
        util.cb_join([done => config.get_all(get_configs, done),
                      done => storage.filter.get_all(get_configs, done)],
            (err, config, filters) => {
                if (err) {
                    log_error("couldn't get configs to send to hub");
                    return;
                }
                // a filter without a channel title is an orphan
                filters = filters.filter(e => e.channel_title);
                // TODO: bad news if the config modal is open when this is received
                emit("config", { config, filters });
                cb();
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

    port.onMessage.addListener(message => {
        if (message && typeof message.name == "string" &&
                callbacks.has(message.name)) {
            handle_message(callbacks.get(message.name), message.payload);
        } else {
            log_error("Malformed message", message);
        }
    });

    current_port = port;
    for (let fn of change_listeners) {
        fn();
    }
    change_listeners = [];

    send_channels();
    send_configs();
}

function handle_message(handler, payload) {
    try {
        handler(payload);
    } catch (e) {
        log_error("Exception while handling message from hub page", e);
    }
}

function send_event (name, content) {
    safe_emit(current_port, name, content);
}

const notify = {
    new_duration: content => send_event("duration-update", content),
    open_settings: () => send_event("open-settings"),
    open_changelog: () => send_event("open-changelog"),
    all_videos: (videos, history) => send_event("videos", [videos, history]),
    migration_failed_notice: () => send_event("migration-failed"),
    migration_finished: () => send_event("migration-finished"),
};

browser.runtime.onConnect.addListener(on_connection);

export {
    once_new_receiver,
    notify,
};
