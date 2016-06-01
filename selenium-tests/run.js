const path = require("path");
const request = require("request");
const fs = require("fs");

const selenium_instance = require("./selenium_instance");
const util = require("./util");
const migration = require("./migration");

// whether to skip tests which relies on YTCHECKERDEBUG
const no_dev = process.argv[2] === "--no-dev";

const units = fs.readdirSync(path.resolve(path.join(__dirname), "units"))
                        .filter(e => e.slice(-2) === "js")
                        .map(e => e.slice(0, -3))
                        .sort();

if (process.argv[2] === "--migration") {
    test_migration();
} else {
    run_in_sequence(0);
}

function run_in_sequence(i) {
    if (i >= units.length) {
        return;
    }
    let unit_name = units[i];
    let mod = require(`./units/${unit_name}`);
    if (mod.need_debug) {
        process.env.YTCHECKERDEBUG = true;
    }
    let driver = selenium_instance.with_current_xpi();
    mod.run(driver, mod.need_debug && !no_dev);
    driver.quit().finally(() => {
        delete process.env.YTCHECKERDEBUG;
        run_in_sequence(i + 1);
    });
}

function test_migration() {
    process.env.YTCHECKERDEBUG = true;
    let driver = selenium_instance.for_migration(path.join(__dirname, "xpis", "2.2.0.xpi"));
    migration.pre_install(driver).then(() => {
        request.post({
            url: "http://localhost:8888",
            body: fs.readFileSync(selenium_instance.current_xpi_path)
        }, () => {
            driver.sleep(2000);
            migration.after_install(driver);
            for (let name of units) {
                require(`./units/${name}`).run(driver, true);
                util.close_modals(driver);
            }
        });
    });

}
