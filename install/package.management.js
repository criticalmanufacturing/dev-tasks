var fs = require("fs");
var pluginRename = require('gulp-rename');
var pluginDel = require("del");
var pluginExecute = require("child_process").exec;

module.exports = function (gulpWrapper, ctx) {	
    var gulp = gulpWrapper.gulp;
    var seq = gulpWrapper.seq;

	/*
	* We infer here that, if we have a "local-typings" folder, then the typings inside are not available in their own npm package or in the npm @types repository.
	* So we copy each one to the according package. The ts compiler will pick it up there being called index.d.ts.
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
	});

	gulp.task('__linkDependencies',  function (callback) {	
		//console.log(ctx.baseDir + ctx.libsFolder);
	    try {		    	
	    	process.chdir(ctx.baseDir);
			// Should be the other way arround
			pluginExecute('linklocal -r',function (err, stdout, stderr) { 
				// All dependencies have been copied, but we need to link all packages from the repo to avoid installing again on an update
				if (typeof stdout === "string") {
					var allDependencies = stdout.split("\n");
					if (allDependencies instanceof Array && allDependencies.length > 0) {					
						var commands = "";
						var foldersToDelete = [];						
						allDependencies.filter(function(dependencyRelativePath) {return dependencyRelativePath !== "";}).forEach(function(dependencyRelativePath) {						
							var dependencyName = dependencyRelativePath.split("\\").pop();																					
							if (dependencyName === "cmf.mes.lbos") {dependencyName = "cmf.lbos";}												
							var dependencyToDelete = dependencyName;									
							if (dependencyName === "@angular") {dependencyToDelete = "angular";}
							foldersToDelete.push(ctx.baseDir + ctx.libsFolder + dependencyToDelete);																				
							commands += 'mklink /j ' + dependencyName + ' "..\\' + dependencyRelativePath + '" & ';	
						});											
						// We need to delete the folder, otherwise the link won't come through
						pluginDel.sync(foldersToDelete, { force: true });	
						pluginExecute(commands, { cwd: ctx.baseDir + ctx.libsFolder });
					}
				}
				callback(); 
			});				  			
		}catch(ex) {
			console.log(ex);
			callback();
		}
	}); 

	gulp.task('__cleanLibs',  function (callback) {	
	    // If we clean the libsFolder, we alway get a clean install
		// There is an exception here, which is the webApp for customized projects. We can't delete the libs folder as we would be removing the UXFab release
		//>>>>>>>>>>>>>>>>Customization<<<<<<<<<<<<<<<<<<<<<<<<<
		if (ctx.isCustomized !== true || (ctx.isCustomized === true && ctx.type !== "webApp")) {	    		
			pluginDel.sync([ctx.baseDir + ctx.libsFolder], { force: true });	
		}
		callback();
	}); 

   
    /*
    * Install typings from npm @types
    */ 
    gulp.task('__npmInstall',  function (callback) {	
	    try {	
	    	process.chdir(ctx.baseDir);
			// Should be the other way arround
			pluginExecute('npm install --only=production', callback);
		}catch(ex) {
			console.error(ex);
			callback();
		}
	}); 

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
     * Installation Task
     * Remarks: only needs to be run the first time or after a git pull
     */
    gulp.task('install', function (callback) {
		// The best approach would be linking first and then make an "npm -i" but there is a bug on npm that steals the dependencies packages, so for instance, it would steal lbo's moment when installing cmf.core. We do it the other way arround to prevent this bug (https://github.com/npm/npm/issues/10343)
		seq(['__cleanLibs', '__npmInstall', '__copyLocalTypings', '__linkDependencies', ], callback);		
	});
};