var utils = require('./utils.js');
var __CONSTANTS = require('./context.json');
var pluginUtil = require('gulp-util');
var pluginArgs = require('yargs').argv;

// Override maximum numbers of Event Emitter listeners
require('events').EventEmitter.prototype._maxListeners = 100;
var path = require('path');
var pluginWebServer = require('gulp-webserver');
var pluginExec = require('child_process').exec;
var pluginExecSync = require('child_process').execSync;

module.exports = function (gulp, ctx) {
    var gulpWrapper = require('./gulp.wrappers.js')(gulp, ctx);

    // i18n Configuration
    if (!ctx.__i18n) {
        ctx.__i18n = {
            supportedCultures: ["en-US", "pt-PT", "vi-VN", "de-DE", "zh-CN", "zh-TW", "es-ES", "pl-PL", "sv-SE", "fr-FR"],
            startupCulture: "en-US",
            startupCultureSuffix: "default" // This represents the file suffix that is used during development and needs to be renamed to the default language code
        };
    }

    ctx["__CONSTANTS"] = __CONSTANTS;

    // Read some properties
    if (!("__verbose" in ctx)) {
        ctx["__verbose"] = pluginArgs.d || pluginArgs.debug || pluginArgs.verbose;
    }

    // Repository root is a context variable almost always unnecessary.
    // For that reason is here defined as a getter instead of directly calculating its
    if (!("__repositoryRoot" in ctx)) {
        Object.defineProperty(ctx, "__repositoryRoot", {
            configurable: true,
            enumerable: true,
            get: function () {
                return path.normalize(path.join(__dirname, "../../.."));
            }
        });
    }

    // Project name is a context variable costly to calculate but not always necessary.
    // For that reason is here defined as a getter instead of always getting the value
    Object.defineProperty(ctx, "__projectName", {
        configurable: true,
        enumerable: true,
        get: function () {
            var currentProjectPackageFile = utils.fs.tryGetJSONSync(path.normalize(path.join(ctx.__repositoryRoot, "./package.json")));
            return currentProjectPackageFile ? currentProjectPackageFile.name : "Custom";
        }
    });

    // Configuration file
    if (!ctx.__config) {
        // Load the file from the system
        var configFilePath = path.join(ctx.__repositoryRoot, '.dev-tasks.json');
        try {
            ctx.__config = require(configFilePath);
        } catch (error) {
            pluginUtil.log(pluginUtil.colors.yellow("Unable to find '.dev-tasks'. Continuing..."));
            ctx.__config = {};
        }
    }

    Object.defineProperty(ctx.__config, "__npm", {
        configurable: true,
        enumerable: true,
        get: function () {
            return ctx.__config.npm ? path.resolve(path.join(ctx.__repositoryRoot, ctx.__config.npm)) : null;
        }
    });

    // Package prefix
    if (!ctx.packagePrefix) {
        ctx.packagePrefix = ctx.__config.packagePrefix || "cmf";
    }

    ctx.isCustomized = ctx.packagePrefix !== "cmf.core" && ctx.packagePrefix !== "cmf.mes";
    if (gulp == null) { return; }

    // Load metadata file
    ctx.metadataFileName = ctx.metadataFileName || ".cmf-dev-tasks.cmf";
    ctx.metadata = ctx.metadata || utils.fs.tryGetJSONSync(ctx.baseDir + '\\' + ctx.metadataFileName);

    // Register all build related tasks
    var buildTasksFunction = require('./build.js');
    buildTasksFunction(gulpWrapper, ctx);

    // Register all tasks related with Package Management
    require('./install/package.management.js')(gulpWrapper, ctx);

    // Register all tasks related with CI
    require('./ci/index.js')(gulpWrapper, ctx);

    /**
      * List top level tasks
      */
    gulpWrapper.gulp.task('tasks', function () { console.log(Object.keys(gulp.tasks).filter(function (item) { return item.indexOf('>') < 0; })); });

    return {
        gulp: gulpWrapper.gulp,
        plugins: {
            seq: gulpWrapper.seq,
            exec: pluginExec,
            build: buildTasksFunction.plugins,
            webserver: pluginWebServer,
            yargs: require('yargs'),
            gulpWrapper: gulpWrapper
        },
        tasks: {
            build: buildTasksFunction,
            web: require('./web.main.js')
        },
        tests: {

        }
    };
}
