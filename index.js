'use strict'
var path = require('path'),
    gutil = require('gulp-util'),
    through = require('through2'),
    handlebar = require('handlebars'),
    fs = require('fs'),
    execFile = require('child_process').execFile,
    requireUncached = require('require-uncached');

/*
 * Global variables
 *
 * gulpOptions: object of options passed in through Gulp
 * jasmineCSS: string path to the jasmine.css file for the specRunner.html
 * jasmineJS: array of string paths to JS needed for the specRunner.html
 * specPath: string path to the tmp specRunner.html to be written out to
 * specRunner: string path to the specRunner JS file needed in the specRunner.html
 **/
var gulpOptions = {},
    jasmineCss = path.join(__dirname, '/vendor/jasmine-2.0/jasmine.css'),
    jasmineJs = [
      path.join(__dirname, '/vendor/jasmine-2.0/jasmine.js'),
      path.join(__dirname, '/vendor/jasmine-2.0/jasmine-html.js'),
      path.join(__dirname, '/vendor/jasmine-2.0/console.js'),
      path.join(__dirname, '/vendor/jasmine-2.0/boot.js')
    ],
    specPath = path.join(__dirname, '/lib/specRunner.html'),
    specRunner = path.join(__dirname, '/lib/specRunner.js');

/**
  * Removes the specRunner.html file
  **/
function cleanup(path) {
  fs.unlink(path);
}

/**
  * Executes Phantom with the specified arguments
  * 
  * childArguments: Array of options to pass Phantom
  * [jasmine-runner.js, specRunner.html]
  **/
function runPhantom(childArguments, onComplete) {
    execFile('phantomjs', childArguments, function(error, stdout, stderr) {
      console.log(stdout);

      if (stderr !== '') {
          gutil.log('gulp-jasmine-phantom: Failed to open test runner ' + gutil.colors.blue(childArguments[1]));
          gutil.log(gutil.colors.red('error: '), stderr);
      }

      if(gulpOptions.keepRunner === undefined || gulpOptions.keepRunner === false) {
        cleanup(childArguments[1]);
      }
      onComplete();
    });
}

/*
 * Reads in the handlebar template and creates a data HTML object in memory to create
 *
 * options: list of options that can be passed to the function
 *  files: paths to files being tested
 *  onComplete: callback to call when everything is done
 **/
function compileRunner(options) {
  var filePaths = options.files || [],
      onComplete = options.onComplete || {};
  fs.readFile(path.join(__dirname, '/lib/specRunner.handlebars'), 'utf8', function(error, data) {
    if (error) throw error;

    // Create the compile version of the specRunner from Handlebars
    var specData = handlebar.compile(data),
        specCompiled = specData({
          files: filePaths, 
          jasmine_css: jasmineCss, 
          jasmine_js: jasmineJs,
          spec_runner: specRunner 
        });
    
    if(gulpOptions.keepRunner !== undefined && typeof gulpOptions.keepRunner === 'string') {
      specPath = path.join(path.resolve(gulpOptions.keepRunner), '/specRunner.html');
    }

    fs.writeFile(specPath, specCompiled , function(error) {
      if (error) throw error;
      
      if(gulpOptions.integration) {
        var childArgs = [
          path.join(__dirname, '/lib/jasmine-runner.js'),
          specPath 
        ];
        runPhantom(childArgs, onComplete);
      } else {
        onComplete();
      }
    });
  });
}

module.exports = function (options) {
  var filePaths = [],
      miniJasmineLib = require('minijasminenode2'),
      terminalReporter = require('./lib/terminal-reporter.js').TerminalReporter;
 
  gulpOptions = options || {};

  if(!!gulpOptions.integration) {
    return through.obj(
      function (file, encoding, callback) {
        if (file.isNull()) {
          callback(null, file);
          return;
        }
        if (file.isStream()) {
          callback(new gutil.PluginError('gulp-jasmine-phantom', 'Streaming not supported'));
        }
        filePaths.push(file.path);
        callback(null, file);
      }, function (callback) {
        gutil.log('Running Jasmine with PhantomJS');
        try {
          compileRunner({
            files: filePaths,
            onComplete: function() {
              callback(null);
            }    
          });
        } catch(error) {
          callback(new gutil.PluginError('gulp-jasmine-phantom', error));
        }
      } 
    );
  }

  return through.obj(
    function(file, encoding, callback) {
      if (file.isNull()) {
        callback(null, file);
        return;
      }
        
      if (file.isStream()) {
        callback(new gutil.PluginError('gulp-jasmine-phantom', 'Streaming not supported'));
        return;
      }
      miniJasmineLib.addSpecs(file.path);
      filePaths.push(file.path);
      callback(null, file);
    }, 
    function(callback) {
      var stream = this;
      gutil.log('Running Jasmine with minijasminenode2');
      try {
        miniJasmineLib.executeSpecs({
          reporter: terminalReporter,
          showColors: true,
          includeStackTrace: true,
          onComplete: function(passed) {
              if(gulpOptions.keepRunner) {
                compileRunner({
                  files: filePaths,
                  onComplete: function() {
                    callback(null);
                  }
                });
              } else {
                callback(null);
              }
          }
        });

      } catch(error) {
        callback(new gutil.PluginError('gulp-jasmine-phantom', error));
      }

    }
  );
};
