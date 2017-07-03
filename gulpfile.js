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
const main_pkg = require("./jetpack/package.json");

const main_path = join(__dirname, "jetpack");
const xpi_name = `${main_pkg.id}-${main_pkg.version}.xpi`;
const original_xpi_path = join(main_path, xpi_name);

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

function run_rollup(dest_path) {
    return rollup.rollup({
        entry: "./extension/src/main.js"
    })
    .then(function (bundle) {
        bundle.write({
            format: "iife",
            moduleName: "checkYoutube",
            dest: dest_path,
        });
        console.log("Build succeed");
    }, error => {
        console.error("Build failed:", error);
    })
    .then(() => {
        console.log('----');
    });
}

function copy_extension_except_src(dest_path) {
    return gulp.src(["./extension/**", "!./extension/{src,src/**}"])
        .pipe(gulp.dest(dest_path));
}

gulp.task("build", function (cb) {
    jpm("xpi", cb);
});

gulp.task("copy-xpi", ["build"], function () {
    return gulp.src(original_xpi_path).pipe(gulp.dest("build/"));
});

gulp.task("strip-dev-code", ["copy-xpi"], function () {
    const START_PRAGMA = "/*#BUILD_TIME_REPLACE_START*/";
    const END_PRAGMA = "/*#BUILD_TIME_REPLACE_END*/";
    let xpi = new JSZip();
    let file_name = path.basename(original_xpi_path);
    let zip = fs.readFileSync(join("build", file_name));
    let main = fs.readFileSync(join("jetpack", "lib", "main.js"), "utf8");
    return xpi.loadAsync(zip).then(xpi => {
        xpi.remove("lib/development.js");

        let head = main.slice(0, main.indexOf(START_PRAGMA));
        let tail = main.slice(main.indexOf(END_PRAGMA) + END_PRAGMA.length);

        let nl = "\n";
        xpi.file("lib/main.js", head + nl +
            "const init = actual_init;  // line put in by build tool" +
            nl + tail, "built with love");

        return xpi.generateNodeStream({
            compression: "DEFLATE",
            compressionOptions : { level:9 }
        }).pipe(source(file_name))
          .pipe(gulp.dest("build/"));
    });
});

gulp.task("default", ["strip-dev-code"]);

gulp.task("watch", [], () => {
    let build_output_dir = "./build/dev-build-output";
    let dev_build = () => {
        copy_extension_except_src(build_output_dir);
        run_rollup("./build/dev-build-output/main.bundle.js");
    };
    console.log("Outputting builds to " + path.resolve(build_output_dir));
    dev_build();
    return gulp.watch("extension/**/*", dev_build);
})

gulp.task("unit-tests", cb => {
    jpm("test", cb);
});

function run_tests(xpi_path, selenium_opt, cb) {
    const selenium_path = join(__dirname, "selenium-tests", "run.js");
    exec(`${process.execPath} ${selenium_path} ${selenium_opt} ${xpi_path}`, cb);
}

gulp.task("test-e2e", ["strip-dev-code"], cb => {
    run_tests(join("build", xpi_name), "--no-dev", cb);
});

gulp.task("test-migration", ["strip-dev-code"], cb => {
    run_tests(join("build", xpi_name), "--migration", cb);
});

gulp.task("test", ["strip-dev-code", "unit-tests", "test-e2e", "test-migration"]);

gulp.task("test-raw-e2e", ["build"], cb => {
    run_tests(original_xpi_path, "--", cb);
});

gulp.task("test-raw-migration", ["build"], cb => {
    run_tests(original_xpi_path, "--migration", cb);
});

gulp.task("test-raw", ["unit-tests", "test-raw-e2e", "test-raw-migration"]);
