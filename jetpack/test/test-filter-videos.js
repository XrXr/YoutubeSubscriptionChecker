const filters = require("../lib/core/filters");
const filter_videos = filters.filter_videos;

// this is a mock since "core/filters" doesn't export the constructor
function Filter (_, video_title_pattern, video_title_is_regex,
                 include_on_match, inspect_tags) {
    return {
        video_title_pattern,
        video_title_is_regex,
        include_on_match,
        inspect_tags
    };
}

function get_title (video) {
    return video.title.toLowerCase();
}

function Video (title, tags) {
    return {
        title: title,
        tags
    };

}

function get_samples () {
    return [Video("gReat"), Video("Bad"), Video("gReaTness"),
            Video("happIness"), Video("greatness Awaits")];
}

function serialize (result) {
    return [result[0].map(get_title), result[1].map(get_title)];
}

exports["test filter_videos() correctness"] = {
    'test single inclusive filter(non-regex)': assert => {
        let filter = Filter("", "greatness", false, true);
        let videos = get_samples();
        let result = filter_videos(videos, [filter]);
        let result_serialized = serialize(result);
        let expect = [["greatness", "greatness awaits"],
                      ["great", "bad", "happiness"]];
        assert.deepEqual(result_serialized, expect,
                         "single include applied properly (non-regex)");
    },
    'test single inclusive filter(regex)': assert => {
        let filter = Filter("", "(^gr|^h)", true, true);
        let videos = get_samples();
        let result = filter_videos(videos, [filter]);
        let result_serialized = serialize(result);
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
        let result_serialized = serialize(result);
        let expect = [["great", "greatness", "greatness awaits", "happiness"],
                      ["bad"]];
        assert.deepEqual(result_serialized, expect,
                         "multiple includes applied properly");
    },
    'test single exclusive filter': assert => {
        let filter = Filter("", "great", false, false);
        let videos = get_samples();
        const beforeLength = videos.length;
        let result = filter_videos(videos, [filter]);
        let result_serialized = serialize(result);
        let expect = [["bad",  "happiness"],
                      ["great", "greatness", "greatness awaits"]];
        assert.deepEqual(result_serialized, expect,
                         "single exlude applied properly");
        assert.equal(videos.length, beforeLength,
                         "original array not mutated");
    },
    'test including video tags': assert => {
        const filter = Filter("", "food", false, true, true);
        const videos = [Video("tagged", ["foOd", "cats"])];
        const result = filter_videos(videos, [filter]);
        let result_serialized = serialize(result);
        let expect = [["tagged"], []];
        assert.deepEqual(result_serialized, expect, "video tags are checked");
    },
    'test exclude video tags': assert => {
        const filter = Filter("", "food", false, false, true);
        const videos = get_samples()
            .concat([Video("tagged", ["food", "cats", "faze"])]);
        const result = filter_videos(videos, [filter]);
        let result_serialized = serialize(result);
        let expect = [
            ["great", "bad", "greatness", "happiness", "greatness awaits"],
            ["tagged"]
        ];
        assert.deepEqual(result_serialized, expect,
            "exclusive filter works with video tags");
    },
    'test multiple exclusive filters': assert => {
        let filter_a = Filter("", "happiness", false, false);
        let filter_b = Filter("", "great", false, false);
        let videos = get_samples();
        let result = filter_videos(videos, [filter_a, filter_b]);
        let result_serialized = serialize(result);
        let expect = [["bad"],
                      ["happiness", "great", "greatness", "greatness awaits"]];
        assert.deepEqual(result_serialized, expect,
                         "multiple excludes applied properly");
    },
    'test filter application order': assert => {
        let videos = get_samples();
        let result = filter_videos(videos, [Filter("", "ness", false, true),
                                            Filter("", "great", false, true),
                                            Filter("", "awaits", false, false),
                                            Filter("", "happ", false, false)]);
        let result_serialized = serialize(result);
        let expect = [["greatness", "great"],
                      ["bad", "greatness awaits", "happiness"]];
        assert.deepEqual(result_serialized, expect,
                         "filters applied in correct order");
    }
};

require("sdk/test").run(exports);
