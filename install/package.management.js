var fs = require("fs");
var path = require("path");
var pluginReplace = require('gulp-replace-task');
var pluginRename = require('gulp-rename');
var pluginShell = require("gulp-shell");
var gulpUtil = require('gulp-util');
var pluginYargs = require('yargs').argv;
var pluginInstall = require('gulp-install');
var pluginDel = require("del");
var pluginExecute = require("child_process").exec;
var pluginCallback = require("gulp-callback");
var pluginReplace = require('gulp-replace-task');

var utils = require('./../utils.js');

module.exports = function (gulpWrapper, ctx) {

	var angularDependenciesList = ["angular", "rxjs", "angular2-grid", "reflect-metadata", "zone.js", "monaco-editor"];
    var gulp = gulpWrapper.gulp;
    var seq = gulpWrapper.seq;

    //>>>>>>>>>>>>>>>>Customization<<<<<<<<<<<<<<<<<<<<<<<<<
    if (ctx.isCustomized === true) {    	    	
    	// When we are is customized mode, there are some constraints that need to be considered, like the fact that the git UXFAB repositories are not available.
    	// All UXFAB deliverables are located in the webApp node_modules folder.
    	function bypassFolderName(folder) {
    		return "apps/" + ctx.packagePrefix + ".web/" + ctx.libsFolder;
    	}
    	ctx.__CONSTANTS.TauraFolderName = bypassFolderName(ctx.__CONSTANTS.TauraFolderName);
    	ctx.__CONSTANTS.CoreFolderName = bypassFolderName(ctx.__CONSTANTS.CoreFolderName);
    	ctx.__CONSTANTS.LibraryFolderName = bypassFolderName(ctx.__CONSTANTS.LibraryFolderName);    	
    }

	var getDirectories = function (path) {
		try {
			var directory = fs.readdirSync(path);
            return directory.filter(function (file) {
                return fs.statSync(path + '/' + file).isDirectory();
            });

		} catch (e) {
			return [];
		}
	};

	function isDirectory(path) {
		var result = true;
		try {
			fs.accessSync(path, fs.F_OK);					    
		} catch (e) {
			result = false;
		}
		return result;
	}

	gulp.task('__createBowerFile', function (callback) {
		// Find "_bower.json", replace @@GUIRepositoryRoot and create bower.json
		//var appPath = path.resolve(path.join(__dirname, "../../../apps/" + ctx.packagePrefix + ".web/node_modules/")).replace(/\\/g, '/'),
		//repositoryPath = path.resolve(path.join(__dirname, "../../../")).replace(/\\/g, '/');	
		var appPath =  `${ctx.__repositoryRoot.replace(/\\/g, '/')}/apps/${ctx.packagePrefix}.web/node_modules`,
		repositoryPath = ctx.__repositoryRoot.replace(/\\/g, '/'),				
		repositoryPath = repositoryPath.split("/").slice(0, repositoryPath.split("/").length - 1).join("/");

		gulp.src([ctx.baseDir + '__bower.json'], { cwd: ctx.baseDir })
			.pipe(pluginReplace({
				patterns: [{
					match: 'GUIRepositoryRoot',
					replacement: repositoryPath
				}, {
					match: 'CoreHTML',
					replacement: ctx.__CONSTANTS.CoreFolderName
				}, {
					match: 'MESHTML',
					replacement: ctx.__CONSTANTS.MesFolderName
				}]
			}))
			.pipe(pluginReplace({
				patterns: [{
					match: 'GUIWepAppRoot',
					replacement: appPath
				}]
			}))
			.pipe(pluginRename('bower.json'))
			.pipe(gulp.dest(ctx.baseDir)).pipe(pluginCallback(function () {
				if (callback) callback();
			}));
			
	});

	/*
	* We infer here that, if we have a "local-typings" folder, then the typings inside are not available in their own bower/npm package or in the npm @types repository.
	* So we copy each one to the according bower/npm package. The ts compiler will pick it up there being called index.d.ts.
	*/
    function copyFromLocalTyping() {
    	var promise = Promise.resolve(null);
    	try {
	    	// If we have an i18n module file we generate the bundle, otherwise, we skip it	    	
			if (fs.lstatSync(ctx.baseDir + "local-typings").isDirectory()) {
				var folders = getDirectories(ctx.baseDir + "local-typings");			
				if (folders instanceof Array) {
					var promiseArray = [];
					folders.forEach(function(folder) {
						// Check if folder already exists
						try {
							if (fs.lstatSync(ctx.baseDir + ctx.libsFolder + folder).isDirectory()) {								
								promiseArray.push(gulp.src([ctx.baseDir + "local-typings/" + folder + "/" + folder + ".d.ts"])
						    		.pipe(pluginRename("index.d.ts"))				    
						    		.pipe(gulp.dest(ctx.baseDir + ctx.libsFolder + folder + "/")));
							}
						}catch(error){
							//folder does not exist
						}
					});
					if (promiseArray.length > 0) {
						promise = Promise.all(promiseArray);
					}
				}			
	        } 
    	} catch(error){
			//folder does not exist
		}
        return promise;
    }
   
    /*
    * Install typings from npm @types
    */ 
    gulp.task('__installNpmTypes',  function (callback) {	
	    try {	
	    	// If we clean the libsFolder, we alway get a clean install
			// There is an exception here, which is the webApp for customized projects. We can't delete the libs folder as we would be removing the UXFab release
	    	//>>>>>>>>>>>>>>>>Customization<<<<<<<<<<<<<<<<<<<<<<<<<
	    	if (ctx.isCustomized !== true || (ctx.isCustomized === true && ctx.type !== "webApp")) {	    		
	    		pluginDel.sync([ctx.baseDir + ctx.libsFolder], { force: true });	
	    	}
	    	process.chdir(ctx.baseDir);
			pluginExecute('npm install',function (err, stdout, stderr) { 
				callback(); 
			});				  			
		}catch(ex) {
			console.log(ex);
			callback();
		}
	}); 

    /**
     * Install all dependencies.
     */
	gulp.task('__install-libs', ['__installNpmTypes'],  function (callback) {	
		/* Instead of doing a bower install directly, we will use the following approach:
		*  - Read the bower.json and install each dependency one by one
		*		- If the dependency does not start with cmf or is defined in the angularDependenciesList array, do a normal bower install
		*		- If not, create a windows symbolic link
		*/		

		// if we use a bower.json file, when performing a single package install, we will get all packages
		// and if we if we create links first, it will look into those links and also install everything.
		// We need to install just what we need (when non webApp) and then link
		fs.renameSync(ctx.baseDir + "bower.json", ctx.baseDir + "temp_file.json"); 

		var bowerObject = require(ctx.baseDir + "temp_file.json");
		var repositoryRoot = path.normalize(path.join(ctx.__repositoryRoot, ".."));
		
		//>>>>>>>>>>>>>>>>Customization<<<<<<<<<<<<<<<<<<<<<<<<<
		if (ctx.isCustomized === true) {
			repositoryRoot = path.join(ctx.__repositoryRoot, ".");						
		}
		
		if (typeof bowerObject.dependencies === "object") {

			var mapFunction = function(package) { return {name: package, version: bowerObject.dependencies[package]}},
			dependenciesToInstall = (ctx.type === "webApp") ? Object.keys(bowerObject.dependencies).map(mapFunction) : Object.keys(bowerObject.dependencies).filter(function(package) {return !package.startsWith("cmf") && angularDependenciesList.indexOf(package) < 0 
				&& (!(bowerObject.selfTypedDependencies instanceof Array) || bowerObject.selfTypedDependencies.indexOf(package) >= 0)}).map(mapFunction),
			//>>>>>>>>>>>>>>>>Customization<<<<<<<<<<<<<<<<<<<<<<<<<
			dependenciesToLink = Object.keys(bowerObject.dependencies).filter(function(package) {return (package.startsWith("cmf") || package.startsWith(ctx.packagePrefix)) || angularDependenciesList.indexOf(package) >= 0;}).map(mapFunction),
			index = dependenciesToLink.indexOf("cmf.lbos"),
			installCount = dependenciesToInstall.length,
			linksCount = dependenciesToLink.length,
			motherDependencies = [
				{
					name: "cmf.taura",
					//>>>>>>>>>>>>>>>>Customization<<<<<<<<<<<<<<<<<<<<<<<<<
					version: path.join(repositoryRoot, ctx.__CONSTANTS.TauraFolderName, ((ctx.isCustomized !== true) ? "/src/" : "") + "cmf.taura")
				},
				{
					name: "cmf.core",
					//>>>>>>>>>>>>>>>>Customization<<<<<<<<<<<<<<<<<<<<<<<<<
					version: path.join(repositoryRoot, ctx.__CONSTANTS.CoreFolderName, ((ctx.isCustomized !== true) ? "/src/" : "") +"cmf.core")
				},
				{
					name: "@angular",
					//>>>>>>>>>>>>>>>>Customization<<<<<<<<<<<<<<<<<<<<<<<<<
					version: path.join(repositoryRoot, ctx.__CONSTANTS.LibraryFolderName, ((ctx.isCustomized !== true) ? "/cmf.angular2/node_modules/" : "") + "@angular")
				}
			];					

			function getPromise(flag) {				
				var promiseToReturn = null;				
				if ((ctx.type !== "webApp" && flag == null) || (ctx.type === "webApp" && flag === true)) {
					// *************PACKAGES INSTALL PROMISE******************
					promiseToReturn = new Promise(function(resolve, reject) {
						if (ctx.type === "webApp") {									
							resolve(true);																						
						} else {
							if (dependenciesToInstall.length === 0) { resolve(true); } else {
								process.chdir(ctx.baseDir);
								(function installOneOnOne() {
									var package = (dependenciesToInstall.length >= 1) ? dependenciesToInstall.pop() : null;
									if (package == null) { resolve(true); } else { pluginExecute('bower install --quiet ' + package.name + "#" + package.version, function (err, stdout, stderr) {	installOneOnOne(); }); }									
								})();							
							}
						}				
					});
				} else {
					function getTypesFromAllLinks() {
							// We are installing the webApp and all links have been accounter for, we need to collect all third party @types from the links
							// We need to copy all types to the node_modules folder so this can be release and customization projects can use third party typings as required
							if (ctx.type === "webApp") {								
								getDirectories(ctx.baseDir + ctx.libsFolder).map(function(folder) {	    							
	    							gulp.src([ctx.baseDir + ctx.libsFolder + folder + "/" + ctx.libsFolder + "@types/**/*"])						    						
			    						.pipe(gulp.dest(ctx.baseDir + ctx.libsFolder + "@types"));
	    						});		
							} /*else if (ctx.__projectName.toUpperCase() !== "CORE") {								
								// If we are dealing with the MES project, other than the webApp package, we need to install the install the cmf.mes.lbos in the @types folder
								// so the typings from cmf.lbos defined in cmf.core are not used									
								gulp.src([repositoryRoot + "Library/cmf.mes.lbos/cmf.lbos.d.ts"])
						    		.pipe(pluginRename("index.d.ts"))				    
						    		.pipe(gulp.dest(ctx.baseDir + ctx.libsFolder + "@types/cmf.lbos/"));				
						    	gulp.src([repositoryRoot + "Library/cmf.mes.lbos/node_modules/moment/*.d.ts"])						    		
						    		.pipe(gulp.dest(ctx.baseDir + ctx.libsFolder + "@types/cmf.lbos/node_modules/moment"));										    		
								gulp.src([repositoryRoot + "Library/cmf.mes.lbos/node_modules/@types/core-js/*.*"])						    		
						    		.pipe(gulp.dest(ctx.baseDir + ctx.libsFolder + "@types/core-js"));										    		
							}	*/			
						}								
					// ****************LINKS PROMISE*******************************
					// We need to create the links that are always present (mother links) + the ones defined in each bower.json					
					if (ctx.type === "webApp") { // If it's a webApp, the paths need to be adjusted
						motherDependencies = motherDependencies.map(function(package) { package.version = package.version.replace("../", ""); return package;});
						// It's better to add all links. If not, only a few ones will be created and when a "bower i" is performed, they will be copied only to be removed and linked afterwards. So for a better performance, we add all links
						// and then do a "bower i" to install all third party packages
						function getCmfPackages(modulePath) {
							return getDirectories(ctx.baseDir + "../../../" + modulePath).map(function (packageName) {
								return {name: packageName, version: ctx.baseDir + "../../../" + modulePath + packageName};								
	            			});	
						}
										
						motherDependencies = motherDependencies.concat(
							getCmfPackages(ctx.__CONSTANTS.CoreFolderName + "/src/packages/")).concat(getCmfPackages(ctx.__CONSTANTS.CoreFolderName + "/dependencies/"));						
						// Add lbos and cmf.kendoui which are the only ones which will not be picked up
						motherDependencies = motherDependencies.concat([
							{ name: "cmf.kendoui", version: path.join(repositoryRoot, ctx.__CONSTANTS.LibraryFolderName, "/cmf.kendoui")},
							{ name: "cmf.lbos", version: path.join(repositoryRoot, ctx.__CONSTANTS.LibraryFolderName, "/cmf.mes.lbos")},
							{ name: "cmf.three.js", version: path.join(repositoryRoot, ctx.__CONSTANTS.LibraryFolderName, "cmf.three.js/dist")}
							]);
						if (ctx.__projectName.toUpperCase() === "MES") {
							motherDependencies = motherDependencies.concat(getCmfPackages(ctx.__CONSTANTS.MesFolderName + "/src/packages/"));							
							motherDependencies.find(function(package) {return package.name ==="cmf.lbos";}).version = path.join(repositoryRoot, ctx.__CONSTANTS.LibraryFolderName, "/cmf.mes.lbos");
							motherDependencies = motherDependencies.concat([{ name: "cmf.three.js", version: path.join(repositoryRoot, ctx.__CONSTANTS.LibraryFolderName, "/cmf.three.js/dist")}]);
						}									
					}								
					if (ctx.packageName !== "cmf.core" && ctx.type !== "dependency") {
						//if (ctx.packageName === "cmf.mes") { motherDependencies = motherDependencies.concat([ { name: "cmf.lbos", version: repositoryRoot + "Library/cmf.mes.lbos"}]); }		
						dependenciesToLink = dependenciesToLink.concat(motherDependencies);
					} 			
					if (isDirectory(ctx.baseDir + ctx.libsFolder) === false) {
						fs.mkdirSync(ctx.baseDir + ctx.libsFolder);
					}					
					promiseToReturn = new Promise(function(resolve, reject) {						
						if (dependenciesToLink.length === 0){ getTypesFromAllLinks(); resolve(true); } else {
							dependenciesToLink.forEach(function(package) {								
							 	pluginExecute('mklink /j ' + package.name + ' "' + package.version + '"', { cwd: ctx.baseDir + ctx.libsFolder }, function (err, stdout, stderr) {									
				    				linksCount--;				    													
				    				if (linksCount <= 0) {					    					
				    					getTypesFromAllLinks();
										resolve(true);
				    				}
				  				});
							});								
						}
					});
				}
				return promiseToReturn;
			}

			function performPostActions() {					
	 			copyFromLocalTyping().then(function() {			
					try {
						if (isDirectory(ctx.baseDir + ctx.libsFolder + "angular") === true) {
							fs.renameSync(ctx.baseDir + ctx.libsFolder + "angular", ctx.baseDir + ctx.libsFolder + "@angular");
						}
					} catch(error){
						gulpUtil.log(gulpUtil.colors.cyan("Skipping folder rename"), gulpUtil.colors.magenta(error.message));
					} finally{
						fs.renameSync(ctx.baseDir + "temp_file.json", ctx.baseDir + "bower.json"); // if we don't have a bower.json file, the whole install is way much faster, so we rename it when this task starts						
					}								
				});				
			}
			// When installing the webApp we first create the links and then install the packages
			// When installing other than the webApp we first install packages and then create the links
			getPromise().then(getPromise).then(performPostActions).then(function() {
				if (ctx.type === "webApp") { pluginExecute('bower install --quiet', function() { pluginDel.sync([ctx.baseDir + ctx.libsFolder + "angular"]); callback();}) } else { callback();}}).catch(function(error) {
				console.error(error);
			});
		} else {
			callback();
		}		
	});

    /**
     * Install Libraries
     */
    gulp.task('install-libs', function (callback) {
        if (!pluginYargs.build) {		
			seq(['__install-libs'], callback);
        } else {
			console.log("Running installer in Build mode");
			seq(['__install-libs-link-build'], callback);
		}
    });

	/**
	* In prod mode we need to change the debug.isEnabled flag to false            
	*/
	gulp.task('__webApp-switch_ProdMode_Flag', function (cb) {
        return gulp.src([ctx.baseDir + ctx.sourceFolder + 'app.js'])                                   
            .pipe(pluginReplace({
                patterns: [                                
                    { match: /isEnabled: true/, replacement: "isEnabled: false" }]                                
            }))                       
            .pipe(gulp.dest(ctx.baseDir + ctx.sourceFolder));                      
    });

	/**
     * Removes stale files and directories. After this a new install is required.
     */
    gulp.task('purge', function (callback) {
        pluginDel([ctx.baseDir + "dist",
            ctx.baseDir + "libs",
			ctx.baseDir + 'dev-mode',
            ctx.baseDir + ctx.libsFolder,
            ctx.baseDir + ctx.metadataFileName,
            ctx.baseDir + "obj",
            ctx.baseDir + "bin"], { force: true }, callback);
    });

     /**
     * Installation Task
     * Remarks: only needs to be run the first time or after a git pull
     */
    gulp.task('install', function (callback) {
		seq(['__createBowerFile', 'install-libs'], callback);		
	});
};