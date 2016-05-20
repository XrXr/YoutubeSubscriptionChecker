const storage = require("../lib/core/storage");
const TEST_DB_NAME = "youtube-checker-test";

const vid_fixture = {
    video_id: "I am not a snowflake",
    title: "just making sure"
};

exports["test video"] = {
    "test put_into_history"(assert, done) {
        ensure_open().then(db => {
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

require("sdk/test").run(exports);
