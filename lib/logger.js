const { forward_idb_request } = require("./core/storage");
const { indexedDB: idb } = require('sdk/indexed-db');
let db;
const LOGGER_DB_NAME = "youtube-checker-logs";
const ERROR_STORE_NAME = "errors";

function initialize(cb) {
    let req = idb.open(LOGGER_DB_NAME);
    req.onupgradeneeded = () => {
        req.result.createObjectStore(ERROR_STORE_NAME, { autoIncrement: true });
    };
    req.onsuccess = () => {
        db = req.result;
        cb(null);
    };
    req.onerror = () => cb(req.error);
}

function is_response(a) {
    return typeof a === "object" && "status" in a && "url" in a;
}

function log_error(a, b=Error()) {
    let now = Date.now();
    console.log(...arguments);
    if (!db) {
        return;
    }
    let store = db.transaction(ERROR_STORE_NAME, "readwrite").objectStore(ERROR_STORE_NAME);
    if (is_response(a)) {
        store.add({
            now,
            type: "Bad API Response",
            status: a.status,
            response_text: a.text
        });
    } else {
        if (a instanceof Error) {
            store.add(pluck_error_fields(a));
            return;
        }
        if (typeof a === "string" && b) {
            let log = pluck_error_fields(b);
            log.message = a;
            store.add(log);
        }

    }

    function pluck_error_fields(error) {
        return {
            now,
            stack: error.stack,
            error_name: error.name,
            erorr_message: error.message,
        };
    }
}

function dump(cb) {
    if (!db) {
        return cb(Error("Log db is not available"));
    }
    let req = db.transaction(ERROR_STORE_NAME)
                .objectStore(ERROR_STORE_NAME).getAll();
    forward_idb_request(req, cb);
}

exports.initialize = initialize;
exports.log_error = log_error;
exports.dump = dump;
