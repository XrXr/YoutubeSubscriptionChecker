// this module fills test data into either the indexed-db or simple storage
// for testing
if (!("YTCHECKERDEBUG" in require("sdk/system").env)) {
    throw Error("this module is only for development");
}
console.log("Youtube Subscription Checker in development mode");

const storage = require("./core/storage");
const filters = require("./core/filters");
const { storage: simple_storage } = require("sdk/simple-storage");

if (require("sdk/self").loadReason === "install") {
    simple_storage.subscriptions = [
      {
        "title": "Philip DeFranco",
        "id": "UClFSU9_bUb4Rc6OYfTt5SPw",
        "latest_date": Date.now()
      },
      {
        "title": "response has no contentDetails",
        "id": "UCDbWmfrwmzn1ZsGgrYRUxoA",
        "latest_date": 1453513806000
      },
      {
        "title": "SourceFed I made the name long just to test",
        "id": "UC_gE-kg7JvuwCNlbZ1-shlA",
        "latest_date": Date.now() - 12000000000
      },
      {
        "title": "Super Panic Frenzy",
        "id": "UCxsbRjOUPXeFGj7NSCOl8Cw",
        "latest_date": Date.now() - 12000000000,
        filters: [{
            channel_title: "Super Panic Frenzy",
            video_title_pattern: "japan",
            video_title_is_regex: false,
            include_on_match: true,
            inspect_tags: true
        }]
      },
      {
        title: "LinusTechTips",
        id: "UCXuqSBlHAE6Xw-yeJA0Tunw",
        latest_date: Date.now()
    }];
}

function run(cb) {
    storage.open((err, db) => {
        if (err) {
            console.error(err);
            return;
        }


        let trans = db.transaction(["channel", "filter", "check_stamp"], "readwrite");

        const add_channel = (chan) => {
            storage.channel.add_one(trans, chan, () => {});
            storage.check_stamp.update(trans, chan.id, Date.now() - 12000000000);
        };

        add_channel({
            "title": "Northernlion",
            "id": "UC3tNpTOHsTnkmbwztCs30sA",
        });

        filters.update(trans, [{
            channel_id: "UC3tNpTOHsTnkmbwztCs30sA",
            video_title_pattern: "isaac",
            video_title_is_regex: false,
            include_on_match: true,
            inspect_tags: true
        }]);

        trans.oncomplete = () => {
            db.close();
            cb();
        };
    });
}

exports.run = run;