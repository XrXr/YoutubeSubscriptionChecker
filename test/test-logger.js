const logger = require("../lib/logger");
const { setTimeout } = require("sdk/timers");
const { Request } = require("sdk/request");

exports["test logger"] = {
    "test logger overloads"(assert, done) {
        clear_and_init().then(() => {
            const first = "plain";
            const second = "baguette";
            const third = "cats";
            logger.log_error(first);
            logger.log_error(second, TypeError("too many typos"));
            logger.log_error(SyntaxError("too many u's"), third);
            logger.log_error(Error("just error"));

            // log_error does not take a callback as nothing needs it in real use
            setTimeout(() => {
                logger.dump((err, logs) => {
                    assert.ok(!err, "no error");
                    logs.forEach(has_stacktrace.bind(null, assert));

                    assert.equal(logs[0].our_message, first, "correct our_message");
                    assert.equal(logs[1].our_message, second, "correct our_message");
                    assert.equal(logs[2].our_message, third, "correct our_message");
                    assert.ok(!("our_message" in logs[3]), "no our_message when not specified");
                    done();
                });
            }, 100);
        });
    },
    "test logging response object"(assert, done) {
        const message = "yogurt";
        clear_and_init().then(() => {
            Request({
                url: "http://httpstat.us/403",
                onComplete: response => {
                    if (response.status === 403) {
                        logger.log_error(response);
                        logger.log_error(message, response);
                        logger.log_error(response, message);
                        dump_and_assert();
                    } else {
                        console.warn("The service for 403 code seems to be broken");
                        done();
                    }
                }
            }).get();
        });

        function dump_and_assert() {
            logger.dump((err, logs) => {
                assert.ok(!err, "no error");
                logs.forEach(has_response_fields.bind(null, assert));
                assert.ok(!("our_message" in logs[0]), "no our_message when not specified");
                assert.equal(logs[1].our_message, message, "correct our_message");
                assert.equal(logs[2].our_message, message, "correct our_message");
                done();
            });
        }
    }
};

function has_response_fields(assert, log_entry) {
    assert.strictEqual(typeof log_entry.url, "string", "has url");
    assert.strictEqual(typeof log_entry.status, "number", "has status code");
    assert.strictEqual(typeof log_entry.response_text, "string", "has response_text");
}

function has_stacktrace(assert, log_entry) {
    assert.strictEqual(typeof log_entry.stack, "string", "has stack trace");
}

function clear_and_init() {
    return new Promise((resolve, reject) => {
        logger.clear(err => {
            if (err) {
                return reject(err);
            }
            logger.initialize(err => {
                if (err) {
                    return reject(err);
                }
                resolve();
            });
        });
    });
}

require("sdk/test").run(exports);
