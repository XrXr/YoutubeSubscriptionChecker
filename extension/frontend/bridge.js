/*
This Source Code Form is subject to the terms of the
Mozilla Public License, v. 2.0.
If a copy of the MPL was not distributed with this file,
You can obtain one at http://mozilla.org/MPL/2.0/.
Author: XrXr
*/
(function () {
    function send_dom_event (name, data) {
        // passing pay_load as reference directly would result in cross-origin problems
        // passing the stringified version circumvents it.
        document.documentElement.dispatchEvent(new CustomEvent(name, {
            detail: typeof(data) === "string" ? data : JSON.stringify(data)
        }));
    }
    // from the perspective of the hub page.
    const inbound_events = new Set(["open-settings", "videos", "config",
        "search-result", "open-changelog", "subscribed-channels",
        "channel-added", "channel-duplicate", "duration-update",
        "import-error", "export-result", "import-success", "error-logs",
        "dump-logs-failed", "fail-state", "drop-db-success", "drop-db-error",
        "migration-failed", "migration-finished",
    ]);

    const outbound_events = new Set(["search-channel", "add-channel",
        "remove-channel", "clear-history", "remove-video", "skip-video",
        "clear-unwatched", "export", "import", "open-video", "drop-db",
        "update-config", "open-settings", "get-error-logs", "clear-logs",
    ]);

    const port = chrome.runtime.connect();
    for (let name of outbound_events) {
        document.documentElement.addEventListener(name,
            event => port.postMessage({name, payload: event.detail}));
    };

    port.onMessage.addListener(message => {
        if (message && typeof message.name == "string" &&
                inbound_events.has(message.name)) {
            send_dom_event(message.name, message.payload);
        } else {
            console.error("Malformed inbound message format:", message);
        }
    });

    port.postMessage({name: "get-videos"}); // also the "say hello" event
})();
