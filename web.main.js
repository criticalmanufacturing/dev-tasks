var pluginWebServer = require('gulp-webserver');
var pluginYargs = require('yargs').argv;
var pluginDel = require('del');
var pluginShell = require('gulp-shell');
var pluginCallback = require("gulp-callback");
var fs = require("fs");
var fsExtra = require("fs-extra");
var nodePath = require("path");
var uuid = require('uuid');
var utils = require('./utils.js');
var concat = require('gulp-concat');
var sysBuilder = require('systemjs-builder');
var minify = require('gulp-minify');
var cleanCss = require('gulp-clean-css');
const path = require('path');
var pluginUtil = require('gulp-util');
var zlib = require('zlib');

// Default batch size of parallel files to compress
const BROTLI_PARALLEL_FILES_DEFAULT = 200;

module.exports = function (gulpWrapper, ctx) {


    var bundlePath = ctx.bundlePath ? ctx.bundlePath : "bundles";

    if (bundlePath[0] !== "/") {
        bundlePath = "/" + bundlePath;
    }

    if (bundlePath[bundlePath.length - 1] !== "/") {
        bundlePath = bundlePath + "/";
    }

    var gulp = gulpWrapper.gulp;
    var pluginRunSequence = gulpWrapper.seq;
    var typescriptCompilerPath = utils.dependencies.lookupNodeModule("typescript") + "/bin/tsc";
    var getDirectories = function (path, startsWith) {
        try {
            var directory = fs.readdirSync(path);
            return directory.filter(function (file) {
                return fs.statSync(path + '/' + file).isDirectory() && file.startsWith(startsWith);
            });

        } catch (e) {
            return [];
        }
    };
    function isFile(path) {
        var result = true;
        try {
            fs.accessSync(path, fs.F_OK);
        } catch (e) {
            result = false;
        }
        return result;
    }
    function setPathsDynamic(paths, baseDir) {
        if (paths && paths.length > 0) {
            paths.forEach(function (part, index, array) {
                array[index] = `${baseDir}${array[index]}`;
            });
        }
        return paths;
    }

    /**
     * Create bundles as was configured in gulp file
     */
    gulp.task('_bundle-app', function (cb) {
        if (pluginYargs.production === true) {
            const ctxPackages = ctx.availablePackages || [];
            ctx.bundleBuilderConfigFiles = ctx.bundleBuilderConfigFiles || [];

            if (ctx.isBundleBuilderOn === true && ctx.isMetadataBundlerOn === true) {
                const ctxPackagesBundleConfig = {
                    bundlesConfiguration: [{
                        bundleName: "cmf.metadata.js",
                        bundlePaths: ctxPackages.map((package) => `${ctx.libsFolder}${package}/src/${package}.metadata-debug.js`)
                    }]
                };

                const metadataBundleConfig = ctx.bundleBuilderConfigFiles.find((bundleBuilderConfigFile) =>
                    bundleBuilderConfigFile.bundleName === "cmf.metadata.js");

                if (metadataBundleConfig != null) {
                    if (metadataBundleConfig.bundleConfigs == null) {
                        metadataBundleConfig.bundleConfigs = [];
                    }
                    metadataBundleConfig.bundleConfigs.push(ctxPackagesBundleConfig);
                } else {
                    ctx.bundleBuilderConfigFiles.push({
                        bundleName: "cmf.metadata.js",
                        bundleConfigs: [ctxPackagesBundleConfig],
                        bundleMinify: true
                    });
                }
            }

            if (ctx.isBundleBuilderOn === true && ctx.isi18nBundlerOn === true) {
                ctx.__i18n.supportedCultures.forEach((culture) => {
                    const ctxi18nBundleConfig = {
                        bundlesConfiguration: [{
                            bundleName: `cmf.main.${culture}.js`,
                            bundlePaths: ctxPackages.map((package) => `${ctx.libsFolder}${package}/src/i18n/main.${culture}.bundle-debug.js`)
                        }]
                    };

                    const i18nBundleConfig = ctx.bundleBuilderConfigFiles.find((bundleBuilderConfigFile) =>
                        bundleBuilderConfigFile.bundleName === `cmf.main.${culture}.js`);

                    if (i18nBundleConfig != null) {
                        if (i18nBundleConfig.bundleConfigs == null) {
                            i18nBundleConfig.bundleConfigs = [];
                        }
                        i18nBundleConfig.bundleConfigs.push(ctxi18nBundleConfig);
                    } else {
                        ctx.bundleBuilderConfigFiles.push({
                            bundleName: `cmf.main.${culture}.js`,
                            bundleConfigs: [ctxi18nBundleConfig],
                            bundleMinify: true
                        });
                    }
                });
            }
        }

        var promises = [];

        if (ctx.isBundleBuilderOn === true && ctx.bundleBuilderConfigFiles && ctx.bundleBuilderConfigFiles.length > 0) {
            var sysBuilderDefaultDir = `apps/${ctx.packageName}`;
            var sysBuilderBaseDir = process.cwd().includes(ctx.packageName) ? '' : sysBuilderDefaultDir;
            var builder;

            if (ctx.bundleBuilderInitialConfig) {
                builder = new sysBuilder(sysBuilderBaseDir, ctx.baseDir + ctx.bundleBuilderInitialConfig);
            }

            ctx.bundleBuilderConfigFiles.forEach(bundleElement => {
                var fileExtension = bundleElement.bundleName.split('.').pop().toLowerCase();
                var toMinify = bundleElement.bundleMinify === undefined ? true : bundleElement.bundleMinify;
                if (bundleElement.bundleConfigs && bundleElement.bundleConfigs.length > 0) {
                    // Concatenate files expressions
                    var currentExpressions = [];
                    var paths = [];

                    bundleElement.bundleConfigs.forEach(config => {
                        var buConfig = typeof config === 'string' ? require(ctx.baseDir + config) : config;

                        if (buConfig && buConfig.bundlesConfiguration && buConfig.bundlesConfiguration.length > 0) {
                            var bundleConfig = buConfig.bundlesConfiguration.find(obj => obj.bundleName == bundleElement.bundleName);
                            if (bundleConfig && bundleConfig.bundleExpressions && bundleConfig.bundleExpressions.length > 0) {
                                currentExpressions.push(bundleConfig.bundleExpressions);
                            }
                            if (bundleConfig && bundleConfig.bundlePaths && bundleConfig.bundlePaths.length > 0) {
                                paths = paths.concat(bundleConfig.bundlePaths);
                            }
                        }
                    });

                    if (builder == null && currentExpressions.length > 0) {
                        pluginUtil.log(pluginUtil.colors.yellow(`Skiping bundle file '${bundleElement.bundleName}' because 'bundleBuilderInitialConfig' is not defined in the current context.`));
                        return;
                    }

                    paths = setPathsDynamic(paths, ctx.baseDir);

                    // JS Files
                    if (fileExtension && fileExtension.endsWith('js')) {
                        if (currentExpressions && currentExpressions.length > 0) {
                            builder.bundle(currentExpressions.join(' + ').toString(), `${ctx.baseDir}${bundlePath}${fileExtension}/${bundleElement.bundleName}`
                                , { minify: toMinify, sourceMaps: false });
                        }
                        if (paths && paths.length > 0) {

                            if (toMinify) {
                                promises.push(new Promise(function (resolve, reject) {
                                    gulp.src(paths)
                                        .pipe(concat(bundleElement.bundleName))
                                        .pipe(minify({
                                            ext: {
                                                min: '.js'
                                            },
                                            noSource: true
                                        }))
                                        .pipe(gulp.dest(`${ctx.baseDir}${bundlePath}${fileExtension}`))
                                        .on('error', reject)
                                        .on('end', resolve);
                                }));

                            }
                            else {
                                promises.push(new Promise(function (resolve, reject) {
                                    gulp.src(paths)
                                        .pipe(concat(bundleElement.bundleName))
                                        .pipe(gulp.dest(`${ctx.baseDir}${bundlePath}${fileExtension}`))
                                        .on('error', reject)
                                        .on('end', resolve);
                                }));
                            }
                        }
                    }
                    // CSS Files
                    if (fileExtension && fileExtension.endsWith('css')) {
                        if (toMinify) {
                            promises.push(new Promise(function (resolve, reject) {
                                gulp.src(paths)
                                    .pipe(concat(bundleElement.bundleName))
                                    .pipe(cleanCss({ inline: ['none'], level: 2 }))
                                    .pipe(gulp.dest(`${ctx.baseDir}${bundlePath}${fileExtension}`))
                                    .on('error', reject)
                                    .on('end', resolve);
                            }));
                        }
                        else {
                            promises.push(new Promise(function (resolve, reject) {
                                gulp.src(paths)
                                    .pipe(concat(bundleElement.bundleName))
                                    .pipe(gulp.dest(`${ctx.baseDir}${bundlePath}${fileExtension}`))
                                    .on('error', reject)
                                    .on('end', resolve);
                            }));
                        }
                    }
                }
            });
        }

        // Copy Assets
        if (ctx.isBundleBuilderOn &&
            ctx.bundleBuilderAssetsConfig && ctx.bundleBuilderAssetsConfig.length > 0) {

            ctx.bundleBuilderAssetsConfig.forEach(bundleElement => {
                if (bundleElement.bundleConfigs && bundleElement.bundleConfigs.length > 0) {
                    // Collect paths
                    var paths = [];
                    bundleElement.bundleConfigs.forEach(file => {
                        var buConfig = require(ctx.baseDir + file);
                        if (buConfig && buConfig.bundlesConfiguration && buConfig.bundlesConfiguration.length > 0) {
                            var bundleConfig = buConfig.bundlesConfiguration.find(obj => obj.bundleAssetsTask == bundleElement.bundleAssetsTask);
                            if (bundleConfig && bundleConfig.bundlePaths && bundleConfig.bundlePaths.length > 0) {
                                paths = paths.concat(bundleConfig.bundlePaths)
                            }
                        }
                    });
                    paths = setPathsDynamic(paths, ctx.baseDir);
                    return gulp.src(paths)
                        .pipe(gulp.dest(`${ctx.baseDir}/${bundleElement.bundleDestPath}`));
                }
            });
        }

        Promise.all(promises).then(function() {
            cb();
        });
    });

    /**
     * Compile typescript files
     */
    gulp.task('build', function (cb) {
        var tasks = ['_build'];
        if (ctx.isBundleBuilderOn && ctx.isBundleBuilderOn === true) {
            tasks = tasks.concat(['_bundle-app']);
            if (pluginYargs.production) {
                if (pluginYargs.brotli === true)
                    tasks = tasks.concat([`_brotli`]);
            }
            else if (pluginYargs.brotli === true || pluginYargs.parallelBrotli) {
                pluginUtil.log(pluginUtil.colors.red('Brotli compression is only allowed when building in production mode (use --production). Continuing without compression...'));
            }
        }
        return pluginRunSequence(tasks, cb);
    });
    /**
     * Internal Task to Compile typescript files
     */
    gulp.task('_build', function (cb) {
        return gulp.src('').pipe(pluginShell('\"' + process.execPath + '\" ' + typescriptCompilerPath, { cwd: ctx.baseDir }));
    });

    /**
     * Brotli compress task
     */

    /**
     * Recursive function to traverse file directories with a depth limit of symlink directories to traverse. If the path does not exist returns an empty array.
     * @param {string} dir - Directory to recursively traverse
     * @param {Array.<RegExp>} includeRegex - Regex expressions to match files
     * @param {Array.<RegExp>} excludeRegex - Regex expressions to exclude files
     * @param {Number} symlinkMaxDepth - Maximum depth of symlink directories allowed to traverse (to avoid infinite loops)
     * @param {Number} symlinkDepth - Current depth of symlink directories already traversed
     * @returns {Array.<string>} - Array containing the paths of the matched files. Empty array if path does not exist or no files are matched.
     */
    function getFiles(dir, includeRegex, excludeRegex, symlinkMaxDepth, symlinkDepth=0) {
        if (!fs.existsSync(dir) || !fs.lstatSync(dir).isDirectory())
            return [];
        const dirContents = fs.readdirSync(dir, { withFileTypes: true });
        const files = dirContents.reduce((files, dirContent) => {
            const res = path.resolve(dir, dirContent.name);
            if (dirContent.isSymbolicLink()) {
                if (symlinkDepth < symlinkMaxDepth) {
                    return files.concat(getFiles(res, includeRegex, excludeRegex, symlinkMaxDepth, symlinkDepth + 1));
                }
            }
            else {
                if (dirContent.isDirectory()) {
                    return files.concat(getFiles(res, includeRegex, excludeRegex, symlinkMaxDepth, symlinkDepth));
                }
                else {
                    if (!excludeRegex.some((r) => r.test(res)) && includeRegex.some((r) => r.test(res))) {
                        files.push(res);
                    }
                }
            }
            return files;
        }, []);
        return Array.prototype.concat(...files);
    }

    /**
     * Uses brotli to compress the given file and saves it with ".br" in the same directory
     * @param {string} filepath - Path to the file to compress
     */
    function compressFile(filepath) {
        const fileContents = fs.readFileSync(filepath);
        let compressedFile = zlib.brotliCompressSync(fileContents, {
            params: {
                [zlib.constants.BROTLI_PARAM_QUALITY]: zlib.constants.BROTLI_MAX_QUALITY,
            }
        });
        fs.writeFileSync(filepath + '.br', compressedFile);
    }

    gulp.task('_brotli', function (cb) {
        let excludes = ['.*-debug\.js$', 'gulpfile\.js', 'package\.json', 'npm-shrinkwrap\.json', 'npm.postinstall\.js', 'npm.preinstall\.js', '.*\.br$']
        let includes = ['.*\.js$', '.*\.json$', '.*\.svg$', '.*\.css$', '.*\.xml$', '.*\.csv$', '.*\.txt$']
        const excludeRegex = excludes.map((r) => new RegExp(r));
        const includeRegex = includes.map((r) => new RegExp(r));
        
        let parallelBrotliFiles = BROTLI_PARALLEL_FILES_DEFAULT;
        if (pluginYargs.parallelBrotli) {
            if(pluginYargs.parallelBrotli === 0) {
                pluginUtil.log(pluginUtil.colors.yellow(`Parallel brotli flag requires explicit number of concurrent compressing files!\nDefaulting to compress ${parallelBrotliFiles} files using brotli in parallel`));
            } else {
                parallelBrotliFiles = Number.isInteger(pluginYargs.parallelBrotli) ? pluginYargs.parallelBrotli : BROTLI_PARALLEL_FILES_DEFAULT;
                pluginUtil.log(pluginUtil.colors.yellow(`Compressing ${parallelBrotliFiles} files using brotli in parallel`));
            }
        }        

        let bundlesFiles = getFiles(path.join(ctx.baseDir, 'bundles'), includeRegex, excludeRegex, 1);
        let nodeFiles = getFiles(path.join(ctx.baseDir, 'node_modules'), includeRegex, excludeRegex, 1);
        
        let compressedFilesCount = 0;
        let parallelCompressFiles = (filepaths) => {
            if (filepaths.length === 0)
                return;
            // compress a batch of <parallelBrotliFiles> files in parallel (batches are sequential)
            Promise.all(filepaths.splice(0, parallelBrotliFiles).map(filepath => compressFile(filepath)))
                .then((_) => {
                    // If there are more files to compress, make recursive call
                    // Otherwise, call callback to indicate task completion
                    if (filepaths.length > 0) {
                        compressedFilesCount += parallelBrotliFiles;
                        // Print a message every 10 completed batches
                        if ((compressedFilesCount / parallelBrotliFiles) % 10 === 0)
                            pluginUtil.log(`Brotli compress: ${filepaths.length} files remaining...`);
                        return parallelCompressFiles(filepaths);
                    }
                    else {
                        cb();
                    }
                });
        }
        
        parallelCompressFiles(bundlesFiles.concat(nodeFiles));
    });

    gulp.task('deploy', function (cb) {
        var deployPath = pluginYargs.path ? pluginYargs.path : process.env.BUILD_ARTIFACTSTAGINGDIRECTORY;
        var moduleName = pluginYargs.moduleName;

        if (moduleName) {
            deployPath += path.sep + moduleName;
        }

        var tempFileName = ctx.baseDir + uuid.v4() + ".zip";

        // We need to update the app's package.json to clear all cmfLinkDependencies as in customization projects we wouldn't need these links
        var packageJSONObject = fsExtra.readJsonSync(ctx.baseDir + "package.json");
        packageJSONObject.cmfLinkDependencies = {};
        fsExtra.writeJsonSync(ctx.baseDir + "package.json", packageJSONObject);

        if (!fs.existsSync(deployPath)) {
            fs.mkdirSync(deployPath);
        } else {
            var pathToDelete = deployPath + path.sep + "**";
            console.log("Deleting path " + pathToDelete);
            pluginDel.sync([pathToDelete, "!" + deployPath], { force: true });
        }

        var zipProgram = process.platform === "win32" ? "C:\\Program Files\\7-Zip\\7z" : "7z";
        var linksFlag = process.platform === "win32" ? "" : " -l";
        var includePath = path.join(__dirname, "deploy", "web.deploy.include.txt");
        var excludePath = path.join(__dirname, "deploy", "web.deploy.exclude.txt");

        gulp
            .src('')
            .pipe(pluginShell("\"" + zipProgram + "\" a "
                + tempFileName +
                ' -x!node_modules/**/node_modules' +
                ' -ir@"' + includePath + '"' +
                ' -xr@"' + excludePath + '"' +
                linksFlag, { cwd: ctx.baseDir }))
            .pipe(pluginShell("\"" + zipProgram + "\" x "
                + tempFileName +
                ' -o' + deployPath + " -y", { cwd: ctx.baseDir })).pipe(pluginCallback(function () {
                    pluginDel([tempFileName], cb);
                }));

    });

    gulp.task('deploy-setup', function (cb) {
        var deployPath = pluginYargs.path ? pluginYargs.path : process.env.BUILD_ARTIFACTSTAGINGDIRECTORY;
        var tokensFile = pluginYargs.appFileName ? pluginYargs.appFileName : "config.setup.json";
        var moduleName = pluginYargs.moduleName;

        if (moduleName) {
            deployPath += path.sep + moduleName + ".zip";
        }

        // Change name
        pluginDel.sync(["config.json"]);
        fs.renameSync(tokensFile, "config.json");

        var zipProgram = process.platform === "win32" ? "C:\\Program Files\\7-Zip\\7z" : "7z";
        var linksFlag = process.platform === "win32" ? "" : " -l";
        var includePath = path.join(__dirname, "deploy", "web.deploy.include.txt");
        var excludePath = path.join(__dirname, "deploy", "web.deploy.exclude.txt");

        return gulp
            .src('')
            .pipe(pluginShell(
                "\"" + zipProgram + "\" a "
                + deployPath +
                ' -ir@"' + includePath + '"' +
                ' -xr@"' + excludePath + '"' +
                linksFlag
                , { cwd: ctx.baseDir }));
    });

    /**
    * Clean all libs
    */
    gulp.task('clean-libs', function (cb) {
        pluginDel([ctx.baseDir + ctx.libsFolder + '**/*'], cb);
    });


    /**
     * Start application
     */
    gulp.task('start', function (cb) {
        pluginYargs.open = true;
        if (pluginYargs.production) {
            pluginYargs.port = ctx.defaultPort + 1;
            pluginRunSequence(['start-bundle-mode'], cb);

        } else {
            pluginYargs.port = ctx.defaultPort;
            pluginRunSequence(['start-dev-mode'], cb);
        }
    });

    gulp.task('start-dev-mode', function () {
        var __currentCulture = "en-US";

        if (pluginYargs.port === undefined) {

            pluginYargs.port = ctx.defaultPort;
            pluginYargs.open = true;
        }

        // Writes a repsonse with status OK 200
        function writeOK(res, content) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.write(content);
            res.end();
        }

        // We set the Core solution as the root for the app which already has the linkage 
        // to all the "src" module folders         
        var rootDir = ctx.baseDir;
        var stream = gulp.src(rootDir)
            .pipe(pluginWebServer({
                host: '0.0.0.0',
                port: pluginYargs.port,
                livereload: false,
                directoryListing: false,
                open: pluginYargs.open ? `http://localhost:${pluginYargs.port}/` : false,
                middleware: function (req, res, next) {
                    var url = req.url.split("?").shift();

                    if (req.method == 'GET' && url.match(/^.+\.[^\/]+$/gmi) == null) {
                        // This is a fallback. We request the initial index.html and we inject a global that will the app know it is in dev-mode, by default the application runs in bundle-mode
                        var indexContent = fs.readFileSync(ctx.baseDir + 'index.html').toString();
                        indexContent = indexContent.replace(new RegExp("<head>"), function (match) {
                            return match + "<script>__CMFInternal__DevMode=true;</script>";
                        });
                        firstRequest = false;
                        res.writeHead(200, { 'Content-Type': 'text/html' });
                        res.write(indexContent);
                        res.end();
                    } else if (req.method == 'GET') {

                        // Check if the static resource exists and provide a 404 when it doesn't. We need to strip any query parameter, like the CMFCacheId
                        if (!isFile(ctx.baseDir + req.url.split("?").shift())) {
                            res.statusCode = 404;
                            res.write("No static resource found.");
                            return res.end();
                        } else if (url.endsWith("metadata.js")) {

                            var urlArray = url.split("/");
                            if (urlArray[urlArray.length - 1] !== "metadata.js") {
                                // Let's check which module we are searching
                                var metadataFileName = urlArray[urlArray.length - 1];
                                var moduleName = metadataFileName.replace(".metadata.js", "");
                                // Get the proper metadata file
                                var metadataContent = fs.readFileSync(ctx.baseDir + "node_modules/" + moduleName + "/src/" + metadataFileName).toString();
                                var bundlerFoldersObj = { "components": [], "directives": [], "pipes": [], "widgets": [], "dataSources": [], "converters": [] };
                                for (var bundleName in bundlerFoldersObj) {
                                    // There has to be a better way
                                    metadataContent = metadataContent.replace(new RegExp(bundleName + "\: \[[\\s\\S]*?\],"), function (match) {
                                        bundlerFoldersObj[bundleName] = utils.fs.getDirectories(ctx.baseDir + "node_modules/" + moduleName + "/src/" + bundleName);
                                        return bundleName + ": [" +
                                            bundlerFoldersObj[bundleName].map(function (entry) { return "'" + entry + "'" }) + "],";
                                    });
                                };
                                // After all bundle folders are processed, then we can move to the i18n resources which may be available in all bundle folders
                                var partiali18nContent = "";
                                var isFirst = true;
                                for (var bundleName in bundlerFoldersObj) {
                                    bundlerFoldersObj[bundleName].forEach(function (folder) {
                                        var i18nFolder = bundleName + "/" + folder + "/i18n/";
                                        if (utils.fs.isDirectory(ctx.baseDir + "node_modules/" + moduleName + "/src/" + i18nFolder)) {
                                            partiali18nContent += ((isFirst) ? "" : ",") + "'" + i18nFolder + folder + ".default'";
                                            isFirst = false;
                                        }
                                    });
                                };
                                if (partiali18nContent !== "") {
                                    metadataContent = metadataContent.replace(new RegExp("i18n\: \[[\\s\\S]*?\],"), function (match) {
                                        return "i18n: [" + partiali18nContent + "],";
                                    });
                                }
                                // Also de metadata file normally asks for the module's main i18n resource by using the "./i18n/main.default". We need to replace this dependency with "cmf.core.shell/src/i18n/i18n"
                                metadataContent = metadataContent.replace("./i18n/main.default", moduleName + "/src/i18n/main.default");
                                writeOK(res, metadataContent);
                            } else {
                                next();
                            }
                        } else {
                            next();
                        }
                    } else {
                        next();
                    }
                }

            }));
    });

    gulp.task('start-bundle-mode', function () {

        if (pluginYargs.port === undefined) {
            pluginYargs.port = 8001;
            pluginYargs.open = true;
        }

        //var webserver = require('gulp-webserver');
        var stream = gulp.src(ctx.baseDir)
            .pipe(pluginWebServer({
                host: '0.0.0.0',
                port: pluginYargs.port,
                livereload: false,
                directoryListing: false,
                open: pluginYargs.open,
                fallback: 'index.html'
            }));
    });
};
