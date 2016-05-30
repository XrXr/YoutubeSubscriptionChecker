const webdriver = require("selenium-webdriver"),
      By = webdriver.By,
      until = webdriver.until;

const util = require("./util");

exports.pre_install = pre_install;
exports.after_install = after_install;

function pre_install (driver) {
    driver.get(util.hub_url);
    return driver.wait(until.elementLocated(By.className("video-link")), 20 * 1000);
}

function after_install(driver) {
    // repeatedly go the the hub page and try to locate the changelog modal
    driver.wait(() => {
        return driver.get(util.hub_url).then(() => {
            return driver.wait(() => {
                return driver.isElementPresent(By.js(function () {
                    // jshint undef: false
                    let heading = document.querySelector("h3.heading");
                    if (heading && heading.textContent === "Changelog") {
                        return heading;
                    } else {
                        return [];
                    }
                    // jshint undef: true
                }));
            }, 5000);
        }, () => false);
    }, 50 * 1000);
}
