const path = require("path");
const firefox = require('selenium-webdriver/firefox');

const xpi_path = process.argv[3];
const installer_xpi_path = path.join(__dirname, "xpis", "extension_auto_installer.xpi");

exports.with_current_xpi = make_instance.bind(null, xpi_path);
exports.for_migration = make_instance.bind(null, installer_xpi_path);
exports.current_xpi_path = xpi_path;

function make_instance (...extensions) {
    let profile = new firefox.Profile();
    profile.setPreference("extensions.sdk.console.logLevel", "all");
    profile.setPreference("webdriver.load.strategy", "eager");

    for (let path of extensions) {
        profile.addExtension(path);
    }

    let options = new firefox.Options().setProfile(profile);
    return new firefox.Driver(options);
}
