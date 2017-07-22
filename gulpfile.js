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
const jetpack_packgejson = require("./jetpack/package.json");

const main_path = project_path("jetpack");
const xpi_name = `${jetpack_packgejson.name}.xpi`;
const original_xpi_path = join(main_path, xpi_name);

const build_output_dir = project_path("build/dev-build-output");

function jpm(command, cb) {
    let base = "jpm";
    if (process.env.FIREFOX_PATH) {
        base += " -b " + process.env.FIREFOX_PATH;
    }

    let child = exec(`${base} ${command}`, {
        cwd: main_path
    }, cb);

    child.stdout.pipe(process.stdout);
    child.stderr.pipe(process.stderr);
}

function copy_extension_except_src(dest_path) {
    return gulp.src(["./extension/**", "!./extension/{src,src/**}"])
        .pipe(gulp.dest(dest_path));
}

function project_path(relative_path) {
    return path.join(__dirname, relative_path);
}

gulp.task("build-jetpack", function (cb) {
    jpm("xpi", cb);
});

gulp.task("copy-xpi", ["build-jetpack"], function () {
    return gulp.src(original_xpi_path).pipe(gulp.dest("build/"));
});

gulp.task("jetpack-release", ["copy-xpi", "web-ext-dev-build"], function () {
    const START_PRAGMA = "/*#BUILD_TIME_REPLACE_START*/";
    const END_PRAGMA = "/*#BUILD_TIME_REPLACE_END*/";
    let xpi = new JSZip();
    let file_name = path.basename(original_xpi_path);
    let zip = fs.readFileSync(join("build", file_name));
    let main = fs.readFileSync(join("jetpack", "lib", "main.js"), "utf8");
    return xpi.loadAsync(zip).then(xpi => {

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
    // return results.map(file_path => path.join(dir, file_path));
    return results;
}

    let web_extension_files = ls_all_files_under(build_output_dir);
    for (let file_path of web_extension_files) {
        let stream = fs.createReadStream(file_path);
        let path_within_xpi = path.join("webextension", file_path.replace(build_output_dir, ""));
        xpi.file(path_within_xpi, stream);
    }

        return xpi.generateNodeStream({
            compression: "DEFLATE",
            compressionOptions : { level:9 }
        }).pipe(source(file_name))
          .pipe(gulp.dest(project_path("build/")));
    });
});

gulp.task("default", ["jetpack-release"]);

gulp.task("web-ext-dev-build", function () {
    copy_extension_except_src(build_output_dir);
    return rollup.rollup({
        entry: project_path("extension/src/main.js")
    })
    .then(function (bundle) {
        bundle.write({
            format: "iife",
            moduleName: "checkYoutube",
            dest: project_path("build/dev-build-output/main.bundle.js"),
        });
    });
});

gulp.task("watch", ["web-ext-dev-build"], () => {
    console.log("Built to " + path.resolve(build_output_dir));
    return gulp.watch("extension/**/*", ["web-ext-dev-build"]);
})

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
