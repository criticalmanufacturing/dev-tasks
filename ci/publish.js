var args = require("yargs").argv;
var fs = require("fs");
var path = require("path");
var shell = require('shelljs');
var exec = require('child_process').execSync;

// Read parameters
var sourceFolders = args._;
var tag = args.tag;
var version = args.version || "prerelease";
var appendVersion = args.append;
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
    console.log("\t --version=<level | version> \t version increment level (see npm version). Default: prerelease");
    console.log("\t --append \t\t\t if enabled, append given version to the current package version");
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

    // console.log("version", version);
    // console.log("append", appendVersion != null ? "true" : "false");
    // process.exit(0);

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

    // Update version
    var targetVersion = version;

    if (appendVersion) {
        // just append this to the current version
        var packageConfig = JSON.parse(fs.readFileSync(path.join(source, "package.json"), 'utf8'));
        targetVersion = `${packageConfig.version}-${version}`
    }

    exec(`npm version ${targetVersion}`, {cwd: source});

    // Publish
    exec(`npm publish --tag=${tag} --git-tag-version=false`);
}

main();