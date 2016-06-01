const util = require("../util"),
      open_settings = util.open_settings;
const webdriver = require('selenium-webdriver'),
      By = webdriver.By;

exports.run = run;
exports.need_debug = true;

const test_interval = "1906";

function run(driver, debug) {
    driver.get(util.hub_url);
    if (!debug) {
        util.wait_for_element(driver, "modal");
        util.close_modals(driver);
    }
    open_settings(driver);
    let input = driver.findElement(By.className("interval-input"));
    input.clear();
    input.sendKeys(test_interval);
    driver.findElement(By.className("save-btn")).click();
    driver.navigate().refresh();
    if (!debug) {
        util.wait_for_element(driver, "modal");
        util.close_modals(driver);
    }
    open_settings(driver);
    driver.wait(() => {
        let input = driver.findElement(By.className("interval-input"));
        return input.getAttribute("value").then(val => val === test_interval);
    }, 1000);
    util.close_settings(driver);
}
