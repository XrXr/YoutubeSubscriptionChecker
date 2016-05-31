const storage = require("../lib/core/storage");
const config = require("../lib/config");
const util = require("../lib/util");
const TEST_DB_NAME = "youtube-checker-test";
const { indexedDB } = require('sdk/indexed-db');

const channel_fixture = {
    id: "Xh1hhEWhe",
    title: "not a real Youtube channel"
};

const vid_fixture = {
    video_id: "I am not a snowflake",
    title: "just making sure",
    thumbnails: {
        medium: {
            url: "example.com",
            width: 100,
            height: 200
        }
    },
    duration: "",
    channel_id: channel_fixture.id,
    published_at: "2016-05-11T13:00:00.000Z"
};

exports["test video operations"] = {
    "test put_into_history"(assert, done) {
        clear_db().then(ensure_open).then(db => {
            let trans = db.transaction(["video", "history"], "readwrite");
            storage.video_store(trans).add(vid_fixture);

            storage.video.put_into_history(trans, vid_fixture.video_id, (err) => {
                assert.ok(!err, "no error");
                let req = storage.history_store(trans).get(vid_fixture.video_id);
                storage.forward_idb_request(req, (err, result) => {
                    assert.ok(!err, "no error");
                    assert.equal(result.video_id, vid_fixture.video_id, "same item put into history");
                    assert.equal(result.title, vid_fixture.title, "same item put into history");
                    done();
                });
            });
        });
    },
    "test add_one strip extra info"(assert, done) {
        clear_db().then(ensure_open).then(db => {
            let trans = db.transaction("video", "readwrite");
            storage.video.add_one(trans, Object.assign({
                description: "extra info that takes up space",
                junk: "I should also be gone"
            }, vid_fixture));
            trans.oncomplete = () => video_stripped(assert, db, done);
        });
    },
    "test add_list strip extra info"(assert, done) {
        clear_db().then(ensure_open).then(db => {
            let trans = db.transaction("video", "readwrite");
            storage.video.add_list(trans, [Object.assign({
                description: "extra info that takes up space",
                junk: "I should also be gone"
            }, vid_fixture)]);
            trans.oncomplete = () => video_stripped(assert, db, done);
        });
    },
};

function video_stripped(assert, db, done) {
    let read = db.transaction("video", "readwrite");
    let req = storage.video_store(read).get(vid_fixture.video_id);
    storage.forward_idb_request(req, (err, vid) => {
        assert.ok(!err, "no error");
        assert.deepEqual(vid, vid_fixture, "extra fields stripped");
        done();
    });
}

exports["test channel operations"] = {
    "test add_one"(assert, done) {
        clear_db().then(ensure_open).then(db => {
            let trans = db.transaction(["channel", "check_stamp"], "readwrite");
            storage.channel.add_one(trans, channel_fixture, err => {
                assert.ok(!err, "no error");
                storage.channel.get_by_id(trans, channel_fixture.id, (err, result) => {
                    assert.ok(!err, "no error");
                    assert.deepEqual(result, channel_fixture, "channel added");
                });

                storage.check_stamp.get_for_channel(trans, channel_fixture.id, (err, stamp) => {
                    assert.ok(!err, "no error");
                    assert.ok(stamp, "stamp added");
                });
            });

            done_after_trans(trans, done);
        });
    },
    "test add_one bad data"(assert, done) {
        clear_db().then(ensure_open).then(db => {
            let start_trans = () => db.transaction(["channel", "check_stamp"], "readwrite");
            util.cb_join([cb => {
                storage.channel.add_one(start_trans(), undefined, err => {
                    assert.ok(err, "shouldn't add undefined");
                    cb();
                });
            }, cb => {
                storage.channel.add_one(start_trans(), {}, err => {
                    assert.ok(err, "shouldn't add object without id");
                    cb();
                });
            }, cb => {
                storage.channel.add_one(start_trans(), 3, err => {
                    assert.ok(err, "shouldn't add number");
                    cb();
                });
            }], done);
        });
    },
    "test strip extra fields"(assert, done) {
        clear_db().then(ensure_open).then(db => {
            let trans = db.transaction(["channel", "check_stamp"], "readwrite");
            let channel_with_extra = Object.assign({
                description: "junk everywhere",
                thumbnails: {
                    url: "www.example.org/jpg.jpg",
                }
            }, channel_fixture);
            storage.channel.add_one(trans, channel_with_extra, err => {
                assert.ok(!err, "no error");
                let read = db.transaction("channel");
                storage.channel.get_by_id(read, channel_fixture.id, (err, channel) => {
                    assert.ok(!err, "no error");
                    assert.deepEqual(channel, channel_fixture);
                    done();
                });
            });
        });
    },
    "test order kept"(assert, done) {
        clear_db().then(ensure_open).then(db => {
            let trans = db.transaction(["channel", "check_stamp"], "readwrite");
            let fixtures = [{
                id: "22981",
                title: "one"
            }, {
                id: "1",
                title: "bad"
            }, {
                id: "-dsf1",
                title: "foo"
            }, channel_fixture];
            for (let e of fixtures) {
                storage.channel.add_one(trans, e);
            }
            trans.oncomplete = () => {
                let trans = db.transaction("channel");
                storage.channel.get_all(trans, (err, channels) => {
                    assert.ok(!err, "no error");
                    assert.deepEqual(channels, fixtures);
                    done();
                });
            };
        });
    },
    "test remove_one"(assert, done) {
        clear_db().then(ensure_open).then(db => {
            let fill = db.transaction(["channel", "check_stamp", "video"], "readwrite");
            storage.video.add_one(fill, vid_fixture);
            storage.channel.add_one(fill, channel_fixture);
            fill.oncomplete = () => {
                let del = db.transaction(["channel", "check_stamp", "video"], "readwrite");
                storage.channel.remove_one(del, channel_fixture, err => {
                    assert.ok(!err, "no error");
                    check_nothing_is_present(db);
                });
            };
        });

        function check_nothing_is_present(db) {
            let trans = db.transaction(["channel", "check_stamp", "video"]);
            util.cb_join([done => {
                storage.channel.get_by_id(trans, channel_fixture.id, done);
            }, done => {
                let req = storage.video_store(trans).get(vid_fixture.video_id);
                storage.forward_idb_request(req, done);
            }, done => {
                storage.check_stamp.get_for_channel(trans, channel_fixture.id, done);
            }], (err, channel, video, stamp) => {
                assert.ok(!err, "no error");
                assert.equal(channel, null, "no channel after removal");
                assert.equal(video, null, "no video after removal");
                assert.equal(stamp, null, "no checkstamp after removal");
                done();
            });
        }
    }
};

