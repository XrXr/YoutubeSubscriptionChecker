const webdriver = require('selenium-webdriver'),
      By = webdriver.By,
      until = webdriver.until;
const main_pkg = require("../../package.json");

exports.hub_url = `resource://${main_pkg.id.replace("@", "-at-")}/data/hub/home.html`;
exports.open_settings = open_settings;

function open_settings(driver) {
    let btn_cond = By.className("settings-btn");
    driver.wait(until.elementLocated(btn_cond), 1000);
    driver.findElement(btn_cond).click();
    driver.wait(until.elementLocated(By.className("modal")), 1000);
}
