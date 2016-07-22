/*
This Source Code Form is subject to the terms of the
Mozilla Public License, v. 2.0.
If a copy of the MPL was not distributed with this file,
You can obtain one at http://mozilla.org/MPL/2.0/.
Author: XrXr
*/
const util = require("../util"),
      open_settings = util.open_settings;
const webdriver = require('selenium-webdriver'),
      By = webdriver.By;

exports.run = run;

const GOOGLE_ID = "UCK8sQmJBp8GCxrOtXWBpyEA";

function run(driver, debug) {
    driver.get(util.hub_url);
    if (debug) {
        util.open_sub_manager(driver);
    }
    // add Youtube and Google
    let input = util.wait_for_element(driver, "channel-search");
    input.clear();
    input.sendKeys("id UCBR8-60-B28hp2BmDPdntcQ\n");
    util.wait_for_element(driver, "channel-add", 10 * 1000).click();
    input.clear();
    input.sendKeys(`id ${GOOGLE_ID}\n`);
    util.wait_for_element(driver, "channel-add", 10 * 1000).click();
    util.close_modals(driver);

    const open_filters_page = () => {
        open_settings(driver);
        util.wait_for_element(driver, "filters-tab").click();
    };

    // add a filter for Youtube and Google
    open_filters_page();
    let channel_input = util.wait_for_element(driver, "filter-channel-input");
    channel_input.sendKeys("youtube\n");
    let pattern_input = util.wait_for_element(driver, "filter-pattern-input");
    pattern_input.sendKeys("trees\n");
    let add_filter = util.wait_for_element(driver, "filter-add-btn");
    add_filter.click();

    channel_input.clear();
    pattern_input.clear();
    channel_input.sendKeys("google\n");
    pattern_input.sendKeys("titans\n");
    add_filter.click();
    driver.findElement(By.className("save-btn")).click();
    driver.navigate().refresh();

    open_filters_page();
    driver.wait(() => {
        return driver.findElements(By.css("option"))
            .then(arr => arr.length >= 2);
    });
    util.close_settings(driver);

    // delete Google channel
    // jshint undef: false
    util.open_sub_manager(driver);
    driver.findElement(By.js(function () {
        return Array.from(document.querySelectorAll(".modal-channel-title"))
            .filter(e => e.textContent === "Google")[0]
            .parentElement.querySelector("button");
    })).click();
    util.close_modals(driver);

    let google_filter = By.js(function () {
        return Array.from(document.querySelectorAll(".filter-entry"))
            .filter(e => e.textContent.includes("titans"));
    });
    // jshint undef: true

    // check that the filter for Google is gone
    open_filters_page();
    driver.wait(() => {
        return driver.isElementPresent(google_filter).then(e => !e);
    }, 1000);
    util.close_settings(driver);

    // add Google back
    util.open_sub_manager(driver);
    input = util.wait_for_element(driver, "channel-search");
    input.clear();
    input.sendKeys(`id ${GOOGLE_ID}\n`);
    util.wait_for_element(driver, "channel-add", 10 * 1000).click();
    util.close_modals(driver);

    // check that the filter for Google is resurrected
    open_filters_page();
    driver.wait(() => {
        return driver.isElementPresent(google_filter);
    }, 1000);
    util.close_settings(driver);
}
