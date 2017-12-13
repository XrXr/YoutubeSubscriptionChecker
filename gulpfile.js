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
const ext_manifest = require("./extension/manifest.json");

let xpi_name = `${ext_manifest.name}-${ext_manifest.version}`
    .toLowerCase()
    .replace(/\s/g, '-') + '.xpi';

const build_output_dir = project_path("build/dev-build-output");
const final_tree_dir = project_path("build/tmp-final-tree/");
const tmp_mainjs_path = project_path("build/tmp-ext-src/main.js");

function project_path(relative_path) {
    return path.join(__dirname, relative_path);
}

function ls_all_files_under(dir) {
    let results = []
    let list = fs.readdirSync(dir)
    list.forEach(function(file) {
        file = path.join(dir, file);
        let stat = fs.statSync(file)
        if (stat && stat.isDirectory()) {
            results = results.concat(ls_all_files_under(file));
        } else {
            results.push(file);
        }
    })
    return results;
}

gulp.task("copy-ext-assets", function () {
    return gulp.src(["./extension/**", "!./extension/{src,src/**}"])
        .pipe(gulp.dest(final_tree_dir));
});

gulp.task("furnish-temp-src", ["copy-ext-assets"], function () {
    return gulp.src(["./extension/src/**/*"])
        .pipe(gulp.dest(project_path("build/tmp-ext-src")));
});

gulp.task("strip-dev-code", ["furnish-temp-src"], function () {
    const START_PRAGMA = "/*#BUILD_TIME_REPLACE_START*/";
    const END_PRAGMA = "/*#BUILD_TIME_REPLACE_END*/";
    let main = fs.readFileSync(mainjs_path, { encoding: 'utf8' });
    let start = main.indexOf(START_PRAGMA);
    let end = main.indexOf(END_PRAGMA);
    if (start === -1 || end === -1) {
        return;
    }
    let init_line = "const init = actual_init;  // from build tool";
    let processed_bundle = main.substring(0, start) + init_line +
        main.substring(end + END_PRAGMA.length);

    fs.writeFileSync(tmp_mainjs_path, processed_bundle, { encoding: 'utf8' });
});

function rollup_task() {
    return rollup.rollup({
        entry: tmp_mainjs_path
    })
    .then(function (bundle) {
        return bundle.write({
            format: "iife",
            moduleName: "checkYoutube",
            dest: path.join(final_tree_dir, "main.bundle.js"),
        });
    }, err => console.log(err));
}

const mainjs_path = project_path("extension/src/main.js");
gulp.task("web-ext-dev-tree", ["furnish-temp-src"], rollup_task);
gulp.task("web-ext-release-tree", ["strip-dev-code"], rollup_task);
gulp.task("web-ext-xpi", ["web-ext-release-tree"], function () {
    let xpi = new JSZip();
    let web_extension_files = ls_all_files_under(final_tree_dir);
    for (let file_path of web_extension_files) {
        let stream = fs.createReadStream(file_path);
        let path_within_xpi = file_path.replace(final_tree_dir, "");
        xpi.file(path_within_xpi, stream);
    }

    return xpi.generateNodeStream({
        compression: "DEFLATE",
        compressionOptions : { level:9 }
    }).pipe(source(xpi_name))
      .pipe(gulp.dest(project_path("build/")));
});


let watch_task_dependency = ["web-ext-release-tree"];
if (process.env["CHECKER_DEV"]) {
    watch_task_dependency = ["web-ext-dev-tree"];
}

gulp.task("watch", watch_task_dependency, () => {
    console.log("Built to " + path.resolve(final_tree_dir));
    return gulp.watch("extension/**/*", watch_task_dependency);
})

gulp.task("default", ["web-ext-xpi"]);

gulp.task("unit-tests", cb => {
    jpm("test", cb);
});

function run_tests(xpi_path, selenium_opt, cb) {
    const selenium_path = join(__dirname, "selenium-tests", "run.js");
    exec(`${process.execPath} ${selenium_path} ${selenium_opt} ${xpi_path}`, cb);
}

gulp.task("test-e2e", ["jetpack-release"], cb => {
    run_tests(join("build", xpi_name), "--no-dev", cb);
});

gulp.task("test-migration", ["jetpack-release"], cb => {
    run_tests(join("build", xpi_name), "--migration", cb);
});

gulp.task("test", ["jetpack-release", "unit-tests", "test-e2e", "test-migration"]);

gulp.task("test-raw-e2e", ["build"], cb => {
    run_tests(original_xpi_path, "--", cb);
});

gulp.task("test-raw-migration", ["build"], cb => {
    run_tests(original_xpi_path, "--migration", cb);
});

gulp.task("test-raw", ["unit-tests", "test-raw-e2e", "test-raw-migration"]);
