const main_pkg = require("../../package.json");
const path = require("path");
const webdriver = require('selenium-webdriver'),
      By = webdriver.By,
      until = webdriver.until;
const firefox = require('selenium-webdriver/firefox');

let root_path = path.resolve(path.join(__dirname), "../../");
let xpi_path = path.join(root_path, `${main_pkg.id}-${main_pkg.version}.xpi`);

let profile = new firefox.Profile();
profile.setPreference('extensions.sdk.console.logLevel', 'all');
profile.setPreference("webdriver.load.strategy", "eager");
let options = new firefox.Options().setProfile(profile);

profile.addExtension(xpi_path);
let driver = new firefox.Driver(options);

process.env.YTCHECKERDEBUG=true;

const test_interval = "1906";

function open_settings() {
    let btn_cond = By.className("settings-btn");
    driver.wait(until.elementLocated(btn_cond), 1000);
    driver.findElement(btn_cond).click();
    driver.wait(until.elementLocated(By.className("modal")), 1000);
}

driver.get(`resource://${main_pkg.id.replace("@", "-at-")}/data/hub/home.html`);
open_settings();
let input = driver.findElement(By.className("interval-input"));
input.clear();
input.sendKeys(test_interval);
driver.findElement(By.className("save-btn")).click();
driver.navigate().refresh();
open_settings();
driver.wait(() => {
    let input = driver.findElement(By.className("interval-input"));
    return input.getAttribute("value").then(val => val === test_interval);
}, 1000);
