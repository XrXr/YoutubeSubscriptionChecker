#!/usr/bin/env node
/*
This Source Code Form is subject to the terms of the
Mozilla Public License, v. 2.0.
If a copy of the MPL was not distributed with this file,
You can obtain one at http://mozilla.org/MPL/2.0/.
Author: XrXr

Make a temporary profile which contains an xpi then start a Firefox instance
with it
*/
const offset = process.argv[0].includes("node") ? 2 : 1;
function arg(pos) {
    return process.argv[pos + offset];
}

const firefox = require('selenium-webdriver/firefox');
let profile = new firefox.Profile();
profile.setPreference('extensions.sdk.console.logLevel', 'all');
let options = new firefox.Options().setProfile(profile);

let num_args = process.argv.length - offset;
if (num_args !== 1 && num_args !== 3) {
    throw Error("Wrong usage. Please see README");
}

if (arg(0) === '-b') {
    let binary = new firefox.Binary(arg(1));
    options.setBinary(binary);
}
profile.addExtension(process.argv[process.argv.length - 1]);
let driver = new firefox.Driver(options);

// wait until the browser quits
driver.wait(function() {
    return driver.getWindowHandle().then(() => false, () => true);
});
