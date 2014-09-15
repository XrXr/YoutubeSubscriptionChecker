const filters = require("core/filters");
const filter_videos = filters.filter_videos;

// this is a mock since "core/filters" doesn't export the constructor
function Filter (_, video_title_pattern, video_title_is_regex,
                 include_on_match) {
    return {
        video_title_pattern : video_title_pattern,
        video_title_is_regex: video_title_is_regex,
        include_on_match: include_on_match
    };
}

function get_title (Video) {
    return Video.snippet.title.toLowerCase();
}

function Video (title) {
    return {
        snippet: {
            title: title
        }
    };

}

function get_samples () {
    return [Video("gReat"), Video("Bad"), Video("gReaTness"),
                      Video("happIness"), Video("greatness Awaits")];
}

exports["test filter_videos() include"] = {
    'test single inclusive filter(non-regex)': assert => {
        let filter = Filter("", "greatness", false, true);
        let videos = get_samples();
        let result = filter_videos(videos, [filter]);
        let result_serialized = [result[0].map(get_title), result[1].map(get_title)];
        let expect = [["greatness", "greatness awaits"],
                      ["great", "bad", "happiness"]];
        assert.deepEqual(result_serialized, expect,
                         "single include applied properly (non-regex)");
    },
    'test single inclusive filter(regex)': assert => {
        let filter = Filter("", "(^gr|^h)", true, true);
        let videos = get_samples();
        let result = filter_videos(videos, [filter]);
        let result_serialized = [result[0].map(get_title), result[1].map(get_title)];
        let expect = [["great", "greatness", "happiness", "greatness awaits"],
                      ["bad"]];
        assert.deepEqual(result_serialized, expect,
                         "single include applied properly (regex)");
    },
    'test multiple inclusive filters': assert => {
        let filter_a = Filter("", "gr", false, true);
        let filter_b = Filter("", "ness", false, true);
        let videos = get_samples();
        let result = filter_videos(videos, [filter_a, filter_b]);
        let result_serialized = [result[0].map(get_title), result[1].map(get_title)];
        let expect = [["greatness", "greatness awaits"],
                      ["bad", "happiness", "great"]];
        assert.deepEqual(result_serialized, expect,
                         "multiple includes applied properly");
    },
    'test single exclusive filter': assert => {
        let filter = Filter("", "great", false, false);
        let videos = get_samples();
        let result = filter_videos(videos, [filter]);
        let result_serialized = [result[0].map(get_title), result[1].map(get_title)];
        let expect = [["bad",  "happiness"],
                      ["great", "greatness", "greatness awaits"]];
        assert.deepEqual(result_serialized, expect,
                         "single exlude applied properly");
    },
    'test multiple exclusive filters': assert => {
        let filter_a = Filter("", "happiness", false, false);
        let filter_b = Filter("", "great", false, false);
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