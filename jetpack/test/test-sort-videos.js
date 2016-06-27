/*
This Source Code Form is subject to the terms of the
Mozilla Public License, v. 2.0.
If a copy of the MPL was not distributed with this file,
You can obtain one at http://mozilla.org/MPL/2.0/.
Author: XrXr
*/
const { sort_videos } = require("../lib/util");

function V(channel_id, pub) {
    return {
        channel_id,
        published_at: pub
    };
}

exports["test video sort"] = {
    "test empty"(assert) {
        let empty = [];
        assert.deepEqual(sort_videos(empty), empty);
    },
    "test single"(assert) {
        let single = [V("1", 0)];
        assert.deepEqual(sort_videos(single), single);
    },
    "test multiple"(assert) {
        const A = V.bind(null, "1");
        const B = V.bind(null, "2");
        const C = V.bind(null, "3");
        let l = [B(4), A(2), B(9), C(4), A(6), A(8), C(2), A(3), B(1), C(7)];
        assert.deepEqual(sort_videos(l), [B(9), B(4), B(1),
                                          A(8), A(6), A(3), A(2),
                                          C(7), C(4), C(2)]);
    }
};

require("sdk/test").run(exports);
