/*
This Source Code Form is subject to the terms of the
Mozilla Public License, v. 2.0.
If a copy of the MPL was not distributed with this file,
You can obtain one at http://mozilla.org/MPL/2.0/.
Author: XrXr
*/
const fs = require("fs");
const path = require("path");
const util = require("../util"),
      open_settings = util.open_settings,
      close_modals = util.close_modals,
      close_settings = util.close_settings;
const webdriver = require('selenium-webdriver'),
      By = webdriver.By;

const json_fixture = fs.readFileSync(path.join(__dirname, "backup-fixture.json"), 'utf8');

exports.json_fixture = json_fixture;
exports.import_backup = import_backup;
exports.run = run;

function run(driver, debug) {
    const b64 = fs.readFileSync(path.join(__dirname, "backup-fixture.b64"), 'utf8');

    driver.get(util.hub_url);
    if (!debug) {
        util.wait_for_element(driver, "modal");
    }

    import_backup(driver, b64);

    // there should be at least one video now
    util.wait_for_element(driver, "video-link");
    assert_interval(driver, "64");

    import_backup(driver, json_fixture);
    util.wait_for_element(driver, function find_special_video () {
        // jshint undef: false
        let titles = Array.from(document.getElementsByClassName('video-title'));
        return titles.filter(e => {
            return e.firstElementChild.textContent.includes("special fabricated video");
        });
        // jshint undef: true
    }, 5000);

    assert_interval(driver, "65536");
}

function import_backup(driver, fixture) {
    close_modals(driver);
    open_settings(driver);
    util.wait_for_element(driver, "backup-tab").click();
    util.wait_for_element(driver, "import-input").sendKeys(fixture);
    util.wait_for_element(driver, "import-btn").click();
    close_settings(driver);
}

function assert_interval(driver, expected) {
    open_settings(driver);
    driver.wait(() => {
        let input = driver.findElement(By.className("interval-input"));
        return input.getAttribute("value").then(val => val === expected);
    }, 1000);
    close_settings(driver);
}
