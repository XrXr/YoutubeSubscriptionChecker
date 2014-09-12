/*
This Source Code Form is subject to the terms of the
Mozilla Public License, v. 2.0.
If a copy of the MPL was not distributed with this file,
You can obtain one at http://mozilla.org/MPL/2.0/.
Author: XrXr

storage.config is used for storing all the values
*/
const { storage } = require("sdk/simple-storage");

const _name = 0;
const _type = 1;
const _value = 2;
const basic_configs = [
    ["interval", "number", 10],
    ["play_sound", "boolean", true],
    ["in_background", "boolean", true],
    ["animations", "boolean", true]
];

function get_one (key) {
    let found = false;
    for (let preset of basic_configs) {
        if (preset[_name] === key) {
            found = true;
            break;
        }
    }
    if (!found) {
        throw Error("Invalid config name");
    }
    return storage.config[key];
}

function _type_correction (obj, key, expect, fall_back) {
    if (obj) {
        if (typeof obj[key] !== expect) {
            obj[key] = fall_back;
        }
    }
}

function _isNumber (n) {
    return !isNaN(parseFloat(n)) && isFinite(n);
}

function ensure_valid () {
    if (storage.config === undefined) {
        let default_config = {};
        basic_configs.map(entry =>
            default_config[entry[_name]] = entry[_value]
        );
        storage.config = default_config;
    } else {
        basic_configs.map(preset =>
            _type_correction(storage.config, ...preset)
        );
    }
}

function update (new_config) {
    // sanitize new_config
    if (_isNumber(new_config.interval)) {
        new_config.interval = Number(new_config.interval);
        if (new_config.interval < 5) {
            new_config.interval = 5;
        }
    }else{
        new_config.interval = 10;
    }
    storage.config = new_config;
    ensure_valid();
}

function get_all () {
    return storage.config;
}

exports.ensure_valid = ensure_valid;
exports.update = update;
exports.get_all = get_all;
exports.get_one = get_one;