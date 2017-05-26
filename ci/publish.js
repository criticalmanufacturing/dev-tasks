var args = require("yargs").argv;
var fs = require("fs");
var path = require("path");
var shell = require('shelljs');

// Read parameters
var sourceFolders = args._;
var tag = args.tag;
var versionCommand = args.version || "prerelease";

/** 
 * Helpers 
 */
function help() {
    console.log("---------------");
    console.log("NPM Publisher helper");
    console.log("---------------");
    console.log("Usage:");
    console.log("\t node publish <source-dir1> <source-dir2> ... --tag <publish-tag>");
    console.log("Options:");
    console.log("--version <level> - version increment level (see npm version)")
    console.log("");
}

/**
 * Main
 */

function main() {
    // Check if tag and sourceFolder exists
    if (sourceFolders == null || Array.isArray(sourceFolders) === false || sourceFolders.length === 0) {
        help();
        return process.exit(1);
    }

    if (tag == null) {
        help();
        return process.exit(1);
    }

    // Iterate over all sources
    sourceFolders.forEach(processSources);
}

function processSources(source) {
    // Check if source exists
    if (!fs.existsSync(source)) {
        return;
    }

    // Read folders inside source
    folders = fs.readdirSync(source);

    // For each folder, try to publish
    folders.map((f) => path.join(source, f)).forEach(publishPackage);
}

function publishPackage(source) {
    // Stop if there is no package.json available
    if (!fs.existsSync(path.join(source, "package.json"))) {
        return;
    }
    
    shell.pushd(source);
    shell.exec(`npm version ${versionCommand}`);
    shell.exec(`npm publish --tag=${tag}`);
    shell.popd();
}

main();