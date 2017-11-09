var fs = require("fs");
var path = require("path");

module.exports = function (gulpWrapper, ctx) {
    // Get all files in this folder, except this one
    var files = fs.readdirSync(__dirname).filter(function(file) {
        return !file.endsWith("index.js") && fs.statSync(path.join(__dirname, file)).isFile();
    });

    // Require all files with given gulp and context
    for(var file of files) {
        if (file.endsWith(".js")) {
            require(path.join(__dirname, file))(gulpWrapper, ctx);
        }
    }
};