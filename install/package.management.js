var fs = require("fs"),
	pluginRename = require('gulp-rename'), 
	pluginDel = require("del"), 
	pluginExecute = require("child_process").exec,
	pluginExecuteSync = require("child_process").execSync,
	pluginfsExtra = require("fs-extra"),
	pluginPath = require('path'),
	pluginYargs = require('yargs').argv,
	gulpUtil = require("gulp-util");

// List of packages that are allowed to be linked outside the project
const EXTERNAL_LINK_IGNORE_LIST = [];

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
			// ctx.baseDir + "npm-shrinkwrap.json", // Uncomment this if needed
			ctx.baseDir + "package-lock.json", // NPM v5 generated file
            ctx.baseDir + "obj",
            ctx.baseDir + "bin"], { force: true }, callback);
    });

	/**
	 * Cleans the libs folder allowing a clean install.
	 * This also needs to remove the previous package-lock for a clean install.
	 * There is an exception here, which is the webApp for customized projects. We can't delete the libs folder as we would be removing the HTML5 release.
	 */
	gulp.task('__cleanLibs',  function (callback) {	
		if (ctx.isCustomized !== true || (ctx.isCustomized === true && ctx.type !== "webApp")) {	    		
			pluginDel.sync([
				ctx.baseDir + ctx.libsFolder,
				ctx.baseDir + "package-lock.json", // NPM v5 generated file
			], { force: true });	
		}
		callback();
	}); 

    /*
    * Installs all npm packages (public and private)
    */ 
    gulp.task('__npmInstall',  function(callback) {
		const npm = ctx.__cmfDevTasksConfig && ctx.__cmfDevTasksConfig.__npm ? ctx.__cmfDevTasksConfig.__npm : "npm";
		var command = `${npm} ${pluginYargs.ci ? 'ci' : 'install'} --scripts-prepend-node-path=true`;

		if (!ctx.__verbose) {
			command = command + " --silent";
		}

		try {								
 			pluginExecute(command, { cwd: ctx.baseDir }, function(error, stdout, stderr) {
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
     * Dedupe the libs installed by NPM
     */ 
    gulp.task('__dedupeLibs',  function(callback) {	
		try {								
 			pluginExecute(`${ctx.__cmfDevTasksConfig && ctx.__cmfDevTasksConfig.__npm ? ctx.__cmfDevTasksConfig.__npm : "npm"} dedupe --scripts-prepend-node-path=true`, { cwd: ctx.baseDir }, function(error, stdout, stderr) {
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
						const packagesToDiscover = [];

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
							let internalLink = pluginPath.join(packageFolder, packageObj.cmfLinkDependencies[dependencyName].split("file:").pop());
							let webAppLink = pluginPath.join(packageFolder, `../../../apps/${ctx.packagePrefix}.web/${ctx.libsFolder}/${package.name}`);
							if (!ctx.isCustomized || !fs.existsSync(webAppLink)) {
								// When we are already in the webApp and we need flat dependencies
								webAppLink = pluginPath.join(packageFolder, `../${package.name}`);
							}
							
							if (ctx.isCustomized === true && (dependencyName.startsWith("cmf.core") || dependencyName.startsWith("cmf.mes")) && ctx.type !== "webApp") {								
								// Only apply webApp link if the path exists
								package.path = fs.existsSync(webAppLink) ? webAppLink : internalLink;
							} else {
								if (fs.existsSync(internalLink)) {
									package.path = internalLink;
								} else if (fs.existsSync(webAppLink)) {
									package.path = webAppLink;
								}	
							}

							// If there is no path, it means it was not possible to link, so it will be an invalid link
							if (package.path == null) {
								return;
							}

							// Normalize paths
							package.path = pluginPath.normalize(package.path);
							
							// Check if we're trying to link to itself and stop
							if (package.path.startsWith(pluginPath.normalize(ctx.baseDir))) {
								if (ctx.__verbose) {
									gulpUtil.log("Skipping symLink", gulpUtil.colors.grey(package.path), "from", gulpUtil.colors.grey(package.name));
								}
								return;
							}

							// Check if this is an external link (out of this repository)
							// In this case, stops immediately
							if (pluginYargs.linkExternal === false) {
								if (
									!EXTERNAL_LINK_IGNORE_LIST.some(ignoreName => package.name.startsWith(ignoreName)) &&
									!package.path.startsWith(ctx.__repositoryRoot)
								) {
									return;
								}
							}

							// Avoid duplicates and do not allow linking cmf packages in customized web apps
							if (
								!(ctx.isCustomized === true && ctx.type === "webApp" && (package.name.startsWith("cmf.core") || package.name.startsWith("cmf.mes")))
								&& packagesToLink.some((packageToLink) => package.name === packageToLink.name) === false
							) {
								packagesToLink.push(package);
								packagesToDiscover.push(package);
							}												
						});

						// After adding all packages of this level, let's discover the new ones
						packagesToDiscover.forEach(package => createLinks(packagesToLink, package.path));
					}
				}
			})(packagesToLink, ctx.baseDir);

			if (packagesToLink.length > 0) {	
				// check that node_modules does indeed exist. It may not if the only dependencies are links (common in customization)
				let nodeModulesPath = pluginPath.join(ctx.baseDir, "node_modules");
				if (!fs.existsSync(nodeModulesPath)) {
					fs.mkdirSync(nodeModulesPath)
				}
				
				pluginDel.sync(packagesToLink.map((package) => ctx.baseDir + ctx.libsFolder + package.name), { force: true });
				
				// In the future, we can use the npm link to link all packages
				// This is the best option, but there's still some issues
				// packagesToLink.filter(p => !p.name.startsWith("@")).forEach(package => {
				// 	pluginExecuteSync(`npm install ${package.path}`, { cwd: ctx.baseDir });
				// });

				// gulpUtil.log(`${packagesToLink.length} packages linked.`);

				// Let's extract the scoped packages and link them after the non scoped packages as we need to change the cwd
				let filterScopedPackages = (package) => package.name.startsWith("@") && package.name.includes("/");				
				let scopedPackages = packagesToLink.filter(filterScopedPackages);
				if (scopedPackages.length > 0) {
					scopedPackages.forEach(function(package){
						packagesToLink.splice(packagesToLink.indexOf(package), 1); // Remove scoped packages
					});
				}

				packagesToLink.forEach(package => pluginExecuteSync(`mklink /j ${package.name} "${package.path}"`, { cwd: ctx.baseDir + ctx.libsFolder }));
				
				if (scopedPackages.length > 0) {
					scopedPackages.forEach(function(package) {
						// link each package moving to the right cwd
						let [scope, packageName] = package.name.split("/");
						const scopePath = pluginPath.join(ctx.baseDir, ctx.libsFolder, scope);
						if (!fs.existsSync(scopePath)) {
							// Ensure scope path exists
							fs.mkdirSync(scopePath);
						}
						pluginExecuteSync(`mklink /j ${packageName} "${package.path}"`, { cwd: scopePath });	
					});
				}

				// Log all links created
				if (ctx.__verbose) {
					packagesToLink
						.concat(scopedPackages)
						.forEach(package => gulpUtil.log("New symLink:", gulpUtil.colors.grey(ctx.baseDir + ctx.libsFolder + package.name), "->", gulpUtil.colors.green(package.path)));
				}
				
				gulpUtil.log(`${packagesToLink.length + scopedPackages.length} packages linked.`);
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
		var taskArray = [];

		// Clean tasks
		if (pluginYargs.clean !== false) {
			taskArray.push('__cleanLibs');
		}

		// Add tasks
		taskArray.push('__npmInstall', '__dedupeLibs', '__copyLocalTypings');

		// Link packages
		if (pluginYargs.link == null || pluginYargs.link === true) {
			taskArray.push('__linkDependencies');
		}

		// The best approach would be linking first and then make an "npm -i" but there is a bug on npm that steals the dependencies packages, so for instance, it would steal lbo's moment when installing cmf.core. We do it the other way arround to prevent this bug (https://github.com/npm/npm/issues/10343)
		seq(taskArray, callback);		
	});

	/**
	 * Clean libs Task
	 */
	gulp.task('clean-libs', ['__cleanLibs']);
};
