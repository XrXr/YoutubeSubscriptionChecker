const nice_duration = require("main").nice_duration;

exports["test nice_duration()"] = function(assert) {
    assert.strictEqual(nice_duration("5H11M11S"), "5:11:11");
    assert.strictEqual(nice_duration("5H1M1S"), "5:01:01");
    assert.strictEqual(nice_duration("5H11M1S"), "5:11:01");
    assert.strictEqual(nice_duration("5H1M11S"), "5:01:11");
    assert.strictEqual(nice_duration("5H01M01S"), "5:01:01");
    assert.strictEqual(nice_duration("15H11M11S"), "15:11:11");
    assert.strictEqual(nice_duration("05H11M11S"), "05:11:11");
    assert.strictEqual(nice_duration("5H0M0S"), "5:00:00");
    assert.strictEqual(nice_duration("5H1M0S"), "5:01:00");
    assert.strictEqual(nice_duration("5H0M1S"), "5:00:01");
    assert.strictEqual(nice_duration("32S"), "00:32");
    assert.strictEqual(nice_duration("7S"), "00:07");
};

require("sdk/test").run(exports);