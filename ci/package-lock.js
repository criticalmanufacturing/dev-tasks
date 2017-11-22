var fs = require("fs");
var path = require("path");
var gulpUtil = require("gulp-util");

/**
 * Constants
 */
PACKAGE_LOCK_FILENAME = "npm-shrinkwrap.json";

module.exports = function (gulpWrapper, ctx) {
    var gulp = gulpWrapper.gulp;

    /**
     * Process a package dependencies folder (node_modules)
     * @param {string} packagesPath Package dependencies path
     * @param {string} packageScope Package scope name (null if there's no scope)
     */
    function processPackages(packagesPath, packageScope) {
        // Iterate over all folder and process each one
        let folders = fs.readdirSync(packagesPath);
        // Process each folder
        folders = folders.map(function(folder) {
            const folderPath = path.join(packagesPath, folder);
            const stat = fs.lstatSync(folderPath);
            return {
                path: folderPath,
                isDirectory: stat.isDirectory(),
                isSymbolicLink: stat.isSymbolicLink()
            }
        });
        folders = folders.filter(folder => folder.isDirectory || folder.isSymbolicLink);

        const dependencies = {};
        folders.forEach(function(folder) {
            // Get package information
            const packageInfo = processPackage(folder.path, folder.isSymbolicLink, packageScope);
            if (packageInfo) {
                // At this point it can be a scoped package or not, depending on the "name" property
                if (packageInfo.name) {
                    dependencies[packageInfo.name] = packageInfo;
                    packageInfo.name = undefined; // remove this information, not included in the lock
                } else {
                    Object.assign(dependencies, packageInfo);
                }
            }
        });

        return Object.keys(dependencies).length > 0 ? dependencies : undefined;
    }

    /**
     * Process a package.
     * If there is no package.json, try to read the folder as a scoped package.
     * If this is a linked package, do not process its dependencies.
     * @param {string} packagePath Package path
     * @param {boolean} isLinkedPackage Indicates wether this package is linked or not
     */
    function processPackage(packagePath, isLinkedPackage) {
        // Compute paths needed
        const configPath = path.join(packagePath, "package.json");
        const packagesSubPackagesPath = path.join(packagePath, ctx.libsFolder);

        // If there is no config, this shouldn't be a node_module folder...
        if (!fs.existsSync(configPath)) {
            // Maybe this is a scoped package
            return processPackages(packagePath, path.basename(packagePath));
        }

        // Read the config
        let config;
        try {
            config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        } catch(err) {
            console.error(`Failed to read package.json file ${configPath}`, err);
            throw err;
        }
        
            
        const packageInfo = {
            name: config.name,
            version: config.version
        }

        // If there is a _from that is pointing to git or http, use it as version
        if ("_from" in config) {
            if (config["_from"].indexOf("://") >= 0) {
                packageInfo.version = config["_from"];
            }
        }

        // Check if this package has node_modules
        if (!isLinkedPackage) {
            if (fs.existsSync(packagesSubPackagesPath)) {
                packageInfo.dependencies = processPackages(packagesSubPackagesPath);
            }
        }

        return packageInfo;
    }

    /**
     * Parse the package-lock file and make all the changes necessary to lock the versions
     */
    gulp.task("__package-lock-generate", function(done) {
        // Read the package.json and package-lock.json files
        let packageConfig = JSON.parse(fs.readFileSync(path.join(ctx.baseDir, "package.json"), 'utf8'));

        const packageLock = {
            name: packageConfig.name,
            version: packageConfig.version,
            lockfileVersion: 1, // this is the package-lock.json definition
            dependencies: {}
        };

        packageLock.dependencies = processPackages(path.join(ctx.baseDir, ctx.libsFolder));

        const destinationFile = path.join(ctx.baseDir, PACKAGE_LOCK_FILENAME);
        fs.writeFile(destinationFile, JSON.stringify(packageLock).toString(), done);

        gulpUtil.log("Package lock generated:", gulpUtil.colors.green(destinationFile));
    });

    // Register task to check version
    gulp.task("generate-package-lock", function(done) {
        var tasks = [];

        // Check if there is package.json
        if (fs.existsSync(path.join(ctx.baseDir, "package.json"))) {
            tasks.push(
                "__package-lock-generate"
            );
        }

        gulpWrapper.seq(
            tasks,
            done
        );
    });
}
