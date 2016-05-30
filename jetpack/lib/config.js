/*
This Source Code Form is subject to the terms of the
Mozilla Public License, v. 2.0.
If a copy of the MPL was not distributed with this file,
You can obtain one at http://mozilla.org/MPL/2.0/.
Author: XrXr

storage.config is used for storing all the values
*/
const { forward_idb_request } = require("./core/storage");
const util = require("./util");

const _name = 0;
const _value = 2;
const basic_configs = [
    ["interval", "number", 10],
    ["play_sound", "boolean", true],
    ["in_background", "boolean", true],
    ["animations", "boolean", true],
];

const config_store = trans => trans.objectStore("config");

function get_one (trans, key, cb) {
    let found = false;
    for (let preset of basic_configs) {
        if (preset[_name] === key) {
            found = true;
            break;
        }
    }
    if (!found && key !== "last_checked") {
        throw Error(key + " is an Invalid config name");
    }
    let req = config_store(trans).get(key);
    forward_idb_request(req, cb, record => record.value);
}

function maybe_fill_defaults(trans) {
    let store = config_store(trans);
    let cursor_req = store.openCursor();
    cursor_req.onsuccess = () => {
        if (cursor_req.result) {  // config store is not empty
            return;
        }

        for (let preset of basic_configs) {
            store.add({
                name: preset[_name],
                value: preset[_value]
            });
        }
    };
}

function _type_correction (obj, key, expect, fall_back) {
    if (obj) {
        if (typeof(obj[key]) !== expect) {
            obj[key] = fall_back;
        }
    }
}

function _isNumber (n) {
    return !isNaN(parseFloat(n)) && isFinite(n);
}

function update (trans, new_config, cb=util.noop) {
    // sanitize new_config
    if (_isNumber(new_config.interval)) {
        new_config.interval = Number(new_config.interval);
        if (new_config.interval < 5) {
            new_config.interval = 5;
        }
    } else {
        new_config.interval = 10;
    }
    basic_configs.forEach(preset => _type_correction(new_config, ...preset));

    let store = config_store(trans);

    let write_list = [];
    for (let [config_name] of basic_configs) {
        if (config_name in new_config) {
            write_list.push({
                name: config_name,
                value: new_config[config_name]
            });
        }
    }

    util.cb_each(write_list, (config, done) => {
        let req = store.put(config);
        forward_idb_request(req, done);
    }, cb);
}

function get_all (trans, cb) {
    let req = config_store(trans).getAll();
    req.onerror = () => cb(req.error);

    req.onsuccess = () => {
        let config = {};
        for (let entry of req.result) {
            config[entry.name] = entry.value;
        }
        delete config.last_checked;
        cb(null, config);
    };
}

exports.update = update;
exports.get_all = get_all;
exports.get_one = get_one;
exports.maybe_fill_defaults = maybe_fill_defaults;
