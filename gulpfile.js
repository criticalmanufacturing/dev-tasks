var gulp = require("gulp");
var pluginShell = require('gulp-shell');

gulp.task('link', function (callback) {
    return gulp.src('').pipe(pluginShell('npm link', { cwd: './' })).on('error', function (err) { callback(err) });
});

gulp.task('unlink', function (callback) {
    return gulp.src('').pipe(pluginShell('npm unlink', { cwd: './' })).on('error', function (err) { callback(err) });
});