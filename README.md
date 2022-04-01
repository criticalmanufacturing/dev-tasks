CMF MES HTML Development Tasks
========= 

**@criticalmanufacturing/dev-tasks** is a set of reusable gulp tasks that enable CMF MES developers to jump start their projects by providing state-of-the-art tooling.

This package is meant to be used in conjunction with [html-starter](https://github.com/criticalmanufacturing/html-starter).

# Tasks available

## Repository root

### Install

```sh
$ gulp install [options]
```

Runs ```gulp install``` for each app, dependency or package within the repository.

#### Additional flags
The same as [package install additional flags](#additional-flags).

### Build

```sh
$ gulp build [options]
```

Runs ```gulp build``` for each app, dependency or package within the repository.

#### Additional flags
The same as [package build additional flags](#additional-flags).

### Start

```sh
$ gulp start [options]
```

Runs ```gulp start``` on the main app, configured within the ```gulpfile.js``` present at the repository root.

## Package

### Install

```sh
$ gulp install [options]
```

Install all package dependencies declared in ```package.json``` into the ```node_modules``` folder. 

#### Additional Flags

##### --link

Make symbolic links to another packages. Links are read from ```package.json``` file, under the property ```cmfLinkDependencies```.

This is active by default.

When importing, it will also link all links dependencies. Links with a lower deep-level will have more priority.

```json
// package.json file
{
    "name": "my-module",
    "cmfLinkDependencies": {
        "my-module-A": "file:../packages/my-module-A/"
    }
}
```

Use ```--no-link``` to disable this option.

##### --link-external
Make symbolic links to another packages outside the project dir.

This is active by default.

Use ```--no-link-external``` to disable this option.

### Build

```sh
$ gulp build [options]
```

Builds the package in developer mode (every typescript file is transpiled into a respective javascript file)

#### Additional Flags

##### --production
Builds the package in production mode (creates a bundle all i18n files, another for the metadata, and another with the remaining package code).

##### --dist
Should be used in conjunction with ```--production```. On top of the packages, it also generates typescript definition files and individual javascript transpiled files.

This flag should be used if the package is meant to be redistributed and extended by others.

##### --brotli
Should be used in conjunction with ```--production```. This option uses node.js' brotli implementation to compress both the `bundles` and `node_modules` directories present in the output ```/apps/``` directory and creates the corresponding `.br` files.

This is active by default compressing 200 files concurrently (see ```--parallel-brotli``` option).

Use ```--no-brotli``` to disable this option.

##### --parallel-brotli <number_of_parallel_files>
Is only taken in consideration when the ```--brotli``` option can be used. Determines the number of concurrent files being compressed at a time. 

It defaults to batches of 200 files. The batches are sequential and within each batch the files are compressed concurrently.

## App

### Start

```sh
$ gulp start [options]
```

Starts the application. By default starts on developer mode.

#### Additional Flags

##### --production
Starts the application in production mode.

# Additional Information

This package was developed during the [UX-FAB: Universal Experience for Advanced Fabs](http://www.criticalmanufacturing.com/en/r-d/ux-fab) project.

![Portugal2020](http://www.criticalmanufacturing.com/uploads/richtext/images/2017030610420258bd3cfa033c0.png)
