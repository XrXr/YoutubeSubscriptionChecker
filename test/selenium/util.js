const webdriver = require('selenium-webdriver'),
      By = webdriver.By,
      until = webdriver.until;
const main_pkg = require("../../package.json");

exports.hub_url = `resource://${main_pkg.id.replace("@", "-at-")}/data/hub/home.html`;
exports.open_settings = click_btn_wait_for_modal.bind(null, "settings-btn");
exports.open_sub_manager = click_btn_wait_for_modal.bind(null, "subscriptions-btn");
exports.wait_for_element = wait_for_element;

function wait_for_element(driver, class_name, timeout=1000) {
    driver.wait(until.elementLocated(By.className(class_name)), timeout);
    return driver.findElement(By.className(class_name));
}

function click_btn_wait_for_modal(class_name, driver) {
    let btn_cond = By.className(class_name);
    driver.wait(until.elementLocated(btn_cond), 1000);
    driver.findElement(btn_cond).click();
    driver.wait(until.elementLocated(By.className("modal")), 1000);
}
