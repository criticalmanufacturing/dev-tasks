var fs = require("fs");
var path = require("path");

var args = require("yargs").argv;

var shell = require('gulp-shell');
var gulpUtil = require("gulp-util");

module.exports = function (gulpWrapper, ctx) {
    var gulp = gulpWrapper.gulp;
    
    // Parse global parameters that need to be used by this plugin
    // Read parameters
    var version = args.version;

    /**
     * Task: check-version
     * Checks current package version.
     */
    gulp.task("__check-version", function(done) {

        var packageConfig = JSON.parse(fs.readFileSync(path.join(ctx.baseDir, "package.json"), 'utf8'));

        gulpUtil.log(gulpUtil.colors.grey("Version:"), gulpUtil.colors.green(packageConfig.version));

        done();
    });


    // Register task to set version
    gulp.task("set-version", function(done) {
        var tasks = [];

        // Check if there is package.json
        if (fs.existsSync(path.join(ctx.baseDir, "package.json"))) {
            if (version) {
                tasks.push("__bump-version");
            } else {
                throw new Error("Must provide --version with value to set");
            }
        }

        gulpWrapper.seq(
            tasks,
            done
        );
    });

    // Register task to check version
    gulp.task("check-version", function(done) {
        var tasks = [];

        // Check if there is package.json
        if (fs.existsSync(path.join(ctx.baseDir, "package.json"))) {
            tasks.push("__check-version");
        }

        gulpWrapper.seq(
            tasks,
            done
        );
    });
}
