var path = require('path');
var util = require('util');
var ncp = require('ncp').ncp;
var fs = require("fs");
 
var __cwd = path.resolve('.'); //where the process was launched from
var __tasksdir = __dirname; //where the tools are placed
//general task dependency plugins
var pluginDel = require('del');
var pluginTypescript = require('gulp-typescript');
var pluginReplace = require('gulp-replace-task');
var pluginRunSequence = require('run-sequence');
var pluginShell = require('gulp-shell');
var pluginRename = require('gulp-rename');
var pluginCallback = require("gulp-callback");
var pluginYargs = require('yargs').argv;
var pluginConcat = require('gulp-concat');
var pluginAutoPrefixer = require('gulp-autoprefixer');
var pluginMinify = require('gulp-minify');
var spawn = require('child_process').spawn;
var pluginIf = require('gulp-if');
var pluginWalker = require('async-walker');
var pluginUtil = require('gulp-util');
var pluginI18nTransform = require('@criticalmanufacturing/dev-i18n-transform').gulp;
var pluginTslint = require("gulp-tslint");

//module specific plugins
var pluginLess = require('gulp-less');
var pluginInject = require('gulp-inject');

var componentPathRegExp = /.*\/?components\/([^\/\\]+)\/([^_].*)\.(.*)/;
var directivePathRegExp = /.*\/?directives\/([^\/\\]+)\/([^_].*)\.(.*)/;
var pipePathRegExp = /.*\/?pipes\/([^\/\\]+)\/([^_].*)\.(.*)/;
var widgetPathRegExp = /.*\/?widgets\/([^\/\\]+)\/([^_].*)\.(.*)/;
var dataSourcePathRegExp = /.*\/?dataSources\/([^\/\\]+)\/([^_].*)\.(.*)/;
var converterPathRegExp = /.*\/?converters\/([^\/\\]+)\/([^_].*)\.(.*)/;
var foldersToInspect = ["components", "directives", "pipes", "widgets", "dataSources", "converters"];
var i18nPathRegExp = /.*\/?i18n\/([^_].*)\.(.*)/;
var excludeNodeModulesRegExp = { match: new RegExp("System\\.register\\(\"node_modules\/[\\s\\S]*?System\\.register\\(\"src\\/", "g"), replacement: function (match) { return 'System.register("src/'; } };
var excludeNodeModulesDepRegExp = { match: new RegExp("node_modules\/", 'g'), replacement: "" };

var i18n = {
    supportedCultures: ["en-US", "pt-PT", "vi-VN"],
    startupCulture: "en-US",
    startupCultureSuffix: "default" // This represents the file suffix that is used during development and needs to be renamed to the default language code
}

if (!String.prototype.startsWith) {
    String.prototype.startsWith = function(searchString, position){
      position = position || 0;
      return this.substr(position, searchString.length) === searchString;
  };
}

