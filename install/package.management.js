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
	var gulp = gulpWrapper.gulp, seq = gulpWrapper.seq;

	var packagesToLink = [];

	var getDirectories = function (path) {
		try {
			var directory = fs.readdirSync(path);
            return directory.filter(function (file) {
                return fs.statSync(path + '/' + file).isDirectory();
            });
		} catch (e) {return [];}
	};

	var pathExistsAndIsNotLink = function pathExistsAndIsNotLink(path) {
		path = pluginPath.normalize(path);
		if (fs.existsSync(path)) {
			var stat = fs.statSync(path);
			return stat.isDirectory();
		}
		return false;
	};

	var getPackagesToLink = function getPackagesToLink(packagesToLink, packageFolder) {
		const packageConfigPath = pluginPath.join(packageFolder, "package.json");
		if (fs.existsSync(packageConfigPath)) { // for instance @angular from Library has no package.json
			const packageObj = pluginfsExtra.readJsonSync(packageConfigPath);
			if (typeof packageObj.cmfLinkDependencies === "object") {
				const packagesToDiscover = [];

				Object.getOwnPropertyNames(packageObj.cmfLinkDependencies).forEach(function(dependencyName) {
					const package = { name: dependencyName };	

					/**
					 * We have 2 approaches to do links
					 * First try to validate for the direct link and link it.
					 * If it doesn't exist, try to link to the webApp folder (customization).
					 * In both scenarios, we should try to link to the target folder, not to another link.
					 */
					let internalLink = pluginPath.join(packageFolder, packageObj.cmfLinkDependencies[dependencyName].split("file:").pop());
					let webAppLink = pluginPath.join(packageFolder, `../../../apps/${ctx.packagePrefix}.web/${ctx.libsFolder}/${package.name}`);

					if (pathExistsAndIsNotLink(internalLink)) { // Link to the dependency directly
						package.path = internalLink;
					} else if (ctx.type !== "webApp" && pathExistsAndIsNotLink(webAppLink)) { // avoid to link to itself in the webApp
						package.path = webAppLink;
					} else if (pathExistsAndIsNotLink(pluginPath.join(packageFolder, `../${package.name}`))) {
						package.path = pluginPath.join(packageFolder, `../${package.name}`);
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
							gulpUtil.log("Skipping symlink", gulpUtil.colors.grey(package.path), "from", gulpUtil.colors.grey(package.name));
						}
						return;
					}

					// Check if this is an external link (out of this repository)
					// In this case, stops immediately
					if (pluginYargs.linkExternal === false) {
						if (
							!EXTERNAL_LINK_IGNORE_LIST.some(ignoreName => package.name.startsWith(ignoreName)) &&
							!package.path.toLowerCase().startsWith(ctx.__repositoryRoot.toLowerCase())
						) {
							if (ctx.__verbose) {
								gulpUtil.log("Skipping external symlink", gulpUtil.colors.grey(package.path), ctx.__repositoryRoot, package.name);
							}
							return;
						}
					}

					// Avoid duplicates and do not allow linking cmf packages in customized web apps
					if (packagesToLink.some((packageToLink) => package.name === packageToLink.name) === false) {
						if (ctx.__verbose) {
							gulpUtil.log("Symlink to", gulpUtil.colors.grey(package.path), "given by", gulpUtil.colors.grey(packageConfigPath));
						}
						packagesToLink.push(package);
						packagesToDiscover.push(package);
					}												
				});

				// After adding all packages of this level, let's discover the new ones
				// Only do this for webApps because it needs to search for other links to link to
				if (ctx.type === "webApp") {
					packagesToDiscover.forEach(package => getPackagesToLink(packagesToLink, package.path));
				}
			}
		}
	};

	/**
     * Removes stale files and directories. After this a new install is required.
     */
    gulp.task('purge', ['__cleanLibs'], function (callback) {
        pluginDel.sync([
			ctx.baseDir + ctx.metadataFileName,
            ctx.baseDir + "obj",
			ctx.baseDir + "bin"
		], { force: true });
		callback();
    });

	/**
	 * Cleans the libs folder allowing a clean install.
	 * This also needs to remove the previous package-lock for a clean install.
	 * There is an exception here, which is the webApp for customized projects. We can't delete the libs folder as we would be removing the HTML5 release.
	 */
	gulp.task('__cleanLibs',  function (callback) {	
		pluginDel.sync([
			ctx.baseDir + ctx.libsFolder,
			ctx.baseDir + "package-lock.json", // NPM v5 generated file
			// ctx.baseDir + "npm-shrinkwrap.json", // Uncomment this if needed
		], { force: true });
		callback();
	}); 

    /*
    * Installs all npm packages (public and private)
    */ 
    gulp.task('__npmInstall',  function(callback) {
		const npm = ctx.__config && ctx.__config.__npm ? ctx.__config.__npm : "npm";
		var command = `${npm} ${pluginYargs.ci ? 'ci' : 'install'} --scripts-prepend-node-path=true`;

		if (!ctx.__verbose) {
			command = command + " --silent";
		}

		// Install production in webApp
		// Don't need dev dependencies here, just keep it small
		if (ctx.type === "webApp") {
			command = command + " --production";
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
 			pluginExecute(`${ctx.__config && ctx.__config.__npm ? ctx.__config.__npm : "npm"} dedupe --scripts-prepend-node-path=true`, { cwd: ctx.baseDir }, function(error, stdout, stderr) {
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

			if (packagesToLink.length === 0) {
				// In case the task was called explicitly (not from install), get packages to link
				getPackagesToLink(packagesToLink, ctx.baseDir);
			}

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

	gulp.task('__removeLinkedDependencies', function (callback) {
		var configPath = pluginPath.join(ctx.baseDir, "package.json");
		var configPathBk = pluginPath.join(ctx.baseDir, "package.json.bk");

		// Read the package
		// If there is a backup, we should use it instead because there might be related with a previous failed installation
		var packageConfig = pluginfsExtra.readJSONSync(fs.existsSync(configPathBk) ? configPathBk : configPath);

		// Backup the package.json file
		if (!fs.existsSync(configPathBk)) {
			pluginfsExtra.copyFileSync(configPath, configPathBk);
		}
		
		// Remove from dependencies and optional dependencies all links
		packagesToLink.forEach(packageToLink => {
			if (packageConfig.dependencies) {
				delete packageConfig.dependencies[packageToLink.name];
			}
			if (packageConfig.optionalDependencies) {
				delete packageConfig.optionalDependencies[packageToLink.name];
			}
		});

		// Save back
		pluginfsExtra.writeJSONSync(configPath, packageConfig);
		callback();
	});

	gulp.task('__restorePackageConfig', function (callback) {
		var configPathBk = pluginPath.join(ctx.baseDir, "package.json.bk");
		// Restore the backed up file
		if (fs.existsSync(configPathBk)) {
			pluginfsExtra.moveSync(configPathBk, pluginPath.join(ctx.baseDir, "package.json"), {overwrite: true});
		}
		callback();
	});

     /**
     * Installation Task
     * Remarks: only needs to be run the first time or after a git pull
     */
    gulp.task('install', function (callback) {
		var taskArray = [];
		var link = pluginYargs.link == null || pluginYargs.link === true;
		var shouldRemoveLinksBeforeInstall = link && ctx.type !== "webApp";

		// Clean tasks
		if (pluginYargs.clean !== false) {
			taskArray.push('__cleanLibs');
		}

		// Compute the links before starting
		// This allow to manipulate the package.json file if needed
		if (link) {
			getPackagesToLink(packagesToLink, ctx.baseDir);
		}

		// When dealing with packages and links are enabled
		if (shouldRemoveLinksBeforeInstall) {
			taskArray.push('__removeLinkedDependencies');
		}

		// Add tasks
		taskArray.push('__npmInstall');
		// if (ctx.type === "webApp") {
			taskArray.push('__dedupeLibs');
		// }
		taskArray.push('__copyLocalTypings');

		// Restore the package.json file
		if (shouldRemoveLinksBeforeInstall) {
			taskArray.push('__restorePackageConfig');
		}

		// Link packages
		if (link) {
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
