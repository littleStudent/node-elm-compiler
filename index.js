'use strict';

var spawn = require('cross-spawn');
var _ = require('lodash');
var compilerBinaryName = 'elm-make';
var fs = require('fs');
var path = require('path');
var temp = require('temp').track();
var commandExists = require('command-exists');
var findAllDependencies = require('find-elm-dependencies').findAllDependencies;

var defaultOptions = {
  emitWarning: console.warn,
  spawn: spawn,
  cwd: undefined,
  pathToMake: undefined,
  yes: undefined,
  help: undefined,
  output: undefined,
  report: undefined,
  warn: undefined,
  debug: undefined,
  verbose: true,
  processOpts: undefined,
};

var supportedOptions = _.keys(defaultOptions);

function prepareSources(sources) {
  if (!(sources instanceof Array || typeof sources === 'string')) {
    throw 'compile() received neither an Array nor a String for its sources argument.';
  }

  return typeof sources === 'string' ? [sources] : sources;
}

function prepareOptions(options, spawnFn) {
  return _.defaults({ spawn: spawnFn }, options, defaultOptions);
}

function prepareProcessArgs(sources, options) {
  var preparedSources = prepareSources(sources);

  var compilerArgs = compilerArgsFromOptions(options, options.emitWarning);
  return preparedSources ? preparedSources.concat(compilerArgs) : compilerArgs;
}

function prepareProcessOpts(options) {
  var env = _.merge({ LANG: 'en_US.UTF-8' }, process.env);
  return _.merge(
    { env: env, stdio: 'inherit', cwd: options.cwd },
    options.processOpts,
  );
}

function runCompiler(sources, options, pathToMake) {
  console.log('runCompiler');
  if (typeof options.spawn !== 'function') {
    throw 'options.spawn was a(n) ' +
      typeof options.spawn +
      ' instead of a function.';
  }

  var processArgs = prepareProcessArgs(sources, options);
  var processOpts = prepareProcessOpts(options);
  console.log('processArgs: ', processArgs);
  console.log(['Running', pathToMake].concat(processArgs || []).join(' '));
  return options.spawn(pathToMake, processArgs, processOpts);
}

function handleCompilerError(err, pathToMake) {
  if (typeof err === 'object' && typeof err.code === 'string') {
    handleError(pathToMake, err);
  } else {
    console.error(
      'Exception thrown when attempting to run Elm compiler ' +
        JSON.stringify(pathToMake) +
        ':\n' +
        err,
    );
  }
  throw err;

  process.exit(1);
}

function compileSync(sources, options) {
  var optionsWithDefaults = prepareOptions(options, spawn.sync);
  var pathToMake = options.pathToMake || compilerBinaryName;

  try {
    return runCompiler(sources, optionsWithDefaults, pathToMake);
  } catch (err) {
    handleCompilerError(err, pathToMake);
  }
}

function compile(sources, options) {
  var optionsWithDefaults = prepareOptions(options, spawn);
  var pathToMake = options.pathToMake || compilerBinaryName;

  // console.log(optionsWithDefaults);
  // console.log(pathToMake);

  var results = spawn.sync('elm-make', ['./src/elm/Main1.elm', '--yes', '--debug', '--output', options.output], { stdio: 'inherit' });  
  console.log('results: ', results);

  try {
    return runCompiler(sources, optionsWithDefaults, pathToMake).on(
      'error',
      function(err) {
        console.log('ERROR', err);
        handleError(pathToMake, err);

        process.exit(1);
      },
    );
  } catch (err) {
    console.log(err);
    handleCompilerError(err, pathToMake);
  }
}

// write compiled Elm to a string output
// returns a Promise which will contain a Buffer of the text
// If you want html instead of js, use options object to set
// output to a html file instead
// creates a temp file and deletes it after reading
function compileToString(sources, options) {
  if (typeof options.output === 'undefined') {
    options.output = '.js';
  }

  commandExists('elm-make1', function(err, commandExists) {
      console.log('elm-make1 exisits: ', err)
      console.log('elm-make1 exisits: ', commandExists)
       if(commandExists) {
           // proceed confidently knowing this command is available 
       }
    
   });

  return new Promise(function(resolve, reject) {
    temp.open({ suffix: options.output }, function(err, info) {
      if (err) {
        return reject(err);
      }
      options.output = info.path;
      options.processOpts = { stdio: 'pipe' };
      console.log(sources);
      // console.log(options);
      var compiler = compile(sources, options);

      compiler.stdout.setEncoding('utf8');
      compiler.stderr.setEncoding('utf8');

      var output = '';
      compiler.stdout.on('data', function(chunk) {
        output += chunk;
      });
      compiler.stderr.on('data', function(chunk) {
        output += chunk;
      });
      compiler.on('message', function(a) {
        console.log('message: ', a);
      });
      // console.log('AAAA');
      // console.log(output);
      compiler.on('close', function(exitCode) {
        console.log('close:', output);
        if (exitCode !== 0) {
          return reject(new Error('Compilation failed\n' + output));
        } else if (options.verbose) {
          console.log(output);
        }

        fs.readFile(info.path, { encoding: 'utf8' }, function(err, data) {
          return err ? reject(err) : resolve(data);
        });
      });
    });
  });
}

function handleError(pathToMake, err) {
  console.log(err)
  if (err.code === 'ENOENT') {
    console.error(
      'Could not find Elm compiler "' + pathToMake + '". Is it installed?',
    );
  } else if (err.code === 'EACCES') {
    console.error(
      'Elm compiler "' +
        pathToMake +
        '" did not have permission to run. Do you need to give it executable permissions?',
    );
  } else {
    console.error(
      'Error attempting to run Elm compiler "' + pathToMake + '":\n' + err,
    );
  }
}

// Converts an object of key/value pairs to an array of arguments suitable
// to be passed to child_process.spawn for elm-make.
function compilerArgsFromOptions(options, emitWarning) {
  return _.flatten(
    _.map(options, function(value, opt) {
      if (value) {
        switch (opt) {
          case 'yes':
            return ['--yes'];
          case 'help':
            return ['--help'];
          case 'output':
            return ['--output', value];
          case 'report':
            return ['--report', value];
          case 'warn':
            return ['--warn'];
          case 'debug':
            return ['--debug'];
          default:
            if (supportedOptions.indexOf(opt) === -1) {
              emitWarning('Unknown Elm compiler option: ' + opt);
            }

            return [];
        }
      } else {
        return [];
      }
    }),
  );
}

module.exports = {
  compile: compile,
  compileSync: compileSync,
  compileWorker: require('./worker.js')(compile),
  compileToString: compileToString,
  findAllDependencies: findAllDependencies,
};
