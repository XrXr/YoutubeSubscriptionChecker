/*
This Source Code Form is subject to the terms of the
Mozilla Public License, v. 2.0.
If a copy of the MPL was not distributed with this file,
You can obtain one at http://mozilla.org/MPL/2.0/.
Author: XrXr

This the jetpack extension that spawns the WebExtension.
It runs the migrations and then sends all the data over to the web extension.
*/
const web_extension = require("sdk/webextension");
const migration = require("./core/migration");
const storage = require("./core/storage");
const backup = require("./core/backup");

function boot_webextension() {
    storage.open((err, opened_db) => {
        let to_send;
        if (err) {
            return boot_then_send();
        }

        let trans = opened_db.transaction(["channel", "video", "filter", "config"], "readonly");
        backup.export_all(trans, (err, export_result) => {
            if (err) {
                boot_then_send();
            } else {
                boot_then_send(export_result);
            }
        });
    });
}

function boot_then_send(pay_load) {
    web_extension.startup().then(api => {
        api.browser.runtime.onMessage.addListener((message_name, sender, send_reply) => {
            if (message_name !== "jetpack-data-please") {
                console.error("Unexpected message from web extension");
                return;
            }
            send_reply(pay_load);
        });
    }, err => console.error("Failed to boot web extension", err));
}

migration.decide_migration_path((err, migration_proc) => {
    if (err || !migration_proc) {
        boot_webextension();
    } else {
        migration_proc(boot_webextension);
    }
});
