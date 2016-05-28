const make_selenium_instance = require("./selenium_instance");
const path = require("path");
const fs = require("fs");

const units = fs.readdirSync(path.resolve(path.join(__dirname), "units"))
                        .filter(e => e.slice(-2) === "js")
                        .map(e => e.slice(0, -3));


for (let unit_name of units) {
    let mod = require(`./units/${unit_name}`);
    if (mod.need_debug) {
        process.env.YTCHECKERDEBUG = true;
    }
    let driver = make_selenium_instance();
    mod.run(driver);
    driver.quit().finally(() => process.env.YTCHECKERDEBUG = false);
}
