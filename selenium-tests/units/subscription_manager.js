/*
This Source Code Form is subject to the terms of the
Mozilla Public License, v. 2.0.
If a copy of the MPL was not distributed with this file,
You can obtain one at http://mozilla.org/MPL/2.0/.
Author: XrXr
*/
const util = require("../util");

exports.run = run;

function run(driver, debug) {
    driver.get(util.hub_url);

    if (debug) {
        util.open_sub_manager(driver);
    }

    let input = util.wait_for_element(driver, "channel-search");
    input.clear();
    input.sendKeys("youtube\n");
    // the seach might take a while
    util.wait_for_element(driver, "channel-add", 10 * 1000).click();
    util.wait_for_element(driver, "modal-channel-row", 1000);
}
