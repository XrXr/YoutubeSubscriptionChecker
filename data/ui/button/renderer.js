/*
This Source Code Form is subject to the terms of the
Mozilla Public License, v. 2.0.
If a copy of the MPL was not distributed with this file,
You can obtain one at http://mozilla.org/MPL/2.0/.
Author: XrXr
*/
self.port.on("draw", draw);

function draw (number) {
    var length = String(number).length;
    // change the svg content
    var svg32 = document.getElementById('32x32');
    var svg64 = document.getElementById('64x64');
    var text_node = svg32.querySelector("text");
    text_node.textContent = number + "";

    text_node = svg64.querySelector("text");
    text_node.textContent = number + "";
    // start drawing
    var canvas_32 = document.getElementById("32c");
    var canvas_64 = document.getElementById("64c");
    Promise.all([draw_in_canvas(canvas_32, svg32),
                 draw_in_canvas(canvas_64, svg64)]).
        then(function(uris) {
            self.port.emit("icons", {"32":uris[0], "64":uris[1]}, number);
        });
}

function draw_in_canvas (canvas_node, svg_node) {
    var ctx = canvas_node.getContext('2d');
    // clear the canvas first
    ctx.clearRect(0, 0, canvas_node.width, canvas_node.height);

    var data = svg_node.outerHTML;

    var img = new Image();
    var svg_blob = new Blob([data], {type: 'image/svg+xml;charset=utf-8'});
    var url = window.URL.createObjectURL(svg_blob);
    img.src = url;

    return new Promise(function(resolve) {
        img.onload = function () {
          ctx.drawImage(img, 0, 0);
          window.URL.revokeObjectURL(url);
          resolve(canvas_node.toDataURL());
        };
    });
}