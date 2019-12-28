/*
This Source Code Form is subject to the terms of the
Mozilla Public License, v. 2.0.
If a copy of the MPL was not distributed with this file,
You can obtain one at http://mozilla.org/MPL/2.0/.
Author: XrXr
*/
const source = require("vinyl-source-stream");
const gulp = require("gulp");
const rollup = require("rollup");
const JSZip = require("jszip");
const fs = require("fs");
const path = require("path"),
      join = path.join;
const { exec } = require('child_process');
const extManifest = require("./extension/manifest.json");

let xpiName = `${extManifest.name}-${extManifest.version}`
    .toLowerCase()
    .replace(/\s/g, '-') + '.xpi';

const finalTreeDir = projectPath("build/tmp-final-tree/");
const tmpMainJsPath = projectPath("build/tmp-ext-src/main.js");
const mainJsPath = projectPath("extension/src/main.js");

function projectPath(relativePath) {
    return path.join(__dirname, relativePath);
}

function lsAllFilesUnder(dir) {
    let results = []
    let list = fs.readdirSync(dir)
    list.forEach(function(file) {
        file = path.join(dir, file);
        let stat = fs.statSync(file)
        if (stat && stat.isDirectory()) {
            results = results.concat(lsAllFilesUnder(file));
        } else {
            results.push(file);
        }
    })
    return results;
}

function copyExtAssets () {
    return gulp.src(["./extension/**", "!./extension/{src,src/**}"])
        .pipe(gulp.dest(finalTreeDir));
}

function furnishTempSrc () {
    return gulp.src(["./extension/src/**/*"])
        .pipe(gulp.dest(projectPath("build/tmp-ext-src")));
}

function stripDevCode (cb) {
    const START_PRAGMA = "/*#BUILD_TIME_REPLACE_START*/";
    const END_PRAGMA = "/*#BUILD_TIME_REPLACE_END*/";
    let main = fs.readFileSync(mainJsPath, { encoding: 'utf8' });
    let start = main.indexOf(START_PRAGMA);
    let end = main.indexOf(END_PRAGMA);
    if (start === -1 || end === -1) {
        return;
    }
    let initLine = "const init = actual_init;  // from build tool";
    let processedBundle = main.substring(0, start) + initLine +
        main.substring(end + END_PRAGMA.length);

    fs.writeFile(tmpMainJsPath, processedBundle, { encoding: 'utf8' }, cb);
}

function rollupTask() {
    return rollup.rollup({
        input: tmpMainJsPath
    })
    .then(function (bundle) {
        return bundle.write({
            format: "iife",
            name: "checkYoutube",
            file: path.join(finalTreeDir, "main.bundle.js"),
            sourcemap: true,
        });
    });
}

function buildXpi() {
    let xpi = new JSZip();
    let webExtensionFiles = lsAllFilesUnder(finalTreeDir);
    for (let filePath of webExtensionFiles) {
        let stream = fs.createReadStream(filePath);
        let path_within_xpi = filePath.replace(finalTreeDir, "");
        xpi.file(path_within_xpi, stream);
    }

    let compressStream = xpi.generateNodeStream({
        compression: "DEFLATE",
        compressionOptions: { level: 9 }
    })
    let writeStream = fs.createWriteStream(projectPath(path.join("build", xpiName)));
    compressStream.pipe(writeStream);
    return writeStream;
}

let webExtDevTree = gulp.series(copyExtAssets, furnishTempSrc, rollupTask);
let webExtReleaseTree = gulp.series(copyExtAssets, furnishTempSrc, stripDevCode, rollupTask);
let watchTaskDependency = webExtReleaseTree;
if (process.env["CHECKER_DEV"]) {
    watchTaskDependency = webExtDevTree;
}

function watch () {
    console.log("Built to " + path.resolve(finalTreeDir));
    return gulp.watch("extension/**/*", watchTaskDependency);
}

exports.webExtXpi = gulp.series(webExtReleaseTree, buildXpi);
exports.watch = gulp.series(watchTaskDependency, watch);
exports.default = exports.webExtXpi;
