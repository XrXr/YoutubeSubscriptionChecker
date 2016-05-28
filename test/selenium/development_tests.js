const make_selenium_instance = require("./selenium_instance");
const path = require("path");
const fs = require("fs");

const units = fs.readdirSync(path.resolve(path.join(__dirname), "units"))
                        .filter(e => e.slice(-2) === "js")
                        .map(e => e.slice(0, -3))
                        .sort();

run_unit(0);

function run_unit(i) {
    if (i >= units.length) {
        return;
    }
    let unit_name = units[i];
    let mod = require(`./units/${unit_name}`);
    if (mod.need_debug) {
        process.env.YTCHECKERDEBUG = true;
    }
    let driver = make_selenium_instance();
    mod.run(driver);
    driver.quit().finally(() => {
        delete process.env.YTCHECKERDEBUG;
        run_unit(i + 1);
    });
}
