const util = require("../util");

exports.run = run;

function run(driver) {
    driver.get(util.hub_url);

    let input = util.wait_for_element(driver, "channel-search");
    input.clear();
    input.sendKeys("youtube\n");
    // the seach might take a while
    util.wait_for_element(driver, "channel-add", 10 * 1000).click();
    util.wait_for_element(driver, "modal-channel-row", 1000);
}
