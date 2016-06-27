/*
This Source Code Form is subject to the terms of the
Mozilla Public License, v. 2.0.
If a copy of the MPL was not distributed with this file,
You can obtain one at http://mozilla.org/MPL/2.0/.
Author: XrXr
*/
const { cb_settle, cb_each, cb_join } = require("../lib/util");
const { setTimeout } = require("sdk/timers");

function SettleResult(success, value) {
    return {
        success,
        value
    };
}

exports["test cb_settle"] = {
    "test empty"(assert, done) {
        cb_settle([], e => e, (err, results) => {
            assert.ok(!err, "no error");
            assert.equal(results.length, 0, "empty array");
            done();
        });
    },
    "test all success"(assert, done) {
        cb_settle([1, 2, 3], (e, instance_done) => {
            setTimeout(() => instance_done(null, e), e);
        }, (err, results) => {
            assert.ok(!err, "No error");
            assert.deepEqual(results,
                [SettleResult(true, 1), SettleResult(true, 2), SettleResult(true, 3)],
                "correct settle results");
            done();
        });
    },
    "test some fails"(assert, done) {
        let secret_error = Error("It's a secret");
        cb_settle([1, 2, 3], (e, instance_done) => {
            setTimeout(() => {
                if (e === 2) {
                    instance_done(secret_error);
                } else {
                    instance_done(null, e);
                }
            }, e);
        }, (err, results) => {
            assert.ok(!err, "No error");
            assert.deepEqual(results,
                [SettleResult(true, 1), SettleResult(false, secret_error), SettleResult(true, 3)],
                "correct settle results");
            done();
        });
    },
    "test catch excepts"(assert, done) {
        const second_fail = "mega rager";
        cb_settle([1, 2, 3], (e, instance_done) => {
            if (e === 1) {
                throw Error("fluke");
            }
            if (e === 2) {
                instance_done(second_fail);
                // should exceptions after calling callback
                throw Error("fluke");
            }
            instance_done(null, 3);
        }, (err, results) => {
            assert.ok(!err, "No error");
            assert.equal(results[0].success, false, "sync exceptions caught");
            assert.deepEqual(results[1], SettleResult(false, second_fail));
            assert.deepEqual(results[2], SettleResult(true, 3));
            done();
        });
    }
};

exports["test cb_each"] = {
    "test empty"(assert, done) {
        cb_each([], e => e, (err) => {
            assert.ok(!err, "no error");
            done();
        });
    },
    "test all success"(assert, done) {
        let tracker = "";
        cb_each([1, 2, 3], (e, instance_done) => {
            setTimeout(() => {
                tracker += e;
                instance_done(null, e);
            }, e);
        }, function (err) {
            assert.ok(!err, "No error");
            assert.equal(tracker, "123", "all elements are iterated over");
            assert.equal(arguments.length, 1, "main cb only gets one argument");
            done();
        });
    },
    "test some fails"(assert, done) {
        let main_cb_call_count = 0;
        cb_each([10, 50, 3], (e, instance_done) => {
            setTimeout(() => {
                if (e === 10 || e === 50) {
                    instance_done(Error(e));
                } else {
                    instance_done();
                }
            }, e);
        }, function (err) {
            main_cb_call_count++;
            if (main_cb_call_count >= 2) {
                assert.ok(false, "main cb should only be called once");
                return done();
            }
            setTimeout(() => {
                if (main_cb_call_count >= 2) {
                    return;
                }
                assert.equal(err.message, "10", "First error should be passed");
                assert.equal(arguments.length, 1, "main cb only gets one argument");
                done();
            }, 100);
        });
    },
    "test catch excepts"(assert, done) {
        let secret_error = Error("food");
        cb_each([1, 2, 3], (e, instance_done) => {
            if (e === 3) {
                throw secret_error;
            }
            instance_done();
        }, err => {
            assert.equal(secret_error, err, "sync exception caught");
            done();
        });
    },
    "test except after cb reject"(assert, done) {
        let secret_error = Error("food");
        cb_each([1, 2, 3], (e, instance_done) => {
            if (e === 2) {
                instance_done(secret_error);
                throw Error("I should be ignored");
            }
            instance_done();
        }, err => {
            assert.equal(secret_error, err, "get error from cb");
            done();
        });
    }
};

exports["test cb_join"] = {
    "test all success"(assert, done) {
        cb_join([cb => setTimeout(() => cb(null, "first"), 5),
                 cb => setTimeout(() => cb(null, "second"), 10),
                 cb => setTimeout(() => cb(null, "third"), 3)],
            (err, first, second, third) => {
                assert.ok(!err, "no error");
                assert.equal(first + second + third, "firstsecondthird",
                             "complete handler correctly applied");
                done();
            });
    },
    "test multi fail"(assert, done) {
        cb_join([cb => setTimeout(() => cb(null, "first"), 5),
                 cb => setTimeout(() => cb(Error("second")), 10),
                 cb => setTimeout(() => cb(Error("first")), 3)],
            err => {
                assert.equal(err.message, "first", "called with first error");
                done();
            });
    },
    "test catch excepts"(assert, done) {
        let secret_error = Error("food");
        cb_join([done => {
            done();
        }, () => {
            throw secret_error;
        }, done => {
            done();
        }], err => {
            assert.equal(secret_error, err, "sync exception caught");
            done();
        });
    },
    "test except after cb reject"(assert, done) {
        let secret_error = Error("food");
        cb_join([done => {
            done();
        }, done => {
            done(secret_error);
            throw Error("don't catch me");
        }, done => {
            done();
        }], err => {
            assert.equal(secret_error, err, "get error from cb");
            done();
        });
    },
};
require("sdk/test").run(exports);
