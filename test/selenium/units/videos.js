const util = require("../util");
const { Key } = require("selenium-webdriver/lib/input");
exports.run = run;
exports.need_debug = true;

function run(driver, no_debug) {
    driver.get(util.hub_url);
    driver.sleep(500);

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

    if (no_debug) {
        return;
    }

    driver.get(util.hub_url);
    driver.sleep(1000);
    util.wait_for_element(driver, function look_for_youtube() {
        // jshint undef: false
        let bars = Array.from(document.getElementsByClassName("channel-title"));
        return bars.filter(e => e.textContent === "Youtube");
        // jshint undef: true
    }, 10 * 1000).click();
    util.wait_for_element(driver, "video-link");
}