module.exports = function (gulpWrapper, ctx) {

    var gulp = gulpWrapper.gulp;
    ctx.baseDir = ctx.baseDir.replace(/\\/g, '/');
    ctx.deployFolder = ctx.deployFolder || ctx.sourceFolder;
    var isCustomizedProject = (ctx.packagePrefix !== "cmf");
    if (isCustomizedProject === true) {
        var customizationFolderName = path.join(__dirname, "../../../").replace(/\\/g, '/').split('/');
        customizationFolderName.pop(); // Will pop the last /       
        customizationFolderName = customizationFolderName.pop();                
    }

    var typescriptCompilerPath = path.join(ctx.__repositoryRoot, '/node_modules/typescript/bin/tsc');
    var tslintPath = path.join(ctx.__repositoryRoot, '/node_modules/tslint/bin/tslint');

    var includePackagePrefix = { match: new RegExp("\"src\/[^\"]", 'g'), replacement: function (match) { return match.slice(0, 1) + ctx.packageName + "/" + match.slice(1); } };    
    var excludei18nAndMetadata = function(isCore) {        
        // if it's a customized project, we move 3 levels to find us the root of the repository               
        var filter = ((isCore === true) ? ctx.__CONSTANTS.CoreFolderName : (!isCustomizedProject) ? ctx.__CONSTANTS.MesFolderName : customizationFolderName) + "/src/packages/" + ctx.packageName;
        var i18nRegexMatch = "System\\.register\\(\"" + filter + "/src.*/i18n/.*?\", \\[[\\s\\S]*}\\);",
            i18nCustomizedRegexMatch = "System\\.register\\(\"(" + ctx.packageName + "\/src.*\/|src.*\/|)i18n/.*?\", \\[[\\s\\S]*}\\);",
            metadataRegexMatch = "System\\.register\\(\"" + filter + "/src/" + ctx.packageName + ".metadata[\\s\\S]*?System\\.register",
            metadataCustomizedRegexMatch = "System\\.register\\(\"(" + ctx.packageName + "\/src/|src/)" + ctx.packageName + ".metadata[\\s\\S]*?(System\\.register|" + ctx.packageName  + ".js.map)",
            i18nReplacementFunction = function (match) {
                         // We have a match with more then what we need, so we remove just the i18n modules
                         var systemRegisterArray = match.split("System.register(").map(function (entry) {
                             var mappedEntry = (entry.match("src.*/i18n/.*?\", \\[")) ? "" : entry;
                             if (isCustomizedProject === true && mappedEntry === entry) {
                                 mappedEntry = (entry.match("i18n/.*?\", \\[")) ? "" : entry;
                             }
                             return mappedEntry;
                         });
                         systemRegisterArray.clean("");
                         var systemRegisterArrayJoined = systemRegisterArray.join("System.register(");
                         return systemRegisterArrayJoined !== "" ? "System.register(" + systemRegisterArrayJoined : "";
                    };

        var patterns = { 
             patterns: [
                // Remove all i18n resources
                {
                     match: new RegExp(i18nRegexMatch, 'g'), 
                     replacement: i18nReplacementFunction
                },
                // Remove metadata module
                { match: new RegExp(metadataRegexMatch), replacement: function (match) { return 'System.register'; } }
             ]
        };
        if (isCustomizedProject === true) {
            patterns.patterns.push({match: new RegExp(i18nCustomizedRegexMatch, 'g'), replacement: i18nReplacementFunction});
            patterns.patterns.push({match: new RegExp(metadataCustomizedRegexMatch, 'g'), replacement: function (match) { return match.endsWith('System.register') ? 'System.register' : ''; } });
        }
        return patterns;
    }

    var commonRegexPatterns = [
        { match: new RegExp("cmf.mes.lbos", "gi"), replacement: 'cmf.lbos' },        
        { match: new RegExp("\"(" + ctx.__CONSTANTS.LibraryFolderName + "|" + ctx.__CONSTANTS.TauraFolderName + "|" + ctx.__CONSTANTS.CoreFolderName + "|" + ctx.__CONSTANTS.MesFolderName + "|" + ctx.__CONSTANTS.MessageBusFolderName + ")\/(src\/)*(packages\/)*", "gi"), replacement: '"' }                
        ];

    if (!ctx.baseDir.endsWith('/')) {
        ctx.baseDir += '/';
    }

    //#region Clean Tasks

    /**
     * Clean files
     */    
    gulp.task('clean', ['__clean-dev', '__clean-prod'], pluginDel.bind(null, [ctx.baseDir + ctx.sourceFolder + '**/*.js', ctx.baseDir + ctx.sourceFolder + '**/*.map', ctx.baseDir + ctx.sourceFolder + '**/*.d.ts'], { force: true }));
    gulp.task('__clean-dev', pluginDel.bind(null, [ctx.baseDir + 'bin', ctx.baseDir + 'obj',         
        ctx.baseDir + ctx.sourceFolder + '**/*.d.ts', ctx.baseDir + ctx.sourceFolder + '**/*.map'
        //, ctx.baseDir + ctx.sourceFolder + '**/*.js'   JS files are kept simply to keep the i18n bundle and metadata when the prod environment is setup
        ], { force: true }));    
    gulp.task('__clean-prod', pluginDel.bind(null, [ctx.baseDir + 'bin', ctx.baseDir + 'obj', ctx.baseDir + ctx.packageName + '.js', ctx.baseDir + ctx.packageName + '-debug.js', ctx.baseDir + ctx.packageName + '.js.map', ctx.baseDir + ctx.packageName + '.d.ts'], { force: true }));

    //#endregion

    //#region Utilities    

    /**
    * Deletes all typescript related compiled files. Files to remove are passed in an array
    */
    function deleteCompilationFiles(filenames, includeTsFile) {
        if (filenames instanceof Array) {
            var extensions = ["d.ts", "js.map", "js"];
            if (includeTsFile === true) {extensions.push("ts");}
            filenames.forEach(function(filename) {                                
                pluginDel.sync(extensions.map(function(extension) { return filename + "." + extension; }), { force: true });                                
            });            
        }
    }

    /**
    * Checks for a folder and injects all folders found in the stream
    */
    function replaceModuleMetadata(ctx, folderPathRegExp, folder, needsToInsertComma) {
        var accountedFolder = [];
        return pluginInject(
            gulp.src(ctx.baseDir + ctx.sourceFolder + '/' + folder + '/**/*.ts', { read: false }),
            {
                relative: true,
                starttag: folder + ": [",                
                endtag: "]",                
                transform: function (filepath, file, i, length) {

                    var match = folderPathRegExp.exec(filepath);

                    if (match != null && match.length > 1) {
                        var folderName = match[1];
                        if (accountedFolder.indexOf(folderName) < 0) {
                            var valueToInsert = (needsToInsertComma ? ', "' : '"') + folderName + '"';
                            needsToInsertComma = true;
                            accountedFolder.push(folderName);
                            return valueToInsert;
                        }
                    }else {
                        return "";
                    }
                }
            }
        );
    }    

    //#endregion

    //#region Build Tasks

    var commonCompileExclusions = function(filename) {return !filename.endsWith("d.ts") && filename.endsWith(".ts") && filename.indexOf("element-resize-detector.ts") < 0;}
    var commonPathTransform = function(filename) {return filename.replace(/\\/g, '/'); } // equalizes slashes
    // Creates the index file for the main module
    function createIndexFile(indexFilename, destination, customFileFilter) { 

        function string_src(filename, string) {
            var src = require('stream').Readable({ objectMode: true });
            src._read = function () {
                this.push(new pluginUtil.File({ cwd: "", base: "", path: filename, contents: new Buffer(string) }));
                this.push(null);
            }
            return src;
        }

        if (customFileFilter == null) {
            customFileFilter = function() { }; // we create a noop
        }

        return new Promise(function (resolve, reject) {
            pluginWalker(ctx.baseDir + ctx.sourceFolder).then(function (files) {                                
                files = files.filter(commonCompileExclusions).filter(customFileFilter).map(commonPathTransform).map(function(filename) {                    
                    return filename.replace(ctx.baseDir, "export * from './" + ctx.packageName + "\/").replace('.ts', "';"); // removes the root and file extension                    
                });                
                // creates a js file
                string_src(indexFilename, files.join("\n")).pipe(gulp.dest(destination)).on('end', resolve);
            });
        });        
    };    
    function createTsConfig(isMainBundle) {
        return new Promise(function (resolve, reject) {
        
            pluginWalker(ctx.baseDir + ctx.sourceFolder).then(function (files) {                                
                // Get all modules to include in the bundle (main bundle with most of the sources and the i18n bundle)
                bundleFiles = files.filter(commonCompileExclusions).filter(function(filename) { return filename.indexOf("i18n") >= 0; }).map(commonPathTransform).map(function(filename) {return "\"" + filename.replace(ctx.baseDir, "") + "\"";}).join(",");                    
                var fileContent = fs.readFileSync(ctx.baseDir + "tsconfig.json", "utf8");                        
                // If we are dealing with the main bundle, we exclude all i18n modules by setting the list of i18n modules as part of the exclude list
                // If we are dealing with the i18n bundle, we replace the src/**/* entry in the include list, with the list of all i18n modules                    
                if (isMainBundle === true) {                        
                   if (fileContent.indexOf("\"exclude\" :") < 0) { // The tsconfig always has a include glob, but may not have an exclude one, so we need to take that into account
                        var lastIndex = fileContent.lastIndexOf("}");
                        fileContent = fileContent.substring(0, lastIndex) + ",\"exclude\" : [" + bundleFiles + "]}";
                    } else {
                        fileContent = fileContent.replace("\"exclude\": [", bundleFiles);
                    }                    
                } else {
                    fileContent = fileContent.replace("\"src/**/*\"", bundleFiles);
                }                    
                console.log(fileContent);
                var tsConfigName = (isMainBundle === true) ? "tsconfig-main-bundle.json" : "tsconfig-i18n-bundle.json";
                fs.writeFileSync(ctx.baseDir + tsConfigName, fileContent, 'utf8');
                resolve(tsConfigName);                                
            });
            
        });
    }

    /**
    * Transpiles and bundles all modules (except i18n and metadata)
    */
    gulp.task('__build-and-bundle', function (cb) {    
        var promiseToResolve = Promise.resolve(null);
        
        if (isCustomizedProject === true) {
            commonRegexPatterns.push({ match: new RegExp(customizationFolderName + "\/src\/packages\/", "gi"), replacement: '' });
        }

        promiseToResolve.then(function(tsConfigName) {
            tsConfigName = tsConfigName || null;
            //gulp.src('').pipe(pluginShell('tsc --outFile ' + ctx.packageName + ".js --project " + tsConfigName, { cwd: ctx.baseDir }))  // Un-comment when the compiler is able to exclude dependencies            
            gulp.src('').pipe(pluginShell('\"' + process.execPath + '\" --stack_size=4096 ' + typescriptCompilerPath + ' --outFile ' + ctx.packageName + ".js ", { cwd: ctx.baseDir })) // We could use gulp-typescript with src, but the declarations and sourceMaps are troublesome
                .pipe(pluginCallback(function () {                                    
                    gulp.src(ctx.baseDir + ctx.packageName + ".js")  

                    // >>>>>>>>>>>>>>>>>>>>>>>>>REMOVE WHEN THE COMPILER IS ABLE TO EXCLUDE THE I18N MODULES
                    .pipe(pluginReplace(excludei18nAndMetadata(ctx.packageName.startsWith("cmf.core"))))                    
                    // <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<                                        
                    .pipe(pluginReplace({patterns: commonRegexPatterns})) 
                    .on('error', pluginUtil.log)
                    .pipe(pluginMinify({
                        ext: {
                            src: '-debug.js',
                            min: '.js'
                        },
                        mangle: false
                    }))
                    .pipe(gulp.dest(ctx.baseDir))                    
                    .on('end', function() {                        
                        // remove any index files created (applies only for cmf.core or cmf.mes)
                        deleteCompilationFiles([ctx.baseDir + "../" + ctx.packageName + "-index"], true);                                                  
                        if (ctx.type !== "dependency") {
                            // remove the bundled .d.ts because we will not bundle any typings 
                            pluginDel.sync(ctx.baseDir + ctx.packageName + ".d.ts");
                        }
                        cb();
                    });                 
            }));
        });            
    });

    /**
    * Transpiles and bundles all i18n modules. This approach allows only to compile i18n modules but does not generate correct sourcemaps
    * and declarations
    */
    gulp.task('__build-and-bundle-i18n', function (cb) {
        var noResult = false, promiseArray = [], languageCount = 0, finalLanguage = null, tsProject = null, suffix = null,
            customFileFilter = null; // single var pattern
        try {            
            // If we have an i18n module file we generate the bundle, otherwise, we skip it
            if (fs.lstatSync(ctx.baseDir + ctx.sourceFolder + "i18n").isDirectory()) {     

                function setFinalLanguage(language) {
                    finalLanguage = language;
                    if (language === i18n.startupCulture) {
                        language = i18n.startupCultureSuffix;
                    }   
                    return language;                      
                }

                new Promise(function (resolve, reject) {   
                    i18n.supportedCultures.forEach(function (language) {     
                        language = setFinalLanguage(language);                        
                        suffix = (language !== i18n.startupCultureSuffix) ? language.split("-").join("\-") : "";
                        customFileFilter = function(filename) { return filename.indexOf("i18n") >= 0 && filename.endsWith(language + ".ts");  }                        
                         // Let's create a temporary index file for each language. With an index file we will not need so much regex which can be error prone                        
                         promiseArray.push(createIndexFile(ctx.packageName + "-" + language + "-index.ts", ctx.baseDir + "\/..", customFileFilter));
                    });

                    Promise
                        .all(promiseArray)
                        .then(function() {
                            // After all index files are generated, we transpile each language
                            promiseArray = [];
                            i18n.supportedCultures.forEach(function (language) {                    
                                language = setFinalLanguage(language);                        
                                tsProject = pluginTypescript.createProject(ctx.baseDir + 'tsconfig.json', {
                                    "typescript": require("typescript"),
                                    "out": "main." + finalLanguage + ".bundle.js"
                                });

                                // TODO: THERE IS A BUG IN THIS PROCEDURE BECAUSE WHEN WE GENERATE A LANGUAGE BUNDLE, OTHER THAN THE DEFAULT (pt-PT FOR INSTANCE), WE MAY BE INCLUDING DEFAULT LANGUAGE MODULES, BECAUSE WE MAKE AN IMPORT LIKE "import .. from '[module].default'"
                                // SO THE DEFAULT AND SPECIFIC LANGUAGE MODULES ARE INCLUDED IN THE BUNDLE. SINCE THE SPECIFIC MODULES ARE DECLARED LAST, THE SYSTEM REGISTER CALL IS NOT OVERWRITTEN, SO IT ASSUMES ALWAYS THE FIRST ONE (GENERIC). THIS MUST BE FIXED!!
                                promiseArray.push(new Promise(function (resolve, reject) {   
                                
                                    gulp.src([ctx.baseDir + '../' + ctx.packageName + "-" + language + "-index.ts"], { cwd: ctx.baseDir })                        
                                    .pipe(pluginTypescript(tsProject)).on('error', function (err) { cb(err); }).js
                                    .pipe(pluginReplace({
                                        patterns: [                                                                        
                                            // We need to remove the index entry, which is the last one in the file
                                            { match: new RegExp("System.register\\(\"" + ctx.packageName + "-" + language + "-index[\\s\\S]*"), replacement: function () { return ''; } },
                                            { match: new RegExp("(" + ctx.__CONSTANTS.CoreFolderName + "|" + ctx.__CONSTANTS.MesFolderName + ")\/src\/packages\/", "gi"), replacement: '' }
                                        ]
                                    }))
                                    .pipe(pluginIf(isCustomizedProject === true,  pluginReplace({
                                        patterns: [                                                                                                                    
                                            { match: new RegExp("(" + customizationFolderName + ")\/src\/packages\/", "gi"), replacement: '' }                                                                      
                                        ]
                                    })))
                                    .pipe(pluginIf(language === i18n.startupCultureSuffix,  pluginReplace({
                                        // When producing the i18n resource file for the DEFAULT culture, we need to convert register names from default to specific, so "/i18n/main.default" become "/i18n/main.pt-PT" or "/i18n/main.en-US". The US is very important because it is the default language
                                        patterns: [                                           
                                           { match: new RegExp("(i18n\/\\w+)(\." + language + "|\.default)", 'gi'), replacement: "$1." +  finalLanguage },                                           
                                        ]
                                    })))
                                    .pipe(pluginIf(language !== i18n.startupCultureSuffix,  pluginReplace({
                                        // This a sequence of 3 steps (to fix the problem described above)
                                        // 1. Replace all register by .default file for ORIGINAL_LANGUAGE
                                        // 2. Replace all .default by the en-US (this includes the dependencies!)
                                        // 3. Replace back the ORIGINAL_LANGUAGE by .default
                                        patterns: [
                                            { match: new RegExp("System\\.register\\(\"([^\"]*)(i18n\/\\w+)(\.default)\"", 'gi'), replacement: "System.register(\"$1$2.ORIGINAL_LANGUAGE\"" }
                                        ]
                                    })))
                                    .pipe(pluginIf(language !== i18n.startupCultureSuffix,  pluginReplace({
                                        // Important: Read the previous pipe comment first
                                        // When producing the i18n resource file for any culture other than default, there is a problem: if the specific culture imports a default value, it will be in the bundle as ".default". This is a problem. So let's replace ".default" for the true default culture.
                                        patterns: [
                                            { match: new RegExp("(i18n\/\\w+)(\.default)", 'gi'), replacement: "$1." +  finalLanguage },
                                            { match: new RegExp("(i18n\/\\w+)\.ORIGINAL_LANGUAGE", 'gi'), replacement: "$1." +  i18n.startupCulture }
                                        ]
                                    })))
                                    .pipe(pluginMinify({
                                        ext: {
                                            src: '-debug.js',
                                            min: '.js'
                                        }
                                    }))
                                    .on('error', function(err) {
                                        reject(err);
                                    })
                                    .pipe(gulp.dest(ctx.baseDir + ctx.deployFolder + "i18n"))
                                    .on('end', function(){
                                        pluginDel.sync([ctx.baseDir + "\/..\/" + ctx.packageName + "-" + language + "-index.ts"], { force: true });
                                        resolve();
                                    });  
                                }));
                            });

                            return Promise.all(promiseArray);
                        })
                        .then(function() {
                            resolve();
                        })
                        .catch(function(err) {
                            resolve(err);
                        });
                })
                .then(function(obj) {
                    cb(obj);  
                });
            }
        }
        catch (e) {            
            noResult = true;
            pluginUtil.log(pluginUtil.colors.yellow("Module has no i18n resources"));
        }
        if (noResult === true) {
            cb();
        }
    });

    /**
    * Transpiles and injects all component, directives, ... metadata according to the package structure
    */
    gulp.task('__build-and-bundle-metadata', function (cb) {                        
        return new Promise(function (resolve, reject) {   
            // We will keep the module anonymous as it is fetched by the app by the module loader and this way the file can be used for both DEV + PROD :-)
            var tsProject = pluginTypescript.createProject(ctx.baseDir + 'tsconfig.json', {
                "typescript": require("typescript") ,
                outFile: ctx.packageName + ".metadata.js"                      
            });
            var additionalPatterns = [];
            if (isCustomizedProject === true) {
                additionalPatterns.push({ match: new RegExp("\"" + ctx.packageName + ".metadata\"", "g"), replacement: "\"" + ctx.packageName + "/src/" + ctx.packageName + ".metadata\""  });
                additionalPatterns.push({ match: new RegExp("\"i18n\/", "g"), replacement: "\"" + ctx.packageName + "/src/i18n/" });
            }
                    
            gulp.src([ctx.baseDir + ctx.sourceFolder + ctx.packageName + ".metadata.ts"], { cwd: ctx.baseDir })                        
            .pipe(pluginTypescript(tsProject)).on('error', function (err) { cb(err); }).js
            .pipe(replaceModuleMetadata(ctx, componentPathRegExp, "components", false))
            .pipe(replaceModuleMetadata(ctx, directivePathRegExp, "directives", false))
            .pipe(replaceModuleMetadata(ctx, widgetPathRegExp, "widgets", false))
			.pipe(replaceModuleMetadata(ctx, dataSourcePathRegExp, "dataSources", false))
            .pipe(replaceModuleMetadata(ctx, converterPathRegExp, "converters", false))
            .pipe(replaceModuleMetadata(ctx, pipePathRegExp, "pipes", false))     
            .pipe(pluginReplace({
                 // update path for i18n
                patterns: [{ match: new RegExp("\"\\.\/i18n\/", "g"), replacement: "\"" + ctx.packageName + "/src/i18n/" }]
            }))
            .pipe(pluginReplace(excludei18nAndMetadata(ctx.packageName.startsWith("cmf.core"))))                
            .pipe(pluginReplace({ patterns: commonRegexPatterns})) 
            .pipe(pluginReplace({
                patterns: additionalPatterns
            }))
            .pipe(pluginMinify({
                ext: {
                    src: '-debug.js',
                    min: '.js'
                }
            }))
            .pipe(gulp.dest(ctx.baseDir + ctx.deployFolder))
            .on('end', resolve);
        });
    });

    gulp.task("__build-typescript", function (callback) {           
        return gulp.src('').pipe(pluginShell('\"' + process.execPath + '\" --stack_size=4096 ' + typescriptCompilerPath + (pluginYargs.listFiles ? " --listFiles" : ""), { cwd: ctx.baseDir }));
    });

    gulp.task("__build-less", function (callback) {

         if (ctx.cssBundle) {
            if (ctx.cssAditionalEntryPoints && Array.isArray(ctx.cssAditionalEntryPoints)) {
                ctx.cssAditionalEntryPoints.map(function (entryPoint) {
                    gulp.src(ctx.baseDir + ctx.sourceFolder + entryPoint)
                        .pipe(pluginLess({
                            relativeUrls: true
                        }))
                        .pipe(pluginAutoPrefixer({
                            browsers: ['last 2 versions']    // Could be tweaked according to the browser requisites
                        }))
                        .pipe(gulp.dest(ctx.baseDir + ctx.deployFolder + "src"));
                });
            }
            return gulp.src(ctx.baseDir + ctx.sourceFolder + ctx.packageName + '.less')
                .pipe(
                pluginInject(
                    gulp.src(['**/*.less', '!' + ctx.packageName + '.less'], { read: false, cwd: ctx.baseDir + ctx.sourceFolder }),
                    {
                        starttag: '/* inject:imports */',
                        endtag: '/* endinject */',
                        transform: function (filepath) {
                            return '@import ".' + filepath + '";';
                        }
                    })
                )
                .pipe(pluginLess({
                    relativeUrls: true
                })).on('error', function (err) { callback(err) })
                .pipe(pluginAutoPrefixer({
                    browsers: ['last 2 versions']    // Could be tweaked according to the browser requisites
                })).on('error', function (err) { callback(err) })
                .pipe(pluginRename(ctx.packageName + '.css'))
                .pipe(gulp.dest(ctx.baseDir + ctx.deployFolder + "src"));
        } else {
            return gulp.src(ctx.baseDir + ctx.sourceFolder + '**/*.less')
                .pipe(pluginLess()).on('error', function (err) { callback(err) })
                .pipe(pluginAutoPrefixer({
                    browsers: ['last 2 versions']    // Could be tweaked according to the browser requisites
                })).on('error', function (err) { callback(err) })
                .pipe(gulp.dest(ctx.baseDir + "src"));
        }
    });

        /**
     * Package linting.
     */
    gulp.task("__lint", (callback) => {
        // First check if there is a tslint.json file, otherwise, skip the whole linting.        
        if (fs.existsSync(`${ctx.__repositoryRoot}/tslint.json`)) {            
            let packageExclusionList = [];
            if (ctx.linterExclusions instanceof Array && ctx.linterExclusions.length > 0) {
                packageExclusionList = ctx.linterExclusions;
            }
            return gulp.src([                
                `${ctx.baseDir}src/**/*.ts`, 
                `!${ctx.baseDir}src/**/*.d.ts`, 
                `!${ctx.baseDir}src/**/i18n/*.ts`,
                `!${ctx.baseDir}src/**/style/fonts/**/metadata.ts`,
            ...packageExclusionList.map((exclusion) => `!${ctx.baseDir}${exclusion}`)])
            .pipe(pluginTslint({
                formatter: "stylish",
                fix: pluginYargs.fix ? true : false
            }))
            .pipe(pluginTslint.report({
                summarizeFailureOutput: true,
                allowWarnings: true
            }));
        } else {
            pluginUtil.log(pluginUtil.colors.yellow("No tslint.json file found. Skipping task."));
            callback();
        }        
    });

    /**
    * Build Project
    */
    gulp.task('build', function(callback) {
        gulpWrapper.seq(["__internal-build"], callback);
    });

    /**
     * Internal Build task
     */
    gulp.task('__internal-build', function (callback) {
        
        if (pluginYargs.production || ctx.type === "dependency") {
            var tasksToExecute = [
                '__clean-prod',                                
                '__build-and-bundle',
                '__build-and-bundle-i18n',
                '__build-and-bundle-metadata',		
                '__build-less'                            
            ];
            if (pluginYargs.dist) {
                // If we are running with the dist flag on, we also need to produce the typings for all packages
                tasksToExecute.splice(1, 0, ['__build-typescript']);
            }
        if (ctx.type !== "dependency") {
                tasksToExecute.push('__lint');
            }
            gulpWrapper.seq(tasksToExecute, callback);
        }else{
            gulpWrapper.seq(
            [
                '__clean-dev',
                '__build-typescript',
                '__lint',
                '__build-less'
            ],
            callback);
        }
    });

    /**
     * Watch task
     */
    gulp.task('watch', function (cb) {
        gulpWrapper.seq(["__internal-watch"], cb);
    });

    /**
     * Internal Watch
     */
    gulp.task('__internal-watch', function (cb) {
        var rs = require("run-sequence").use(gulp);
        rs('build', function () {
            gulp.watch(ctx.baseDir + ctx.sourceFolder + "**/*.ts", ['__lint', '__build-typescript']);
            gulp.watch(ctx.baseDir + ctx.sourceFolder + "**/*.less", ['__build-less']);
            //cb();
        });
    });
    //#endregion

    //#region Generators: i18n

    function ensureAllCultures(folder, unitName) {
        var files = fs.readdirSync(folder).filter(file => file.endsWith(".ts") && !file.endsWith("d.ts"));
        var defaults = (files.filter(file => file.endsWith(".default.ts")) || []).map(file => file.split(".")[0]);

        var nonMatchingFiles = files.filter(file => defaults.indexOf(file.split(".")[0]) < 0);
        if (nonMatchingFiles && nonMatchingFiles.length > 0) {
            pluginUtil.log(new Error(`Invalid files found at ${folder}: ${nonMatchingFiles}`));
        }


        defaults.forEach(i18nBlock => {
            //filter the default culture, which is created from the default files while compiling
            i18n.supportedCultures.filter(culture => culture != "en-US").forEach(culture => {
                var i18nCultureFile = path.join(folder, [i18nBlock, culture, "ts"].join("."));
                if (!fs.existsSync(i18nCultureFile)) {
                    pluginUtil.log(`Creating file ${i18nCultureFile} for culture ${culture}`);
                    fs.writeFileSync(i18nCultureFile, 
                        `export default {}
                    `); // We need a new line to ensure that linting rules are followed
                }
            })
        });
    }

    //i personally think this should be in install and not build, but all i18n stuff is here, so I'm keeping it for coherence
    gulp.task('create-missing-i18n', function(cb) {
        //check all i18n places and check if all languages are present. If not, create a template file
        var maini18n = path.join(ctx.baseDir, "src", "i18n");
        if (fs.existsSync(maini18n)) {
            ensureAllCultures(maini18n, "main");
        }

        foldersToInspect.forEach(folder => {
            var f = path.join(ctx.baseDir, "src", folder); 
            if (fs.existsSync(f)) {
                var units = fs.readdirSync(f);
                units.forEach(unit => {
                    var i18nFolder = path.join(f, unit, "i18n");
                    if (fs.existsSync(i18nFolder)) {
                        ensureAllCultures(i18nFolder, unit);
                    }
                });
                
            }
        })
        cb();
    });

    /**
     * Transforms i18n .ts files into .po files and save it on baseDir
     */
    gulp.task('i18n-ts2po', function() {
        return gulp
            .src([
                path.join(ctx.baseDir, "**/i18n/*.ts"),
                "!**/*.d.ts"
            ], { cwd: ctx.baseDir })
            .pipe(pluginI18nTransform({
                base: ctx.baseDir,
                languages: i18n.supportedCultures.filter(function(culture) { return culture !== i18n.startupCulture; }),
                dest: "pot"
            }))
            .pipe(gulp.dest(ctx.baseDir));
    });

    /**
     * Transforms i18n .po files into .ts files.
     * It uses the BaseDir to store .ts files.
     */
    gulp.task('i18n-po2ts', function() {
        return gulp
            .src([
                path.join(ctx.baseDir, "*.po")
            ], { cwd: ctx.baseDir })
            .pipe(pluginI18nTransform({
                base: ctx.baseDir,
                languages: i18n.supportedCultures.filter(function(culture) { return culture !== i18n.startupCulture; }),
                dest: "ts"
            }))
            .pipe(gulp.dest(ctx.baseDir));
    });

    //#endregion
};

module.exports.plugins = {
    'del': pluginDel, 
    'gulp-typescript': pluginTypescript,
    'gulp-replace-task': pluginReplace,
    'run-sequence': pluginRunSequence,
    'gulp-shell': pluginShell,
    'gulp-rename': pluginRename,
    'gulp-callback': pluginCallback,

    //module specific plugins
    'gulp-less': pluginLess,
    'gulp-inject': pluginInject
}
