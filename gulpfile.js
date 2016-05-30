const gulp = require("gulp");
const { current_xpi_path } = require("./selenium-tests/selenium_instance");
const path = require("path");
const { exec } = require('child_process');

gulp.task("default", ["copy-xpi"]);

gulp.task("build", function (cb) {
    exec("jpm xpi", {
        cwd: path.join(__dirname, "jetpack")
    }, cb);
});

gulp.task("copy-xpi", ["build"], function () {
    return gulp.src(current_xpi_path).pipe(gulp.dest("build/"));
});
