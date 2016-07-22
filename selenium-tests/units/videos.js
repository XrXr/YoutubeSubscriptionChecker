/*
This Source Code Form is subject to the terms of the
Mozilla Public License, v. 2.0.
If a copy of the MPL was not distributed with this file,
You can obtain one at http://mozilla.org/MPL/2.0/.
Author: XrXr
*/
const { Key } = require("selenium-webdriver/lib/input");
const util = require("../util");
const { import_backup, json_fixture } = require("./backup-import");

exports.run = run;
exports.need_debug = true;
exports.after_migration = true;

function run(driver, debug) {
    driver.get(util.hub_url);

    if (!debug) {
        util.wait_for_element(driver, "modal");
        import_backup(driver, json_fixture);
    } else {
        driver.sleep(1000);
    }

    util.wait_for_element(driver, "video-link").click();
    // driver.getAllWindowHandles() doesn't return multiple for tabs...
    driver.wait(() => driver.actions()
            .sendKeys(Key.CONTROL, Key.PAGE_DOWN, Key.CONTROL)
            .perform()
            .then(() => {
                return driver.getCurrentUrl()
                    .then(url => url.includes("youtube.com"));
            }), 3000);

    driver.get(util.hub_url);
    // recorded into history
    util.wait_for_element(driver, "history-btn").click();
    util.wait_for_element(driver, "video-link");

    if (!debug) {
        return;
    }

    driver.get(util.hub_url);
    driver.sleep(1000);
    util.wait_for_element(driver, function look_for_nl() {
        // jshint undef: false
        let bars = Array.from(document.getElementsByClassName("channel-title"));
        return bars.filter(e => e.textContent === "Northernlion");
        // jshint undef: true
    }, 2000).click();
    util.wait_for_element(driver, "video-link", 10 * 1000);
}
