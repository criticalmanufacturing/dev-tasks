CMF MES HTML Development Tasks
========= 

**cmf.dev.tasks** is a set of reusable gulp tasks that enable CMF MES developers to jump start their projects by providing state-of-the-art tooling.

This package is meant to be used in conjunction with [html-starter](https://github.com/criticalmanufacturing/html-starter).

## Tasks available

### Repository root

#### Install

```
gulp install
```

Runs ```gulp install``` for each app, dependency or package within the repository.

#### Build

```
gulp build
```

Runs ```gulp build``` for each app, dependency or package within the repository.

##### Additional flags
The same as [package build additional flags](#additional-flags).

#### Start

```
gulp start
```

Runs ```gulp start``` on the main app, configured within the ```gulpfile.js``` present at the repository root.

### Package

#### Install

```
gulp install
```

Install all package dependencies declared in ```__bower.json``` into the ```node_modules``` folder. 

#### Build

```
gulp build
```

Builds the package in developer mode (every typescript file is transpiled into a respective javascript file)

##### Additional Flags

```
--production
```

Builds the package in production mode (creates a bundle all i18n files, another for the metadata, and another with the remaining package code).

```
--dist
```
Should be used in conjunction with ```--production```. On top of the packages, it also generates typescript definition files and individual javascript transpiled files.

This flag should be used if the package is meant to be redistributed and extended by others.

### App

#### Start

```
gulp start
```

Starts the application. By default starts on developer mode.

##### Additional Flags

```
--production
```

Starts the application in production mode.

## Additional Information

This package was developed during the [UX-FAB: Universal Experience for Advanced Fabs](http://www.criticalmanufacturing.com/en/r-d/ux-fab) project.

![Portugal2020](http://www.criticalmanufacturing.com/uploads/richtext/images/2017030610420258bd3cfa033c0.png)