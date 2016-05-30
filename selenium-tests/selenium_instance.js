const path = require("path");
const main_pkg = require("../jetpack/package.json");

const firefox = require('selenium-webdriver/firefox');

let root_path = path.resolve(__dirname, "../jetpack");
const xpi_path = path.join(root_path, `${main_pkg.id}-${main_pkg.version}.xpi`);

exports.with_current_xpi = make_instance.bind(null, xpi_path);
exports.for_migration = make_instance.bind(null, path.join(__dirname, "xpis", "extension_auto_installer.xpi"));
exports.current_xpi_path = xpi_path;

function make_instance (...extensions) {
    let profile = new firefox.Profile();
    profile.setPreference('extensions.sdk.console.logLevel', 'all');
    profile.setPreference("webdriver.load.strategy", "eager");

    for (let path of extensions) {
        profile.addExtension(path);
    }

    let options = new firefox.Options().setProfile(profile);
    return new firefox.Driver(options);
}
