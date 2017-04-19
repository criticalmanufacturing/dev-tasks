
var fs = require("fs");
var path = require("path");
var pluginKarma = require('karma').Server;
var pluginYargs = require('yargs').argv;

module.exports = function (gulpWrapper, ctx) {
    
    var gulp = gulpWrapper.gulp;

    // #region Utility functions
    
    function getKarmaConfigObject()
    {
        var karmaConfigPath = undefined;
        if (fs.existsSync(ctx.baseDir + 'karma.conf.js')) {
            karmaConfigPath = path.join(ctx.baseDir, '/karma.conf.js');
        } else {
            // Karma specific config doesn't exist, use base
            karmaConfigPath = path.join(__dirname, '/base.karma.conf.js');
        }

        return require(karmaConfigPath);
    }

    // #endregion
    
    /**
     * Start Karma tests in development mode
     */
    gulp.task('test-unit', function (done) {
        
        var taskArray = [];
        if (pluginYargs.test) {
            taskArray.push('compile-typescript');
        }
         
        taskArray.push('test-unit-run');

        gulpWrapper.seq(taskArray, done);
    });
    
    gulp.task('test-unit-run', function (done) {
        var karmaConfig = getKarmaConfigObject();
        
		var server = new pluginKarma(karmaConfig, done);
		server.start();
    });
    
    /**
     * Start Karma tests in Build Mode
     */
    gulp.task('build-test-unit', function (done) {
        var karmaConfig = getKarmaConfigObject();
        
        // Override karma settings
        karmaConfig.singleRun = true;

        pluginKarma.start(karmaConfig, function () {
            done();
        });
    });
};