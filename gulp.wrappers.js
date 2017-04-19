var taskName = function(name, prefix)
{
  return (prefix ? prefix + '>' : '') + name;
}

module.exports = function(gulp, ctx)
{
    var pluginRunSequence = require('run-sequence').use(gulp);

  var seq = function(depSequence, callback) {
    var args = depSequence.map(function(dep) { return taskName(dep, ctx.prefix); });
    if (callback !== undefined) {
      args.push(callback);
    }
    return pluginRunSequence.apply(this, args);
  }

  var returnObj = Object.create(gulp);

  returnObj.task = function(name, deps, fn){
    if(typeof deps === "function")
    {
      fn = deps;
      deps = [];
    }

    gulp.task(
      taskName(name, ctx.prefix),
      deps.map(function(dep) { return taskName(dep, ctx.prefix); }),
      fn
    );
  };

  return {
    'gulp': returnObj,
    'seq': seq
  };

}
