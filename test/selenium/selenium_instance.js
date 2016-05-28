const main_pkg = require("../../package.json");
const path = require("path");

const firefox = require('selenium-webdriver/firefox');

let root_path = path.resolve(path.join(__dirname), "../../");
const xpi_path = path.join(root_path, `${main_pkg.id}-${main_pkg.version}.xpi`);


module.exports = function make_selenium_instance () {
    let profile = new firefox.Profile();
    profile.setPreference('extensions.sdk.console.logLevel', 'all');
    profile.setPreference("webdriver.load.strategy", "eager");
    let options = new firefox.Options().setProfile(profile);

    profile.addExtension(xpi_path);
    return new firefox.Driver(options);
};

