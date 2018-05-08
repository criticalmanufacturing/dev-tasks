var path = require("path");
var utils = require("./utils");

module.exports = {
    /**
     * Run operation for Repository
     * 
     * @param rootDir {string} Root directory of the repository
     * @param dependencies {Array} Array of dependencies
     * @param framework {string} Framework name
     * @param packages {Array} Array of packages
     * @param apps {Array} Array of application names
     * @param operation {string} operation to run
     * @param callback {Function} Callback function to call at the end
     * @param buildFramework {boolean} Should we included the framework on the operation?
     * @param buildApps {boolean} Should we include the apps on the operation?
     */
    runOperation: function(rootDir, dependencies, framework, packages, apps, operation, callback, buildFramework = true, buildApps = true) {
        var self = this;

        var dependencyOperations = self.createOperations(path.join(rootDir, "dependencies"), dependencies, operation);

        utils.cmd.runMany(dependencyOperations, function() {            
            var frameworkOperations = [];
            if (buildFramework === true) {
                frameworkOperations = self.createOperations(path.join(rootDir, "src"), [framework], operation);
            }

            var packageOperations = frameworkOperations.concat(self.createOperations(path.join(rootDir, "src", "packages"), packages, operation));

            utils.cmd.runMany(packageOperations, function(){
                if (buildApps === true) {
                    var appsOperations = self.createOperations(path.join(rootDir, "apps"), apps, operation);
                    utils.cmd.runMany(appsOperations, callback);
                }else{
                    callback();
                }
            }, 4);
        });
    },

    /**
     * Create spawn operations
     * @param baseDir {string} Base directory
     * @param projects {Array} Projects to create the operations for
     * @param actions {Array} Actions to call for each project
     */
    createOperations: function(baseDir, projects, actions) {
        var pluginYargs = require('yargs').argv;

        if (!Array.isArray(actions)) { actions = [actions]; }
        if (!baseDir) throw new Error("baseDir cannot be null");
        if (!projects) throw new Error("Projects cannot be null");

        var args = [], operations = [];

        if(pluginYargs){
            var keys = Object.keys(pluginYargs);
            keys = keys.filter(function(key){
                return !(key.startsWith("_") || key.startsWith("$") || key === "gulpfile");
            });

            args = keys.map(function(key){
                return "--" + key;
            });
        }

        projects.forEach(function (project) {
            actions.forEach(function (action) {
                operations.push({
                    command: '\"' + process.execPath + '\"',
                    arguments: [path.join(__dirname, "../", "gulp", "bin", "gulp.js"), action].concat(args),
                    cwd: path.join(baseDir, project)
                });
            });
        });
        
        return operations;
    }
};