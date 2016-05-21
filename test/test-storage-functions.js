const storage = require("../lib/core/storage");
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
    "test add_video strip extra info"(assert, done) {
        clear_db().then(ensure_open).then(db => {
            let trans = db.transaction("video", "readwrite");
            storage.video.add_one(trans, Object.assign({
                description: "extra info that takes up space",
                junk: "I should also be gone"
            }, vid_fixture));
            trans.oncomplete = () => {
                let read = db.transaction("video", "readwrite");
                let req = storage.video_store(read).get(vid_fixture.video_id);
                storage.forward_idb_request(req, (err, vid) => {
                    assert.ok(!err, "no error");
                    assert.deepEqual(vid, vid_fixture, "extra fields stripped");
                    done();
                });
            };
        });
    },
};

exports["test channel operations"] = {
    "test add_one"(assert, done) {
        clear_db().then(ensure_open).then(db => {
            let trans = db.transaction(["channel", "check_stamp"], "readwrite");
            storage.channel.add_one(trans, channel_fixture, err => {
                assert.ok(!err, "no error");
                let req = storage.channel_store(trans).get(channel_fixture.id);
                storage.forward_idb_request(req, (err, result) => {
                    assert.ok(!err, "no error");
                    assert.deepEqual(result, channel_fixture, "channel added");
                });

                storage.check_stamp.get_for_channel(trans, channel_fixture.id, (err, stamp) => {
                    assert.ok(!err, "no error");
                    assert.ok(stamp, "stamp added");
                });
            });

            trans.oncomplete = () => done();
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
                assert.strictEqual(channel, undefined, "no channel after removal");
                assert.strictEqual(video, undefined, "no video after removal");
                assert.strictEqual(stamp, undefined, "no checkstamp after removal");
                done();
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

require("sdk/test").run(exports);
