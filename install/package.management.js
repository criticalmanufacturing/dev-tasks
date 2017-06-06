var fs = require("fs"),
	pluginRename = require('gulp-rename'), 
	pluginDel = require("del"), 
	pluginExecute = require("child_process").exec,	
	pluginfsExtra = require("fs-extra"),
	pluginPath = require('path'),
	pluginYargs = require('yargs').argv;;

module.exports = function (gulpWrapper, ctx) {	
    var gulp = gulpWrapper.gulp, seq = gulpWrapper.seq, getDirectories = function (path) {
		try {
			var directory = fs.readdirSync(path);
            return directory.filter(function (file) {
                return fs.statSync(path + '/' + file).isDirectory();
            });
		} catch (e) {return [];}
	};

	/**
     * Removes stale files and directories. After this a new install is required.
     */
    gulp.task('purge', function (callback) {
        pluginDel([            
            ctx.baseDir + ctx.libsFolder,
            ctx.baseDir + ctx.metadataFileName,
            ctx.baseDir + "obj",
            ctx.baseDir + "bin"], { force: true }, callback);
    });

	/**
	 * Cleans the libs folder allowing a cleaning install.
	 * There is an exception here, which is the webApp for customized projects. We can't delete the libs folder as we would be removing the HTML5 release.
	 */
	gulp.task('__cleanLibs',  function (callback) {	
		if (ctx.isCustomized !== true || (ctx.isCustomized === true && ctx.type !== "webApp")) {	    		
			pluginDel.sync([ctx.baseDir + ctx.libsFolder], { force: true });	
		}
		callback();
	}); 

    /*
    * Installs all npm packages (public and private)
    */ 
    gulp.task('__npmInstall',  function(callback) {	
		try {								
 			pluginExecute('npm install --silent', { cwd: ctx.baseDir }, function(error, stdout, stderr) {
 				if (error instanceof Error) {
 					console.error(stderr);	
 				} 
 				callback();								      
 			});			
  		} catch(ex) {
 			console.error(ex);			
  			callback();
  		}
	}); 

	/*
	* If there is a "local-typings" folder, then the typings inside are not available in their own npm packages or in the npm @types repository.
	* In these cases we copy each one to the according package. The ts compiler will pick it up there being called index.d.ts.
	*/
	gulp.task('__copyLocalTypings', function (callback) {
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
						} catch(error){
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
	});

	/**
	 * Recursively follows all dependencies defined in the cmfLinkDependencies object of the package.json. All nested dependencies get linked.
	 */
	gulp.task('__linkDependencies',  function (callback) {	
	    try {	
			var packagesToLink = [];
			(function createLinks(packagesToLink, packageFolder) {
				if (fs.existsSync(packageFolder + '/package.json')) { // for instance @angular from Library has no package.json
					const packageObj = pluginfsExtra.readJsonSync(packageFolder + '/package.json');
					if (typeof packageObj.cmfLinkDependencies === "object") {
						Object.getOwnPropertyNames(packageObj.cmfLinkDependencies).forEach(function(dependencyName) {
							const package = { name: dependencyName };	
							/**
							 * In customization projects:  
							 * - if the dependency starts with "cmf" we could immediately link to the web app
							 * - if it does not start with "cmf" it's either a link to a customized package or it can still be something that's not customized, like "@angular".
							 * We will try to respect what's in the link and follow it:
							 * - if it does not exist, then we try to look it up in the web app
							 * - if it exists, most certaintly, it's a link to a customized package
							 * This approach seems to be the most generic as it does not catalog any exceptions that would be altered later on.
							 */ 							 
							let internalLink = pluginPath.join(packageFolder, packageObj.cmfLinkDependencies[dependencyName].split("file:").pop()),						
								webAppLink = (ctx.isCustomized === true && fs.existsSync(pluginPath.join(packageFolder, `../../../apps/${ctx.packagePrefix}.web/${ctx.libsFolder}/${package.name}`))) ? 
								pluginPath.join(packageFolder, `../../../apps/${ctx.packagePrefix}.web/${ctx.libsFolder}/${package.name}`) : 
								pluginPath.join(packageFolder, `../${package.name}`); // When we are already in the webApp and we need flat dependencies;						
							
							if (ctx.isCustomized === true && (dependencyName.startsWith("cmf.core") || dependencyName.startsWith("cmf.mes")) && ctx.type !== "webApp") {								
								package.path = webAppLink;									
							} else {
								package.path = fs.existsSync(internalLink) ? internalLink : webAppLink;	
							}						

							// Avoid duplicates and do not allow linking cmf packages in customized web apps
							if (!(ctx.isCustomized === true && ctx.type === "webApp" && (package.name.startsWith("cmf.core") || package.name.startsWith("cmf.mes"))) && packagesToLink.some((packageToLink) => package.name === packageToLink.name) === false) {							
								packagesToLink.push(package);							
								createLinks(packagesToLink, package.path);
							}												
						})
					}
				}
			})(packagesToLink, ctx.baseDir);
			if (packagesToLink.length > 0) {
				// We need to delete the folder, otherwise the link won't come through
				if (ctx.isCustomized !== true || (ctx.isCustomized === true && ctx.type !== "webApp")) {	    		
					pluginDel.sync(packagesToLink.map((package) => ctx.baseDir + ctx.libsFolder + package.name), { force: true });	
				}			
				pluginExecute(packagesToLink.map((package)=>`mklink /j ${package.name} "${package.path}"`).join(" & "), { cwd: ctx.baseDir + ctx.libsFolder });	
				console.log(`${packagesToLink.length} packages linked.`);				
			}
			callback();
		} catch(ex) {
			console.error(ex);
			callback();
		}		
	}); 

     /**
     * Installation Task
     * Remarks: only needs to be run the first time or after a git pull
     */
    gulp.task('install', function (callback) {
		var taskArray = ['__npmInstall', '__copyLocalTypings', '__linkDependencies'];
		if (pluginYargs.clean) {
			taskArray.unshift('__cleanLibs');
		}
		// The best approach would be linking first and then make an "npm -i" but there is a bug on npm that steals the dependencies packages, so for instance, it would steal lbo's moment when installing cmf.core. We do it the other way arround to prevent this bug (https://github.com/npm/npm/issues/10343)
		seq(taskArray, callback);		
	});
};