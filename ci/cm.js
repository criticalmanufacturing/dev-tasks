var fs = require("fs");
var path = require("path");

var args = require("yargs").argv;

var execSync = require('child_process').execSync;
var shell = require('gulp-shell');
var gulpUtil = require("gulp-util");

module.exports = function (gulpWrapper, ctx) {
    var gulp = gulpWrapper.gulp;
    
    // Parse global parameters that need to be used by this plugin
    // used by tasks check-version and set-version
    var version = args.version;
	// used by task npm-dist-tag-copy-version
	var sourceTag = args.sourceTag;
	var targetTag = args.targetTag;
	// used by task npm-dist-tag-del
	var tag = args.tag;

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
	
	/**
     * Task: npm-dist-tags-versions
     * Gets an object containing the versions by dist-tags
     */
    function getNpmDistTagsVersions(packageName) {
		// return object {<dist-tag>: <version>}
		var rt = {};
		var temp;
		var distTags = execSync(`npm dist-tag ls ${packageName}`).toString().split("\n");
		
		// process result and extract versions
		for (let i = 0; i < distTags.length; i++) {
			temp = distTags[i].split(":");
			if (temp.length === 2) {
				rt[temp[0].trim()] = temp[1].trim();	
			}
		}
		return rt;
    };
	
	// Register task to add a given npm channel
    gulp.task("npm-dist-tag-add", function(done) {
        var tasks = [];

		// Check if there is package.json
        if (fs.existsSync(path.join(ctx.baseDir, "package.json"))) {
			// get package config
			var packageConfig = JSON.parse(fs.readFileSync(path.join(ctx.baseDir, "package.json"), 'utf8'));
			// Check that both version and tag were provided
			if (version != null && tag != null) {
				execSync(`npm dist-tag add ${packageConfig.name}@${version} ${tag}`);
				gulpUtil.log(
					gulpUtil.colors.grey("Added dist-tag"), gulpUtil.colors.green(`${tag}: ${version}`));
			} else {
				throw new Error("Must provide both --version and --tag");
			}
		}
		done();
    });
	
	// Register task to delete a given npm channel
    gulp.task("npm-dist-tag-rm", function(done) {
        var tasks = [];

		// Check if there is package.json
        if (fs.existsSync(path.join(ctx.baseDir, "package.json"))) {
			// get package config
			var packageConfig = JSON.parse(fs.readFileSync(path.join(ctx.baseDir, "package.json"), 'utf8'));
			// Check that tag was provided
			if (tag != null) {
				// get versions {<dist-tag>: <version>}
				var versions = getNpmDistTagsVersions(packageConfig.name);
				// Check if source tag exist in npm
				if (versions[tag] != null) {
					execSync(`npm dist-tag rm ${packageConfig.name} ${tag}`);
					gulpUtil.log(gulpUtil.colors.grey("Removed dist-tag"), gulpUtil.colors.green(`${tag}: ${versions[tag]}`));
				} else {
					gulpUtil.log(gulpUtil.colors.yellow(`Provided tag (${tag}) doesn't exist in package ${packageConfig.name}`));
				}
			} else {
				throw new Error("Must provide --tag");
			}
		}
		done();
    });
	
	// Register task to output the current npm channels
    gulp.task("npm-dist-tag-ls", function(done) {
        var tasks = [];

		// Check if there is package.json
        if (fs.existsSync(path.join(ctx.baseDir, "package.json"))) {
			// get package config
			var packageConfig = JSON.parse(fs.readFileSync(path.join(ctx.baseDir, "package.json"), 'utf8'));
			// get versions {<dist-tag>: <version>}
			var versions = getNpmDistTagsVersions(packageConfig.name);
			// Check if source tag exist in npm
			if (versions != null) {
				Object.keys(versions).forEach((key) => {
					gulpUtil.log(gulpUtil.colors.green(`${key}: ${versions[key]}`));
				});
			} else {
				gulpUtil.log(gulpUtil.colors.yellow(`No versions to display for package ${packageConfig.name}`));
			}
		}
		done();
    });
	
	// Register task to set version of a given npm channel based on another
    gulp.task("npm-dist-tag-copy-version", function(done) {
        var tasks = [];

		// Check if there is package.json
        if (fs.existsSync(path.join(ctx.baseDir, "package.json"))) {
			// get package config
			var packageConfig = JSON.parse(fs.readFileSync(path.join(ctx.baseDir, "package.json"), 'utf8'));
			// Check that both dist tags were provided
			if (sourceTag != null && targetTag != null) {
				// get versions {<dist-tag>: <version>}
				var versions = getNpmDistTagsVersions(packageConfig.name);
				// Check if source tag exist in npm
				if (versions[sourceTag] != null) {
					execSync(`npm dist-tag add ${packageConfig.name}@${versions[sourceTag]} ${targetTag}`);
					gulpUtil.log(
						gulpUtil.colors.grey("Copied from tag"), gulpUtil.colors.green(`${sourceTag}: ${versions[sourceTag]}`),
						gulpUtil.colors.grey("to tag"), gulpUtil.colors.blue(targetTag));
				} else {
					gulpUtil.log(gulpUtil.colors.yellow(`Provided source tag (${sourceTag}) doesn't exist in package ${packageConfig.name}`));
				}
			} else {
				throw new Error("Must provide both --sourceTag and --targetTag");
			}
		}
		done();
    });
}
