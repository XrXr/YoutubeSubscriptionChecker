/*
This Source Code Form is subject to the terms of the
Mozilla Public License, v. 2.0.
If a copy of the MPL was not distributed with this file,
You can obtain one at http://mozilla.org/MPL/2.0/.
Author: XrXr
*/
function send_dom_event (name, data) {
    // passing pay_load as reference directly would result in cross-origin problems
    // passing the stringified version circumvents it.
    document.documentElement.dispatchEvent(new CustomEvent(name, {
        detail: typeof(data) === "string" ? data : JSON.stringify(data)
    }));
}

let the_page_script = {
    sends: event_names => {
        event_names.map(name => {
            document.documentElement.addEventListener(name,
                event => self.port.emit(name, event.detail), false);
        });
        return the_page_script;
    },
    recieves: event_names => {
        event_names.map(name => {
            self.port.on(name, data => send_dom_event(name, data));
        });
        return the_page_script;
    }
};

the_page_script.sends(
    ["search-channel", "add-channel", "remove-channel", "clear-history",
     "remove-video", "skip-video", "export", "import", "open-video",
     "update-config", "open-settings"
    ]).recieves(
    ["open-settings", "videos", "config", "search-result",
     "subscribed-channels", "channel-added", "channel-duplicate",
     "duration-update", "import-error", "export-result", "import-success"
    ]);

self.port.emit("get-videos", null);  // get all videos once contentscript loads