exports["test config"] = {
    "test last_checked not overwritten by config update"(assert, done) {
        clear_db().then(ensure_open).then(db => {
            let trans = db.transaction(["config"], "readwrite");

            let dummy_stamp = Date.now() - 1282;
            storage.update_last_check(trans, err => {
                assert.ok(!err, "no error");
            }, dummy_stamp);

            config.update(trans, {
                interval: 100000
            }, err => {
                assert.ok(!err, "no error");

                config.get_one(trans, "last_checked", (err, val) => {
                    assert.ok(!err, "no error");
                    assert.strictEqual(val, dummy_stamp);
                });
            });

            done_after_trans(trans, done);
        });
    }
};

exports["test initialize_db"] = {
    "test multiple init"(assert, done) {
        clear_db().then(() => {
            storage.initialize_db((err, did_init) => {
                assert.ok(!err, "first init no error");
                assert.ok(did_init, "first init did init");

                storage.open((err, db) => {
                    assert.ok(!err, "no error");

                    let trans = db.transaction(["video", "config"], "readwrite");
                    storage.video.add_one(trans, vid_fixture);
                    config.update(trans, {
                        interval: 1000,
                        play_sound: false,
                        animations: true
                    }, err => {
                        assert.ok(!err, "no error");
                    });

                    trans.oncomplete = () => second_round(db);
                }, TEST_DB_NAME);
            }, TEST_DB_NAME);
        });

        function second_round(db) {
            db.close();

            storage.initialize_db((err, did_init) => {
                assert.ok(!err, "second init no error");
                assert.ok(did_init, "second init not inited");

                storage.open((err, db) => {
                    let trans = db.transaction(["video", "config"]);

                    let vid_req = storage.video_store(trans).get(vid_fixture.video_id);
                    vid_req.onsuccess = () => {
                        assert.ok(vid_req.result, "video not wiped");
                    };

                    config.get_all(trans, (err, config) => {
                        assert.ok(!err, "no error");
                        assert.equal(config.interval, 1000, "config is kept");
                        assert.equal(config.play_sound, false, "config is kept");
                    });

                    done_after_trans(trans, done);
                }, TEST_DB_NAME);
            });
        }
    }
};

let db;
function ensure_open() {
    return new Promise((resolve, reject) => {
        if (db) {
            return resolve(db);
        }
        storage.initialize_db(err => {
            if (err) {
                return reject(err);
            }
            storage.open((err, opened_db) => {
                if (err) {
                    return reject(err);
                }
                db = opened_db;
                resolve(db);
            }, TEST_DB_NAME);
        }, TEST_DB_NAME);
    });
}

function clear_db() {
    return new Promise((resolve, reject) => {
        if (db) {
            db.close();
            db = null;
        }
        let del_req = indexedDB.deleteDatabase(TEST_DB_NAME);
        del_req.onerror = reject;
        del_req.onsuccess = resolve;
    });
}

function done_after_trans(trans, done) {
    const finish = () => done();
    trans.oncomplete = finish;
    trans.onabort = finish;
}

require("sdk/test").run(exports);