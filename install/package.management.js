var fs = require("fs"),
	pluginRename = require('gulp-rename'),
	pluginDel = require("del"),
	pluginExecute = require("child_process").exec,
	pluginExecuteSync = require("child_process").execSync,
	pluginfsExtra = require("fs-extra"),
	pluginPath = require('path'),
	pluginYargs = require('yargs'),
	gulpUtil = require("gulp-util");

// Disable --version parse for Yargs so that we can use --version for our own purposes.
pluginYargs.version(false);
pluginYargs = pluginYargs.argv;

// List of packages that are allowed to be linked outside the project
const EXTERNAL_LINK_IGNORE_LIST = [];
// name of package-lock.json file
const packageLockFile = "package-lock.json";

module.exports = function (gulpWrapper, ctx) {
	var gulp = gulpWrapper.gulp, seq = gulpWrapper.seq;

	var packagesToLink = [];

	var getDirectories = function (path) {
		try {
			var directory = fs.readdirSync(path);
			return directory.filter(function (file) {
				return fs.statSync(path + '/' + file).isDirectory();
			});
		} catch (e) { return []; }
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

				Object.getOwnPropertyNames(packageObj.cmfLinkDependencies).forEach(function (dependencyName) {
					const package = { name: dependencyName };

					/**
					 * We have 2 approaches to do links
					 * First try to validate for the direct link and link it.
					 * If it doesn't exist, try to link to a folder inside the package folder with the same name as the dependency
					 * In both scenarios, we should try to link to the target folder, not to another link.
					 */
					let internalLink = pluginPath.join(packageFolder, packageObj.cmfLinkDependencies[dependencyName].split("file:").pop());

					if (pathExistsAndIsNotLink(internalLink)) { // Link to the dependency directly
						package.path = internalLink;
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

	function CheckIfCommandExists(command) {
		pluginExecute(command, { cwd: ctx.baseDir }, function (error, stdout, stderr) {
			if (error instanceof Error) {
				console.error(`\nPlease make sure ${command} is installed in this machine.`);
				throw stderr;
			}
		});
	}

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
	gulp.task('__cleanLibs', function (callback) {
		pluginDel.sync([
			ctx.baseDir + ctx.libsFolder,
			ctx.baseDir + "package-lock.json", // NPM v5 generated file
			ctx.baseDir + "yarn.lock", // NPM v5 generated file
			// ctx.baseDir + "npm-shrinkwrap.json", // Uncomment this if needed
		], { force: true });
		callback();
	});

    /*
    * Installs all npm packages (public and private)
    */
	gulp.task('__npmInstall', function (callback) {
		const npm = ctx.__config && ctx.__config.__npm ? ctx.__config.__npm : "npm";
		var command = `${npm} ${pluginYargs.ci ? 'ci' : 'install'} --scripts-prepend-node-path=true`;

		if (!ctx.__verbose) {
			command = command + " --silent";
		}

		// Install production in webApp
		// Don't need dev dependencies here, just keep it small
		if (ctx.type === "webApp" || pluginYargs.production) {
			command = command + " --production";
		}

		try {
			pluginExecute(command, { cwd: ctx.baseDir }, function (error, stdout, stderr) {
				if (error instanceof Error) {
					console.error(stderr);
				}
				callback();
			});
		} catch (ex) {
			console.error(ex);
			callback();
		}
	});

	/**
	 * Installs all npm packages (public and private)
	 * Uses yarn package manager instead of npm package manager
	 */
	gulp.task('__yarnInstall', function (callback) {
		const yarn = ctx.__config && ctx.__config.__yarn ? ctx.__config.__yarn : "yarn";
		var command = `${yarn} install`;

		if (pluginYargs.flat) {
			command = command + " --flat";
		}

		// Install production in webApp
		// Don't need dev dependencies here, just keep it small
		if (ctx.type === "webApp" || pluginYargs.production) {
			command = command + " --production";
		}

		try {
			pluginExecute(command, { cwd: ctx.baseDir }, function (error, stdout, stderr) {
				if (error instanceof Error) {
					console.error(stderr);
				}
				callback();
			});
		} catch (ex) {
			console.error(ex);
			callback();
		}
	});

	/**
	 * Installs all npm packages (public and private)
	 * Determines whether it is to run npm install and dedupe its dependencies or to run npm ci
     */
	gulp.task('__installDependencies', function (callback) {
		var isToDedupe = false;
		const npm = ctx.__config && ctx.__config.__npm ? ctx.__config.__npm : "npm";
		var command = `${npm}`;
		if (!(pluginYargs.update || pluginYargs.rebuild)) {
			if (fs.existsSync(`${ctx.baseDir}/${packageLockFile}`)) {
				command += " ci";
			} else {
				command += " install";
				isToDedupe = true;
			}
		} else {
			command += " install";
			isToDedupe = true;
		}

		// Install production in webApp
		// Don't need dev dependencies here, just keep it small
		if (ctx.type === "webApp" || pluginYargs.production) {
			command = command + " --production";
		}
		command += ` --loglevel=${pluginYargs.loglevel || 'error'} --scripts-prepend-node-path=true`;
		/** 
		 * If we are running a npm install then it is necessary to dedupe
		 * So we add the 'npm dedupe' to the npm install command
		 */
		if (isToDedupe) {
			command += ` && ${npm} dedupe`;
		}

		try {
			const child = pluginExecute(command, { cwd: ctx.baseDir }, function (error) {
				if (error instanceof Error) {
					console.error(gulpUtil.colors.white.bgRed(">>>> FAILED: ") +
						gulpUtil.colors.black.bgRed(command)); // this line triggers the failure of the build step
				}
				callback();
			});
			// we are effectively redirecting stderr to stdout here. This allows us to print e.g. warnings without breaking a build
			child.stdout.on('data', data => gulpUtil.log(data.trim())); // we need to trim to avoid double LF
			child.stderr.on('data', data => gulpUtil.log(gulpUtil.colors.red(data.trim())));
		} catch (ex) {
			console.error(ex);
			callback();
		}
	});

    /*
     * Dedupe the libs installed by NPM
     */
	gulp.task('__dedupeLibs', function (callback) {
		try {
			pluginExecute(`${ctx.__config && ctx.__config.__npm ? ctx.__config.__npm : "npm"} dedupe --scripts-prepend-node-path=true`, { cwd: ctx.baseDir }, function (error, stdout, stderr) {
				if (error instanceof Error) {
					console.error(stderr);
				}
				callback();
			});
		} catch (ex) {
			console.error(ex);
			callback();
		}
	});


	/*
	* If there is a "local-typings" folder, then the typings inside are not available in their own npm packages or in the npm @types repository.
	* In these cases we copy each one to the according package. The ts compiler will pick it up there being called index.d.ts.
	*/
	gulp.task('__copyLocalTypings', function (callback) {
		try {
			// If we have an i18n module file we generate the bundle, otherwise, we skip it	    	
			if (fs.lstatSync(ctx.baseDir + "local-typings").isDirectory()) {
				var folders = getDirectories(ctx.baseDir + "local-typings");
				if (folders instanceof Array) {
					var promiseArray = [];
					folders.forEach(function (folder) {
						// Check if folder already exists
						try {
							if (fs.lstatSync(ctx.baseDir + ctx.libsFolder + folder).isDirectory()) {
								// Handle index.d.ts for typings
								promiseArray.push(new Promise((resolve, reject) => {
									gulp.src([ctx.baseDir + "local-typings/" + folder + "/" + folder + ".d.ts"])
										.pipe(pluginRename("index.d.ts"))
										.pipe(gulp.dest(ctx.baseDir + ctx.libsFolder + folder + "/"))
										.on('end', resolve);
								}));
							}
						} catch (error) {
							//folder does not exist
						}
					});
					if (promiseArray.length > 0) {
						Promise.all(promiseArray).then(() => {
							callback();
						});
						return;
					} else {
						callback();
						return;
					}
				}
			}
			else {
				callback();
				return;
			}
		} catch (error) {
			//folder does not exist
			callback();
		}
	});

	/**
	 * Recursively follows all dependencies defined in the cmfLinkDependencies object of the package.json. All nested dependencies get linked.
	 */
	gulp.task('__linkDependencies', function (callback) {
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
					scopedPackages.forEach(function (package) {
						packagesToLink.splice(packagesToLink.indexOf(package), 1); // Remove scoped packages
					});
				}

				packagesToLink.forEach(package => {
					if(process.platform === "win32"){
						pluginExecuteSync(`mklink /j ${package.name} "${package.path}"`, { cwd: ctx.baseDir + ctx.libsFolder });
					} else {
						pluginExecuteSync(`ln -s "${package.path}" ${package.name}`, { cwd: ctx.baseDir + ctx.libsFolder });
					} 
				});

				if (scopedPackages.length > 0) {
					scopedPackages.forEach(function (package) {
						// link each package moving to the right cwd
						let [scope, packageName] = package.name.split("/");
						const scopePath = pluginPath.join(ctx.baseDir, ctx.libsFolder, scope);
						if (!fs.existsSync(scopePath)) {
							// Ensure scope path exists
							fs.mkdirSync(scopePath);
						}
						if(process.platform === "win32"){
							pluginExecuteSync(`mklink /j ${packageName} "${package.path}"`, { cwd: scopePath });
						} else {
							pluginExecuteSync(`ln -s "${package.path}" ${packageName}`, { cwd: scopePath });
						} 
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
		} catch (ex) {
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
			pluginfsExtra.moveSync(configPathBk, pluginPath.join(ctx.baseDir, "package.json"), { overwrite: true });
		}
		callback();
	});

	gulp.task('__updateDependencies', function (callback) {

		const lockFile = pluginPath.join(ctx.baseDir, packageLockFile);
		
		// If there is no package-lock, just skip this step.
		if (!fs.existsSync(lockFile)) {
			callback();	
		}

		if (!ctx.__config || !ctx.__config.channel) {
			gulpUtil.log(gulpUtil.colors.red("Channel version not found on metadata."), gulpUtil.colors.yellow("Skipping dependencies update."));
			callback();
		}

		const packageLockContent = pluginfsExtra.readJSONSync(lockFile);

		const packagesToIgnore = {};
		if (packagesToLink) {
			packagesToLink.forEach((p) => packagesToIgnore[p.name] = "");
		}

		const dependencyNameMatch = (name) => {
			if (name.startsWith("cmf.") || name.startsWith("@criticalmanufacturing/")) {
				return true;
			}
			return false;
		};

		const dependencyList = {};
		const dependencySearch = (root) => {
			if (root.dependencies) {
				for (var k in root.dependencies) {
					var newRoot = root.dependencies[k];
					if (typeof newRoot !== "object") return;

					if (!(k in dependencyList) && !(k in packagesToIgnore) && dependencyNameMatch(k)) {
						
						dependencyList[k] = {
							version: newRoot.version
						};

					}

					dependencySearch(newRoot);
				}
			}
		};

		const dependencySet = (root) => {
			if (root.dependencies) {
				for (var k in root.dependencies) {
					var newRoot = root.dependencies[k];

					if (typeof newRoot !== "object") return;

					if (k in dependencyList) {
						Object.assign(root.dependencies[k], dependencyList[k]);

						delete root.dependencies[k].integrity;
						delete root.dependencies[k].resolved;
					}

					dependencySet(newRoot);
				}
			}
		};

		dependencySearch(packageLockContent);

		Object.keys(dependencyList).forEach((k) => {
			const node = dependencyList[k];

			const key = `${k}@${ctx.__config.channel}`;

			if (ctx.__verbose) {
				gulpUtil.log(gulpUtil.colors.gray("Fetching latest version for"), gulpUtil.colors.cyan(`${k}@${ctx.__config.channel}`));
			}

			const version = pluginExecuteSync(`npm show ${k}@${ctx.__config.channel} version`);
			node.version = version.toString().trim();

			if (ctx.__verbose) {
				gulpUtil.log(gulpUtil.colors.gray("New version for"), gulpUtil.colors.cyan(`${k}@${ctx.__config.channel}`), gulpUtil.colors.gray("is"), gulpUtil.colors.yellow(node.version));
			}
		});

		dependencySet(packageLockContent);

		pluginfsExtra.writeJSONSync(lockFile, packageLockContent);

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
		// The default package manager we use is npm so the default command to check if exists is set to npm.
		var commandToCheck = "npm -v";

		// Clean tasks
		if (pluginYargs.clean === true || pluginYargs.update || pluginYargs.rebuild) {
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

		if (pluginYargs.updateDependencies) {
			taskArray.push('__updateDependencies');
		}

		// Add tasks
		if (pluginYargs.yarn) {
			// If the --yarn option is passed then we set the command to be checked to yarn.
			commandToCheck = "yarn -v";
			taskArray.push('__yarnInstall');
		} else {
			taskArray.push('__installDependencies');
		}
		CheckIfCommandExists(commandToCheck);

		// taskArray.push('__dedupeLibs');
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
