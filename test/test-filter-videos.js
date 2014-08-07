let main = require("main");
let Filter = main.Filter;
let filter_videos = main.filter_videos;

function get_title (Video) {
    return Video.snippet.title;
}

function Video (title) {
    return {
        snippet: {
            title: title
        }
    };

}

function get_samples () {
    return [Video("great"), Video("bad"), Video("greatness"),
                      Video("happiness"), Video("greatness awaits")];
}

exports["test filter_videos() include"] = {
    'test single inclusive filter(non-regex)': function (assert) {
        let filter = new Filter("", "greatness", false, true);
        let videos = get_samples();
        let result = filter_videos(videos, [filter]);
        let result_serialized = [result[0].map(get_title), result[1].map(get_title)];
        let expect = [["greatness", "greatness awaits"],
                      ["great", "bad", "happiness"]];
        assert.deepEqual(result_serialized, expect,
                         "single include applied properly (non-regex)");
    },
    'test single inclusive filter(regex)': function (assert) {
        let filter = new Filter("", "(^gr|^h)", true, true);
        let videos = get_samples();
        let result = filter_videos(videos, [filter]);
        let result_serialized = [result[0].map(get_title), result[1].map(get_title)];
        let expect = [["great", "greatness", "happiness", "greatness awaits"],
                      ["bad"]];
        assert.deepEqual(result_serialized, expect,
                         "single include applied properly (regex)");
    },
    'test multiple inclusive filters': function(assert) {
        let filter_a = new Filter("", "gr", false, true);
        let filter_b = new Filter("", "ness", false, true);
        let videos = get_samples();
        let result = filter_videos(videos, [filter_a, filter_b]);
        let result_serialized = [result[0].map(get_title), result[1].map(get_title)];
        let expect = [["greatness", "greatness awaits"],
                      ["bad", "happiness", "great"]];
        assert.deepEqual(result_serialized, expect,
                         "multiple includes applied properly");
    },
    'test single exclusive filter': function(assert) {
        let filter = new Filter("", "great", false, false);
        let videos = get_samples();
        let result = filter_videos(videos, [filter]);
        let result_serialized = [result[0].map(get_title), result[1].map(get_title)];
        let expect = [["bad",  "happiness"],
                      ["great", "greatness", "greatness awaits"]];
        assert.deepEqual(result_serialized, expect,
                         "single exlude applied properly");
    },
    'test multiple exclusive filters': function(assert) {
        let filter_a = new Filter("", "happiness", false, false);
        let filter_b = new Filter("", "great", false, false);
        let videos = get_samples();
        let result = filter_videos(videos, [filter_a, filter_b]);
        let result_serialized = [result[0].map(get_title), result[1].map(get_title)];
        let expect = [["bad"],
                      ["happiness", "great", "greatness", "greatness awaits"]];
        assert.deepEqual(result_serialized, expect,
                         "multiple exludes applied properly");
    }
};

require("sdk/test").run(exports);