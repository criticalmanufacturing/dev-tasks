var pluginExecute = require("child_process").exec;
var fileSystem = require("fs");
var path = require('path');

if (!String.prototype.endsWith) {
    String.prototype.endsWith = function (searchString, position) {
        var subjectString = this.toString();
        if (typeof position !== 'number' || !isFinite(position) || Math.floor(position) !== position || position > subjectString.length) {
            position = subjectString.length;
        }
        position -= searchString.length;
        var lastIndex = subjectString.indexOf(searchString, position);
        return lastIndex !== -1 && lastIndex === position;
    };
}

if(!String.prototype.startsWith){
    String.prototype.startsWith = function (prefix) {
        return this.indexOf(prefix, 0) !== -1;
    };
}

if(!Array.prototype.clean){
    Array.prototype.clean = function (deleteValue) {
        for (var i = 0; i < this.length; i++) {
            if (this[i] == deleteValue) {
                this.splice(i, 1);
                i--;
            }
        }
        return this;
    };
}

module.exports = {

    fs: {
        /**
         * Try get the content of a file.
         * 
         * @param path The file path to load
         * @return {object|null} The result of 'require(path)' or undefined when no file is found.
         */
        tryGetFileSync: function (path) {
            try {
                return require(path);
            } catch (err) {
                return undefined;
            }
        },
        
        /**
         * Try get the content of a file.
         * 
         * @param path The file path to load
         * @return {object|null} The result of JSON.parse(string) or undefined when no file is found.
         */
        tryGetJSONSync: function (path) {
            try {
                return JSON.parse(fileSystem.readFileSync(path, "utf8"));
            }catch(err) {
                return undefined;
            }
        },
        
        /**
         * Save Object to File
         * Note: if the file already exists, all its content will be replaced
         * 
         * @param {string} path Path of the file to save.
         * @param object Any JSON object
         * @param {function} callback Callback function.
         */
        saveObjectToFile: function (path, object, callback){
            if (object) {
                // if metadata is defined, save the file
                fileSystem.writeFile(path, JSON.stringify(object), function (err) {
                    if (err) {
                        callback(err);
                    } else {
                        callback();
                    }
                });

            }
        },

        /**
         * Get Directories of a given path
         * 
         * @param {string} srcpath Path to look into.
         * @returns {string[]} An array of directories paths. 
         */
        getDirectories: function getDirectories(srcpath) {
            try {
                return fileSystem.readdirSync(srcpath).filter(function (file) {
                    return fileSystem.statSync(path.join(srcpath, file)).isDirectory();
                });
            }
            catch (exception) {
                return [];
            }
        },

        /**
         * Check if a given path is a directory
         * 
         * @param {string} srcpath Path to look into.
         * @returns {boolean} True if path is a directory, false otherwise.
         */
        isDirectory: function isDirectory(srcpath) {
            try {        
                return fileSystem.statSync(srcpath).isDirectory();        
            }
            catch (exception) {
                return false;
            }
        }
    },

    cmd:
    {
        /**
        * Check if gulp is running with Administration privileges
        * 
        * @param function(boolean) callback Callback function
        */
        hasAdministrationPriviledges: function (callback) {
            pluginExecute('net session', function (result, stdout, stderr) {
                callback(result === null || result.code === 0);
            });
        },

        /**
         * Run a command.
         * Internally it uses node spawn.
         */
        run: function(cmd, callback) {
            var spawn = require('child_process').spawn;
            var command = spawn(
                cmd.command,
                cmd.arguments,
                {
                    cwd: cmd.cwd
                }
            );            

            var result = '';
            command.stdout.on('data', function(data) {                
                result += data.toString();
            });
            command.stderr.on('data', function(error) {
                console.error(error);   
                process.exit(-1);             
            });
            command.on('close', function(code) {
                console.log(result);
                if (code !== 0) {
                    process.exit(-1);
                    return;
                } 
                return callback(result);
            });
            command.on('error', function( err ){ console.error(err); process.exit(-1); })        
        },

        /**
         * Run Many commands at once.
         * @param commands {Array} Commands to run
         * @param callback {Function} Callback function to call at the end of the execution
         * @param chunk {number} How many parallel executions?
         */
        runMany: function(commands, callback, chunk) {
            if(!commands || !Array.isArray(commands) || commands.length < 1){
                callback();
            }

            // If chunk if not defined, then we run all commands in parallel
            if(!chunk){
                var total = commands.length;
                var current = 0;

                var finalize = function(j){
                    return function() {
                        current++;
                        if (current === total) {                            
                            callback();
                        }
                    }
                };                
                for(var i = 0; i < commands.length; i++){                
                    this.run(commands[i], finalize(i));
                }

            } else {
                // First device the commands in chunks
                var tempArray = []; // TempArray will be an array of arrays [[command1, command2], [command3, command4], ...]

                for (var i = 0, j = commands.length; i < j; i+=chunk) {
                    tempArray.push(commands.slice(i,i+chunk));
                }

                var self = this;
                var recursive = function(counter) {
                    self.runMany(tempArray[counter], function(){
                        if((counter + 1) < tempArray.length){
                            recursive(counter + 1);
                        }else{
                            callback();
                        }
                    });
                }

                recursive(0);
            }
        }
    }
}