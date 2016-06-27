/*
This Source Code Form is subject to the terms of the
Mozilla Public License, v. 2.0.
If a copy of the MPL was not distributed with this file,
You can obtain one at http://mozilla.org/MPL/2.0/.
Author: XrXr
*/
const { nice_duration } = require("../lib/util");

exports["test nice_duration()"] = assert => {
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
    assert.strictEqual(nice_duration("7S"), "00:07");
    assert.strictEqual(nice_duration("32S"), "00:32");
    assert.strictEqual(nice_duration("7M"), "07:00");
    assert.strictEqual(nice_duration("77M"), "77:00");
    assert.strictEqual(nice_duration("7M2S"), "07:02");
    assert.strictEqual(nice_duration("7M12S"), "07:12");
    assert.strictEqual(nice_duration("27M12S"), "27:12");
    assert.strictEqual(nice_duration("27M2S"), "27:02");
    assert.strictEqual(nice_duration("PT1H"), "1:00:00");
    assert.strictEqual(nice_duration("PT1H51S"), "1:00:51");
};

require("sdk/test").run(exports);
