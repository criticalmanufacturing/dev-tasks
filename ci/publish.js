var fs = require("fs");
var path = require("path");

var args = require("yargs").argv;

var shell = require('gulp-shell');
var gulpUtil = require("gulp-util");

module.exports = function (gulpWrapper, ctx) {
    var gulp = gulpWrapper.gulp;
    
    // Parse global parameters that need to be used by this plugin
    // Read parameters
    var tag = args.tag || "latest";
    var version = args.version;
    var appendVersion = args.append;

    /**
     * Task: bump-version
     * Upgrades current package version.
     * If --append is defined, just appends given version to current version
     */
    gulp.task("__bump-version", function() {
        var targetVersion = version;

        var packageConfig = JSON.parse(fs.readFileSync(path.join(ctx.baseDir, "package.json"), 'utf8'));

        if (appendVersion) {
            // read the current version
            // and then append given version to the current
            targetVersion = `${packageConfig.version}-${version}`
        } else {
            targetVersion = version
        }
        
        gulpUtil.log(gulpUtil.colors.blue(packageConfig.version), gulpUtil.colors.grey("->"), gulpUtil.colors.green(targetVersion));

        return gulp
            .src("package.json", {cwd: ctx.baseDir})
            .pipe(shell(`${ctx.__cmfDevTasksConfig && ctx.__cmfDevTasksConfig.__npm ? ctx.__cmfDevTasksConfig.__npm : 'npm'} version ${targetVersion} --no-git-tag-version --scripts-prepend-node-path=true`, {cwd: ctx.baseDir, verbose: true}));
    });

    /**
     * Task: publish
     * Publish current package to the NPM registry.
     * It uses given TAG (default to latest).
     */
    gulp.task("__publish", function() {
        gulpUtil.log(`Publishing ${ctx.baseDir} with tag '${tag}'`);

        return gulp
            .src("package.json", {cwd: ctx.baseDir})
            .pipe(shell(`${ctx.__cmfDevTasksConfig && ctx.__cmfDevTasksConfig.__npm ? ctx.__cmfDevTasksConfig.__npm : 'npm'} publish --tag=${tag} --git-tag-version=false --scripts-prepend-node-path=true`, {cwd: ctx.baseDir, verbose: true}));
    });


    // Register task for publish
    gulp.task("ci:publish", function(done) {
        var tasks = [];

        // Check if there is package.json
        if (fs.existsSync(path.join(ctx.baseDir, "package.json"))) {
            if (version) {
                tasks.push("__bump-version");
            }
            
            // Also make sure the package-lock is updates
            tasks.push("generate-package-lock");

            // Finally, publish!
            tasks.push("__publish");
        }

        gulpUtil.log(`Processing ${ctx.baseDir}`);

        gulpWrapper.seq(
            tasks,
            done
        );
    });

    // Provide "ci:publish" task as "publish" task
    gulp.task("publish", ["ci:publish"]);
}
