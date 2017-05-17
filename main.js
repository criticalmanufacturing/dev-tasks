var utils = require('./utils.js');
var __CONSTANTS = require('./context.json');
var cmfDevTasksConfig = require('../../.cmf.dev.tasks.json');

// Override maximum numbers of Event Emitter listeners
require('events').EventEmitter.prototype._maxListeners = 100;
var path = require('path');
var pluginWebServer = require('gulp-webserver');
var pluginExec = require('child_process').exec;
var pluginExecSync = require('child_process').execSync;

module.exports = function (gulp, ctx) {
    var gulpWrapper = require('./gulp.wrappers.js')(gulp, ctx);
    ctx["__CONSTANTS"] = __CONSTANTS;

	// Repository root is a context variable almost always unnecessary.
    // For that reason is here defined as a getter instead of directly calculating its
    Object.defineProperty(ctx, "__repositoryRoot", {
        configurable: false,
        enumerable: true,
        get: function(){
            return path.normalize(path.join(__dirname, "../.."));
        }
    });

    // Project name is a context variable costly to calculate but not always necessary.
    // For that reason is here defined as a getter instead of always getting the value
    Object.defineProperty(ctx, "__projectName", {
        configurable: false,
        enumerable: true,
        get: function(){
            var currentProjectPackageFile = utils.fs.tryGetJSONSync(path.normalize(path.join(ctx.__repositoryRoot, "./package.json")));
            return currentProjectPackageFile ? currentProjectPackageFile.name : "Custom";
        }
    });

    // Please do not comment remove the next line as it will be used by the scaffolding process to set the repository prefix
    ctx.packagePrefix = cmfDevTasksConfig.packagePrefix || "cmf";
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
