
var path = require("path");

var myBasePath = process.cwd() + "\\";

var karmaTestFiles1 = "test/unit/**/*.js";
var karmaTestFiles2 = "test/unit/*.js";


var cmfDevTasksBasePath = path.join(__dirname, '/..').replace(/\//g, '/');

var globalFiles = [
	'libs/bluebird/js/browser/bluebird.js',
	'libs/jquery/dist/jquery.js',
	'node_modules/cmf.dev.tasks/node_modules/jasmine-jquery/lib/jasmine-jquery.js',
	'libs/underscore/underscore.js',
	'libs/traceur/traceur.js',
	'libs/es6-module-loader/dist/es6-module-loader.js',
	'libs/es6-promise/promise.js',
	"libs/eventemitter2/lib/eventemitter2.js",
	"libs/moment/moment.js",
	'node_modules/cmf.dev.tasks/tests/base.constants.js',
	'libs/dexie/dist/latest/Dexie.js',
	'libs/decimal.js/decimal.js'
];

var meta = {};
	
var otherFiles = globalFiles.map(function(item){
	
	if(item.indexOf("jquery") > 0)
	{
		
	}else if(item.indexOf("angular") > 0){
		//meta[item] = {format: "register"};
	}else{
		meta[item] = {format: "global"};
	}
	
	
	return { pattern: myBasePath + item, included: true, served: true, watched: true }
});

/**
 * Base Karma Configuration
 * NOTE: this should not be used directly.
 */
module.exports = {
    
    // base path that will be used to resolve all patterns (eg. files, exclude)
    basePath: process.cwd().replace(/\//g, '/'),
    
    
	plugins: [
        'karma-systemjs'
        , 'karma-chrome-launcher'
		, 'karma-ie-launcher'
		, 'karma-jasmine-ajax'
        , 'karma-jasmine'
        , 'karma-coverage'
    ],
	
    // frameworks to use
    // available frameworks: https://npmjs.org/browse/keyword/karma-adapter
    frameworks: [
	    'systemjs',
		'jasmine-ajax',
        'jasmine'
    ],
    
    // list of files / patterns to load in the browser
    files: [karmaTestFiles1, karmaTestFiles2],
	
    // list of files to exclude
    exclude: [
    ],
    
    
    // preprocess matching files before serving them to the browser
    // available preprocessors: https://npmjs.org/browse/keyword/karma-preprocessor
    preprocessors: {
        //'src/**/*.js': ['coverage'] // Coverage is curently not working due to es6 issues.
    },
    
    
    // test results reporter to use
    // possible values: 'dots', 'progress'
    // available reporters: https://npmjs.org/browse/keyword/karma-reporter
    reporters: ['progress', 'coverage'],
    
    systemjs: {
        config: {
            baseURL: "/",
			defaultJSExtensions: true,
            paths: {
				'systemjs': 'libs/system.js/dist/system.src.js',
                'es6-module-loader': 'libs/es6-module-loader/dist/es6-module-loader.js',
				'system-polyfills': 'libs/system.js/dist/system-polyfills.js',
                'traceur': 'libs/traceur/traceur.js',
				'jquery': 'libs/jquery/dist/jquery.js',
				
				// Angular 2  Core
				'angular2/*': 'libs/cmf-angular2/testlib.angular2.js',
				'angular2/angular2': "libs/cmf-angular2/testlib.angular2.js",
				
				// Angular 2 Router
				'angular2/router/*': 'libs/cmf-angular2/testlib.router.js',
				'angular2/router': "libs/cmf-angular2/testlib.router.js",
				
				// CMF Dependencies
                'cmf.taura': 'libs/cmf-taura/cmf.taura.js',
                'cmf.core': 'libs/cmf-core/cmf.core.js',
				'cmf.core.multicast.client': 'libs/cmf-core-multicast-client/cmf.core.multicast.client.js'
            },
			meta: meta
        },
		serveFiles: [
			{ pattern: myBasePath + 'src/*.js', included: false, served: true, watched: true },
			{ pattern: myBasePath + 'src/**/*.js', included: false, served: true, watched: true },
			// Load all mocks
			{ pattern: myBasePath + 'test/mocks/**/*.json', included: false, served: true, watched: true }
		
		],
		includeFiles: [
			{ pattern: myBasePath + 'libs/bluebird/js/browser/bluebird.js', included: true, served: true, watched: false },
			{ pattern: myBasePath + 'libs/jquery/dist/jquery.js', included: true, served: true, watched: true },
			{ pattern: myBasePath + 'node_modules/cmf.dev.tasks/node_modules/jasmine-jquery/lib/jasmine-jquery.js', included: true, served: true, watched: false },
			{ pattern: myBasePath + 'libs/underscore/underscore.js', included: true, served: true, watched: false },
			{ pattern: myBasePath + 'libs/traceur/traceur.js', included: true, served: true, watched: false },
			{ pattern: myBasePath + 'libs/es6-module-loader/dist/es6-module-loader.js', included: true, served: true, watched: false },
			{ pattern: myBasePath + 'libs/system.js/dist/system.src.js', included: true, served: true, watched: false },
			{ pattern: myBasePath + 'node_modules/cmf.dev.tasks/tests/base.constants.js', included: true, served: true, watched: false },
			{ pattern: myBasePath + "libs/eventemitter2/lib/eventemitter2.js", included: true, served: true, watched: false },

			{ pattern: myBasePath + "libs/moment/moment.js", included: true, served: true, watched: false },
			{ pattern: myBasePath + 'libs/dexie/dist/latest/Dexie.js', included: true, served: true, watched: false },
			{ pattern: myBasePath + 'libs/decimal.js/decimal.js', included: true, served: true, watched: false },
			

			{ pattern: myBasePath + "libs/cmf-angular2/testlib.angular2.js", included: true, served: true, watched: false },
			{ pattern: myBasePath + "libs/cmf-angular2/testlib.router.js", included: true, served: true, watched: false },
			
			// Load all cmf dependencies
			{ pattern: myBasePath + 'libs/cmf-?(*)/!(?*.metadata|angular2|router).js', included: true, served: true, watched: true },
			
			//, { pattern: 'C:/TFS/NavigoGUI/CoreHTML/src/cmf.core/' + karmaTestFiles1, served: true, included: false, watched: true}
			//, { pattern: 'C:/TFS/NavigoGUI/CoreHTML/src/cmf.core/' + karmaTestFiles2, served: true, included: false, watched: true}
			
		]
    },
    
    // optionally, configure the reporter
    coverageReporter: {
        type : 'html',
        dir : 'reports/coverage/'
    },
    
    // web server port
    port: 9876,
    
    
    // enable / disable colors in the output (reporters and logs)
    colors: true,
    
    
    // level of logging
    // possible values: config.LOG_DISABLE || config.LOG_ERROR || config.LOG_WARN || config.LOG_INFO || config.LOG_DEBUG
    logLevel: 'debug',
    
    
    // enable / disable watching file and executing tests whenever any file changes
    autoWatch: true,
    
    restartOnFileChange: true,
	
    // start these browsers
    // available browser launchers: https://npmjs.org/browse/keyword/karma-launcher
    browsers: ['Chrome'],//, 'IE'],
    
	browserNoActivityTimeout: 500000,
    
    // Continuous Integration mode
    // if true, Karma captures browsers, runs the tests and exits
    singleRun: false
};