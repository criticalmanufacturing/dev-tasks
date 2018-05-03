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
    ctx["__CONSTANTS"] = __CONSTANTS;

    // Read some properties
    if(!("__verbose" in ctx)) {
        ctx["__verbose"] = pluginArgs.d || pluginArgs.debug || pluginArgs.verbose;
    }

	// Repository root is a context variable almost always unnecessary.
    // For that reason is here defined as a getter instead of directly calculating its
    if (!("__repositoryRoot" in ctx)) {
        Object.defineProperty(ctx, "__repositoryRoot", {
            configurable: true,
            enumerable: true,
            get: function(){
                return path.normalize(path.join(__dirname, "../../.."));
            }
        });
    }

    // Project name is a context variable costly to calculate but not always necessary.
    // For that reason is here defined as a getter instead of always getting the value
    Object.defineProperty(ctx, "__projectName", {
        configurable: true,
        enumerable: true,
        get: function(){
            var currentProjectPackageFile = utils.fs.tryGetJSONSync(path.normalize(path.join(ctx.__repositoryRoot, "./package.json")));
            return currentProjectPackageFile ? currentProjectPackageFile.name : "Custom";
        }
    });

    const cmfDevTasksConfig = require(path.join(ctx.__repositoryRoot, "./.dev-tasks.json"));
    ctx.__cmfDevTasksConfig = cmfDevTasksConfig;
    Object.defineProperty(cmfDevTasksConfig, "__npm", {
        configurable: true,
        enumerable: true,
        get: function(){
            return cmfDevTasksConfig.npm ? path.resolve(path.join(ctx.__repositoryRoot, cmfDevTasksConfig.npm)) : null;
        }
    });

    if (!ctx.packagePrefix) {
        try {
            ctx.packagePrefix = cmfDevTasksConfig.packagePrefix;
        } catch (error) {
            pluginUtil.log(pluginUtil.colors.yellow("Unable to find '.dev-tasks'. Continuing..."));
            ctx.packagePrefix = "cmf";
        }
    }

    ctx.isCustomized = ctx.packagePrefix !== "cmf";
    if (gulp == null) {return;}
	
    // Load metadata file
    ctx.metadataFileName = ctx.metadataFileName || ".cmf-dev-tasks.cmf";
    ctx.metadata = ctx.metadata || utils.fs.tryGetJSONSync(ctx.baseDir + '\\' + ctx.metadataFileName);

    // Register all build related tasks
    var buildTasksFunction = require('./build.js');
    buildTasksFunction(gulpWrapper, ctx);

    // Register all test related tasks
    require('./tests/test.js')(gulpWrapper, ctx);

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
            config: {
                karma: require('./tests/base.karma.conf.js')
            }
        }
    };
}
