var fs = require("fs");
var path = require("path");
var pluginDel = require("del");
var gulpUtil = require("gulp-util");
var rename = require("gulp-rename");

module.exports = function (gulpWrapper, ctx) {
    var gulp = gulpWrapper.gulp;

    /**
     * Object of linked packages.
     * Property key: package name
     * Property value: package version
     */
    var linkedPackages = {};

    /**
     * Get all packages that are linked.
     * Search the tree for linked packages.
     * @param {object} packageConfig package.json content
     */
    function getLinkedPackages(packageConfig) {
        const packages = {};
        if (packageConfig.cmfLinkDependencies) {
            for (packageName in packageConfig.cmfLinkDependencies) {
                if (packageName in linkedPackages === false) {
                    // This package wasn't processed yet
                    // Must add and search

                    // Read and save
                    const configPath = path.join(ctx.baseDir, ctx.libsFolder, packageName, "package.json");
                    if (fs.existsSync(configPath)) {
                        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
                        packages[packageName] = config.version;
    
                        // Search
                        Object.assign(packages, getLinkedPackages(config));
                    }
                }
            }
        }

        return packages;
    }

    /**
     * Gets the version of a package.
     * If the package is linked, just returns the previous value.
     * If no version change is needed, returns the previous version.
     * @param {string} packageName Package name
     * @param {object} packageConfig package.json content
     * @param {string} currentVersion Current package version
     */
    function getPackageVersion(packageName, currentVersion) {
        if (packageName in linkedPackages) {
            // This is a link, must read from its package.json
            return linkedPackages[packageName];
        }

        return currentVersion;
    }

    /**
     * Process a dependency node.
     * Removes the "resolved" property.
     * Changes the version of itself and requires to match the linked ones if needed.
     * Process its dependencies.
     * @param {string} packageName Package name
     * @param {object} packageNode A dependency node
     */
    function processPackageLockNode(packageName, packageNode) {
        // Remove resolved information
        packageNode.resolved = undefined;

        // Get its version
        packageNode.version = getPackageVersion(packageName, packageNode.version);

        // If there are requires, also check all of them
        if (packageNode.requires != null) {
            for(const packageName in packageNode.requires) {
                if (typeof packageNode.requires[packageName] === "string") {
                    packageNode.requires[packageName] = getPackageVersion(packageName, packageNode.requires[packageName]);
                }
            }
        }

        // Process all dependencies
        if (packageNode.dependencies != null) {
            packageNode.dependencies = processPackageNodeDependencies(packageNode.dependencies);
        }

        return packageNode;
    }

    /**
     * Process a list of dependencies
     * @param {object} packageDependencies List of dependencies. Each object property is a package
     */
    function processPackageNodeDependencies(packageDependencies) {
        // Each property is a package
        for(const packageName in packageDependencies) {
            packageDependencies[packageName] = processPackageLockNode(packageName, packageDependencies[packageName]);
        }

        return packageDependencies;
    }
    
    /**
     * Backup the package-lock file to use if something fails
     */
    gulp.task("__package-lock-backup", function() {
        return gulp
            .src("package-lock.json")
            .pipe(rename("package-lock_backup.json"))
            .pipe(gulp.dest("."));
    });

    /**
     * Removes the backup package-lock file
     */
    gulp.task("__package-lock-backup-delete", function() {
        return pluginDel("package-lock_backup.json", {force: true});
    });

    /**
     * Parse the package-lock file and make all the changes necessary to lock the versions
     */
    gulp.task("__package-lock-parser", function(done) {
        // Read the package.json and package-lock.json files
        let packageConfig = JSON.parse(fs.readFileSync(path.join(ctx.baseDir, "package.json"), 'utf8'));
        let packageLockConfig = JSON.parse(fs.readFileSync(path.join(ctx.baseDir, "package-lock.json"), 'utf8'));

        linkedPackages = getLinkedPackages(packageConfig);

        packageLockConfig.dependencies = processPackageNodeDependencies(packageLockConfig.dependencies);

        fs.writeFile(path.join(ctx.baseDir, "package-lock.json"), JSON.stringify(packageLockConfig).toString(), done);
    });

    // Register task to check version
    gulp.task("ci:package-lock", function(done) {
        var tasks = [];

        // Check if there is package.json
        if (fs.existsSync(path.join(ctx.baseDir, "package.json")) && fs.existsSync(path.join(ctx.baseDir, "package-lock.json"))) {
            tasks.push("__package-lock-backup", "__package-lock-parser", "__package-lock-backup-delete");
        }

        gulpWrapper.seq(
            tasks,
            done
        );
    });
}
