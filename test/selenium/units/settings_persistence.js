const util = require("../util"),
      open_settings = util.open_settings;
const webdriver = require('selenium-webdriver'),
      By = webdriver.By;

exports.run = run;
exports.need_debug = true;

function run(driver) {
    const test_interval = "1906";

    driver.get(util.hub_url);
    open_settings(driver);
    let input = driver.findElement(By.className("interval-input"));
    input.clear();
    input.sendKeys(test_interval);
    driver.findElement(By.className("save-btn")).click();
    driver.navigate().refresh();
    open_settings(driver);
    driver.wait(() => {
        let input = driver.findElement(By.className("interval-input"));
        return input.getAttribute("value").then(val => val === test_interval);
    }, 1000);

}
