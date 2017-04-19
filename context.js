var path = require("path");
var fs = require('fs');

module.exports = {
    /**
     * Will set the repo folder name acording to the running environment
     * 
     * @param repoFolderProperty {string} Name of the symbol that will represent the repo folder name
     * @param repoFolderName {string} Name of repo
     */
    updateContext: function(repoFolderProperty, repoFolderName) {        
        /** Update context.json with the current repository folder name. This can vary in the build agent, so we alwys depend on what we get. The context.json will hold all the folder names 
        that will be used by the install and build. This seems a clean enough way that will work in any use case  **/

        if (typeof repoFolderProperty === "string" && typeof repoFolderName === "string") {
            process.chdir(__dirname);                    
            var contextVariables = JSON.parse(fs.readFileSync('./context.json', 'utf8'));
            // We should receive which repository to configure as a parameter        
            if (contextVariables != null) {          
                contextVariables[repoFolderProperty] = repoFolderName;
                fs.writeFileSync('./context.json', JSON.stringify(contextVariables), 'utf8');
            }
        }
    }
};