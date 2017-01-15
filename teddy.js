/*
 * 0.4.0 WIP
 *
 * things left unfinished marked with "TODO:" throughout codebase
 */

(function(global) {
  var teddy, // @namespace

      // private utility vars
      consoleWarnings,          // used to overload console.warn for the server-side error gui
      consoleErrors,            // used to overload console.error for the server-side error gui
      fs,                       // server-side filesystem module
      path,                     // server-side utility for manipulating  file paths
      contextModels = [],       // stores local models for later consumption by template logic tags
      baseModel = {},           // stores original model temporarily
      oldIE,                    // binary for whether or not the execution environment is old IE
      matchRecursive;           // see below


  /* matchRecursive
   * accepts a string to search and a format (start and end tokens separated by "...").
   * returns an array of matches, allowing nested instances of format.
   *
   * examples:
   *   matchRecursive("test",          "(...)")   -> []
   *   matchRecursive("(t(e)s)()t",    "(...)")   -> ["t(e)s", ""]
   *   matchRecursive("t<e>>st",       "<...>")   -> ["e"]
   *   matchRecursive("t<<e>st",       "<...>")   -> ["e"]
   *   matchRecursive("t<<e>>st",      "<...>")   -> ["<e>"]
   *   matchRecursive("<|t<e<|s|>t|>", "<|...|>") -> ["t<e<|s|>t"]
   *
   * (c) 2007 Steven Levithan <stevenlevithan.com>
   * MIT License
   */
  matchRecursive = (function() {
    var formatParts = /^([\S\s]+?)\.\.\.([\S\s]+)/,
        metaChar = /[-[\]{}()*+?.\\^$|,]/g;

    function escape (str) {
      return str.replace(metaChar, '\\$&');
    }

    function validateParts(p) {
      if (!p) {
        throw new Error('Format must include start and end tokens separated by \'...\'');
      }

      if (p[1] === p[2]) {
        throw new Error('Start and end format tokens cannot be identical');
      }
    }

    return function(str, format) {
      var p = formatParts.exec(format),
          opener,
          closer,
          iterator,
          results = [],
          openTokens,
          matchStartIndex,
          match;

      validateParts(p);
      opener = p[1];
      closer = p[2];
      // use an optimized regex when opener and closer are one character each
      iterator = new RegExp(format.length === 5 ? '['+escape(opener+closer)+']' : escape(opener)+'|'+escape(closer), 'g');

      do {
        openTokens = 0;
        while (match = iterator.exec(str)) {
          if (match[0] === opener) {
            if (!openTokens) {
              matchStartIndex = iterator.lastIndex;
            }
            openTokens++;
          }
          else if (openTokens) {
            openTokens--;
            if (!openTokens) {
              results.push(str.slice(matchStartIndex, match.index));
            }
          }
        }
      }
      while (openTokens && (iterator.lastIndex = matchStartIndex));

      return results;
    };
  })();


  teddy = {

    /**
     * public member vars
     */

    // default values for parameters sent to teddy
    params: {
      verbosity: 1,
      templateRoot: './',
      compileAtEveryRender: false,
      minify: false
    },

    // compiled templates are stored as object collections, e.g. { "myTemplate.html": "<p>some markup</p>"}
    compiledTemplates: {},

    /**
     * mutator methods for public member vars
     */

    // mutator method to set verbosity param. takes human-readable string argument and converts it to an integer for more efficient checks against the setting
    setVerbosity: function(v) {
      switch (v) {
        case 'none':
        case 0:
          v = 0;
          break;
        case 'verbose':
        case 2:
          v = 2;
          break;
        case 'DEBUG':
        case 3:
          v = 3;
          break;
        default: // concise
          v = 1;
      }
      teddy.params.verbosity = v;
    },

    // mutator method to set template root param; must be a string
    setTemplateRoot: function(v) {
      teddy.params.templateRoot = String(v);
    },

    // turn on or off the setting to compile templates at every render
    compileAtEveryRender: function(v) {
      teddy.params.compileAtEveryRender = Boolean(v);
    },

    // turn on or off the setting to minify templates using teddy's internal minifier
    enableMinify: function(v) {
      teddy.params.minify = Boolean(v);
    },

    // teddy's internal console logging system
    console: {
      warn: function(value) {
        console.warn(value);
        consoleWarnings += '<li>' + escapeHtmlEntities(value) + '</li>';
      },
      error: function(value) {
        console.error(value);
        consoleErrors += '<li>' + escapeHtmlEntities(value) + '</li>';
      }
    },

    /**
     * public methods
     */

    // compiles a template (removes {! comments !} and unnecessary whitespace)
    compile: function(template, name) {
      var fname = '', oldTemplate, comments, l, i;

      // remove templateRoot from template name if necessary
      if (!name) {
        name = template.replace(teddy.params.templateRoot, '');
      }

      // convert filepath into a template string if we're server-side
      if (fs) {
        try {
          if (fs.existsSync(template)) {
            fname = template;
          }
          else if (fs.existsSync(teddy.params.templateRoot + template)) {
            fname = teddy.params.templateRoot + template;
          }
          else {
            fname = teddy.params.templateRoot + '/' + template;
          }

          // attempt readFile
          template = fs.readFileSync(fname, 'utf8');
        }
        catch (e) {
          if (e.code !== 'ENOENT') {
            if (teddy.params.verbosity) {
              teddy.console.error('teddy.compile threw an exception while attempting to compile a template: ' + e);
            }
            return false;
          }
        }
      }

      // it's assumed that the argument is already a template string if we're not server-side
      else if (typeof template !== 'string') {
        if (teddy.params.verbosity > 1) {
          teddy.console.warn('teddy.compile attempted to compile a template which is not a string.');
        }
        return false;
      }

      // append extension if not present
      if (name.slice(-5) !== '.html') {
        name += '.html';
      }

      // remove {! comments !} and (optionally) unnecessary whitespace
      do {
        oldTemplate = template;

        if (teddy.params.minify) {
          template = template
            .replace(/[\f\n\r\t\v]*/g, '')
            .replace(/\s{2,}/g, ' ');
        }

        comments = matchRecursive(template, '{!...!}');
        l = comments.length;

        for (i = 0; i < l; i++) {
          template = template.replace('{!' + comments[i] + '!}', '');
        }
      }
      while (oldTemplate !== template);

      teddy.compiledTemplates[name] = template;
    },

    // parses a template
    render: function(template, model, callback) {

      // overload conosle logs
      consoleWarnings = '';
      consoleErrors = '';

      // needed because sigh
      // TODO: check if this is still necessary
      if (oldIE) {
        teddy.console.error('Teddy does not support client-side templating on IE9 or below.');
        return false;
      }

      // handle bad or unsupplied model
      if (!model || typeof model !== 'object') {
        model = {};
      }

      // express.js support
      if (model.settings && model.settings.views) {
        teddy.params.templateRoot = path.resolve(model.settings.views);
      }

      // store original copy of model so it can be reset after being temporarily modified
      baseModel = model; // parse/stringify copy appears unnecessary

      // remove templateRoot from template name if necessary
      template = template.replace(teddy.params.templateRoot, '');

      // compile template if necessary
      if (!teddy.compiledTemplates[template] || teddy.params.compileAtEveryRender) {
        teddy.compile(template);
      }

      // append extension if not present
      if (template.slice(-5) !== '.html') {
        template += '.html';
      }

      // declare vars
      var renderedTemplate = teddy.compiledTemplates[template],
          diff,
          loops = [],
          loopCount,
          loop,
          i,
          el,
          localModel,
          errors; // TODO: do something useful with this

      if (!renderedTemplate) {
        if (teddy.params.verbosity) {
          teddy.console.warn('teddy.render attempted to render a template which doesn\'t exist: ' + template);
        }
        return false;
      }

      function parseNonLoopedElements() {
        var outerLoops,
            outerLoopsCount;

        function replaceLoops(match) {
          loops.push(match);
          return '{' + loops.length + '_loop}';
        }

        do {
          diff = renderedTemplate;

          // find loops and remove them for now
          outerLoops = matchRecursive(renderedTemplate, '<loop...<\/loop>');
          outerLoopsCount = outerLoops.length;
          for (i = 0; i < outerLoopsCount; i++) {
            renderedTemplate = renderedTemplate.replace('<loop' + outerLoops[i] + '<\/loop>', replaceLoops);
          }

          // parse non-looped conditionals
          renderedTemplate = parseConditionals(renderedTemplate, model);

          // parse non-looped includes
          renderedTemplate = parseIncludes(renderedTemplate, model);
        }
        while (diff !== renderedTemplate); // do another pass if this introduced new code to parse
      }

      do {
        do {
          parseNonLoopedElements();

          // parse removed loops
          loopCount = loops.length;
          for (i = 0; i < loopCount; i++) {
            loop = loops[i];
            if (loop) {

              // try for a version of this loop that might have a data model attached to it now
              el = renderedTemplate.match(new RegExp('(?:{' + ( i + 1 ) + '_loop data-local-model=\\\'[\\S\\s]*?\\\'})'));

              if (el && el[0]) {
                el = el[0];
                localModel = el.split(' ');
                localModel = localModel[1].slice(0, -1);
                loop = loop.replace('>', ' ' + localModel + '>');
                renderedTemplate = renderedTemplate.replace(el, renderLoop(loop, model));
              }

              // no data model on it, render it vanilla
              else {
                renderedTemplate = renderedTemplate.replace('{' + (i + 1) + '_loop}', renderLoop(loop, model));
              }
              loops[i] = null; // this prevents renderLoop from attempting to render it again
            }
          }
        }
        while (diff !== renderedTemplate); // do another pass if this introduced new code to parse

        // clean up any remaining unnecessary <elseif>, <elseunless>, <else>, and orphaned <arg> tags
        renderedTemplate = renderedTemplate.replace(/(?:<elseif[\S\s]*?<\/elseif>|<elseunless[\S\s]*?<\/elseunless>|<else[\S\s]*?<\/else>|<arg[\S\s]*?<\/arg>)/g, '');

        // processes all remaining {vars}
        renderedTemplate = parseVars(renderedTemplate, model);
      }
      while (diff !== renderedTemplate); // do another pass if this introduced new code to parse

      // clean up temp vars
      contextModels = [];
      baseModel = {};

      // if we have no template and we have errors, render an error page
      if (!renderedTemplate && (consoleErrors || consoleWarnings)) {
        renderedTemplate = '<!DOCTYPE html><html lang=\'en\'><head><meta charset=\'utf-8\'><title>Could not parse template</title></head><body><h1>Could not parse template</h1>';
        if (consoleErrors) {
          renderedTemplate += '<p>The following errors occurred while parsing the template:</p>';
          renderedTemplate += '<ul>';
          renderedTemplate += consoleErrors;
          renderedTemplate += '</ul>';
        }
        if (consoleWarnings) {
          renderedTemplate += '<p>The following warnings occurred while parsing the template:</p>';
          renderedTemplate += '<ul>';
          renderedTemplate += consoleWarnings;
          renderedTemplate += '</ul>';
        }
        renderedTemplate += '</body></html>';
        consoleWarnings = '';
        consoleErrors = '';
      }

      // execute callback if present, otherwise simply return the rendered template string
      if (typeof callback === 'function') {
        if (!errors) {
          callback(null, renderedTemplate);
        }
        else {
          callback(errors, renderedTemplate);
        }
      }
      else {
        return renderedTemplate;
      }
    }
  };

  /**
   * private methods
   */

  // finds all <include> tags and renders them
  function parseIncludes(renderedTemplate, model) {
    var els = matchRecursive(renderedTemplate, '<include...<\/include>'),
        el,
        l = els ? els.length : 0,
        result,
        i;

    for (i = 0; i < l; i++) {
      el = '<include' + els[i] + '</include>';
      model = applyLocalModel(el, model);
      result = renderInclude(el, model);
      renderedTemplate = renderedTemplate.replace(el, result);
      model = baseModel; // restore original model
    }

    return renderedTemplate;
  }

  // finds all <if> and <unless> tags and renders them along with any related <elseif>, <elseunless>, and <else> tags
  function parseConditionals(renderedTemplate, model) {
    var conds,
        loopTypesLeft = true,
        findElses = true,
        condString,
        sibling,
        ifsDone = false,
        parts,
        elseCond,
        result,
        onelines,
        el,
        l,
        result,
        i;

    do {
      if (ifsDone) {
        conds = matchRecursive(renderedTemplate, '<unless ...<\/unless>');
        loopTypesLeft = false;
      }
      else {
        conds = matchRecursive(renderedTemplate, '<if ...<\/if>');
      }
      l = conds.length;

      for (i = 0; i < l; i++) {
        condString = conds[i];
        if (ifsDone) {
          condString = '<unless ' + condString + '<\/unless>';
        }
        else {
          condString = '<if ' + condString + '<\/if>';
        }
        parts = [condString];
        findElses = true;
        do {
          sibling = renderedTemplate.match(new RegExp(condString + '[\\s]*[\\S\\s]{12}'));
          if (sibling) {
            sibling = sibling[0];
            sibling = sibling.replace(condString, '');

            if (sibling.replace(/^\s+/, '').substring(0, 8) === '<elseif ') {
              elseCond = matchRecursive(renderedTemplate, condString + sibling + '...<\/elseif>');
              elseCond = elseCond ? sibling + elseCond[0].replace(condString, '') + '</elseif>' : null;
            }
            else if (sibling.replace(/^\s+/, '').substring(0, 12) === '<elseunless ') {
              elseCond = matchRecursive(renderedTemplate, condString + sibling + '...<\/elseunless>');
              elseCond = elseCond ? sibling + elseCond[0].replace(condString, '') + '</elseunless>' : null;
            }
            else if (sibling.replace(/^\s+/, '').substring(0, 6) === '<else>') {
              elseCond = matchRecursive(renderedTemplate, condString + sibling + '...<\/else>');
              elseCond = elseCond ? sibling + elseCond[0].replace(condString, '') + '</else>' : null;
            }
            else {
              findElses = false;
              elseCond = false;
            }

            if (elseCond) {
              parts.push(elseCond);
              condString += elseCond;
            }
            else {
              findElses = false;
            }
          }
          else {
            findElses = false;
          }
        }
        while (findElses);

        result = renderConditional(condString, parts, model);
        renderedTemplate = renderedTemplate.replace(condString, result);
      }
      ifsDone = true;
    }
    while (loopTypesLeft);

    // do one line ifs now...
    onelines = renderedTemplate.match(/[^<]*?if-[^>]+/g);
    l = onelines ? onelines.length : 0;

    for (i = 0; i < l; i++) {
      el = '<' + onelines[i] + '>';
      model = applyLocalModel(el, model);
      result = renderOneLineConditional(el, model);
      renderedTemplate = renderedTemplate.replace(el, result);
      model = baseModel; // restore original model
    }

    return renderedTemplate;
  }

  // finds alls {vars} in a given document and replaces them with values from the model
  function parseVars(docstring, model) {
    docstring = docstring.replace(/{[\S\s]*?}/g, replaceVar);

    function replaceVar(match) {
      var localModel,
          varname,
          ovarname,
          dots,
          numDots,
          curVar,
          doRender = false,
          d;

      if (!isNaN(match.charAt(1))) {
        return match; // don't parse variables that represent nested loops
      }

      match = match.substring(0, match.length - 1).substring(1); // remove first and last chars
      match = match.split(' ');
      localModel = match[1]; // the variable's local model (if any)
      varname = match[0]; // the variable's name (plus any flags)
      ovarname = varname;
      varname = varname.split('|s')[0]; // remove escape flag if present
      if (localModel) {
        model = applyLocalModel('{'+varname+' ' + localModel + '}', model);
      }
      dots = varname.split('.');
      numDots = dots.length;
      curVar = model;
      if (curVar) {
        doRender = true;
        for (d = 0; d < numDots; d++) {
          curVar = curVar[dots[d]];
          if (typeof curVar === 'undefined') {
            if (teddy.params.verbosity > 1) {
              teddy.console.warn('a {variable} was found with an invalid syntax: {' + varname + '}');
            }
            doRender = false;
            break;
          }
        }
      }
      else {
        if (teddy.params.verbosity > 1) {
          teddy.console.warn('a {variable} was found with an invalid syntax do to undefined model: {' + varname + '}');
        }
        doRender = false;
      }
      if (localModel) {
        model = baseModel;
      }

      if (doRender) {
        return renderVar('{' + ovarname + '}', ovarname, curVar);
      }
      else {
        return match;
      }
    }

    return docstring;
  }

  /**
   * Teddy render methods
   */

  // parses a single <include> tag
  function renderInclude(el, model) {
    var src, incdoc, args, argl, argname, argval, i, localModel;

    if (el) {
      src = getAttribute(el, 'src');
      if (!src) {
        if (teddy.params.verbosity) {
          teddy.console.warn('<include> element found with no src attribute. Ignoring element.');
        }
        return false;
      }
      else {

        // parse variables which may be included in src attribute
        src = parseVars(src, model);

        // append extension if not present
        if (src.slice(-5) !== '.html') {
          src += '.html';
        }

        // compile included template if necessary
        if (!teddy.compiledTemplates[src] || teddy.params.compileAtEveryRender) {
          teddy.compile(src);
        }

        // get the template as a string
        incdoc = teddy.compiledTemplates[src];
        if (!incdoc) {
          if (teddy.params.verbosity) {
            teddy.console.warn('<include> element found which references a nonexistent template ("' + src + '"). Ignoring element.');
          }
          return false;
        }
        localModel = getAttribute(el, 'data-local-model');

        // extend from the include's own local model
        if (localModel) {
          localModel = contextModels[parseInt(localModel)];
        }
        else {
          localModel = {};
        }

        args = el.match(/<arg[\S\s]*?<\/arg>/g);
        argl = args ? args.length : 0;
        for (i = 0; i < argl; i++) {
          argname = args[i].split('<arg ');
          argname = argname[1];
          argname = argname.split('>');
          argname = argname[0];

          if (!argname) {
            if (teddy.params.verbosity) {
              teddy.console.warn('<arg> element found with no attribute. Ignoring parent <include> element. (<include src="'+src+'">)');
            }
            return false;
          }

          argval = getInnerHTML(args[i]);

          // replace template string argument {var} with argument value
          incdoc = renderVar(incdoc, argname, argval, true);

          // add arg to local model
          localModel[argname] = argval;
        }

        if (argl) {
          // apply local model to child conditionals and loops
          incdoc = tagLocalModels(incdoc, localModel);
        }
        return incdoc;
      }
    }
    else {
      if (teddy.params.verbosity > 1) {
        teddy.console.warn('teddy.renderInclude() called for an <include> element that does not exist.');
      }
      return false;
    }
  }

  // finds all <include>, <if>, <elseif>, <unless>, <elseunless>, one line ifs, and <loop> tags and applies their local models
  function tagLocalModels(doc, extraModel) {
    doc = doc.replace(/(?:{[\S\s]*?}|<include[\S\s]*?>|<if[\S\s]*?>|<elseif[\S\s]*?>|<unless[\S\s]*?>|<elseunless[\S\s]*?>|<loop[\S\s]*?>|<[\S\s]if-[\S\s](?:="[\S\s]"|='[\S\s]')[\S\s](?:true=|false=)(?:="[\S\s]"|='[\S\s]')*?>)/g, addTag);

    function addTag(match) {
      var modelNumber = -1,
          localModel = getAttribute(match, 'data-local-model'),
          lastChar = match.charAt(match.length - 1);

      // get existing derivative
      if (localModel) {
        localModel = contextModels[parseInt(localModel)];
      }

      // possibly new derivative
      else {
        localModel = extraModel;
      }
      // check for duplicates
      modelNumber = contextModels.indexOf(localModel);

      // if no duplicates
      if (modelNumber < 0) {
        localModel = Object.assign(localModel, extraModel);
        modelNumber = contextModels.push(localModel);
        modelNumber--;
        return match.replace(lastChar, ' data-local-model=\'' + modelNumber + '\'' + lastChar);
      }
      else if (match.indexOf('data-local-model') === -1) {
        return match.replace(lastChar, ' data-local-model=\'' + modelNumber + '\'' + lastChar);
      }
      else {
        return match;
      }
    }

    return doc;
  }

  // retrieve local model from cache and apply it to full model for parsing
  function applyLocalModel(el, model) {
    var localModel = el.match(/data-local-model=\'[\S\s]*?\'/),
        i;

    if (localModel) {
      localModel = localModel[0];
      localModel = localModel.replace('data-local-model=\'', '');
      localModel = localModel.substring(0, localModel.length);
      localModel = contextModels[parseInt(localModel)];
      for (i in localModel) {
        model[i] = localModel[i];
      }
    }
    return model;
  }

  // parses a single loop tag
  function renderLoop(el, model) {
    if (el) {
      var key = getAttribute(el, 'key'),
          val = getAttribute(el, 'val'),
          collection = getAttribute(el, 'through'),
          collectionString = collection,
          loopContent,
          localModel,
          item,
          i,
          key,
          parsedLoop = '',
          nestedLoops = [],
          nestedLoopsCount;

      if (!val) {
        if (teddy.params.verbosity) {
          teddy.console.warn('loop element found with no "val" attribute. Ignoring element.');
        }
        return '';
      }
      if (!collection) {
        if (teddy.params.verbosity) {
          teddy.console.warn('loop element found with no "through" attribute. Ignoring element.');
        }
        return '';
      }

      model = applyLocalModel(el, model);
      collection = getNestedObjectByString(model, collection);

      if (!collection) {
        if (teddy.params.verbosity) {
          teddy.console.warn('loop element found with undefined value "' + collectionString + '" specified for "through" or "in" attribute. Ignoring element.');
        }

        // restore original model
        model = baseModel;

        return '';
      }
      else {
        loopContent = getInnerHTML(el);

        // process loop
        for (i in collection) {
          if (collection.hasOwnProperty(i)) {
            item = collection[i];
            localModel = {};

            // define local model for the iteration
            // if model[val] or model[key] preexist, they will be overwritten by the locally supplied variables
            if (key) {
              model[key] = i;
              localModel[key] = i;
            }
            model[val] = item;
            localModel[val] = item;
            parsedLoop += teddy.render(loopContent, model);
          }
        }

        // restore original model
        model = baseModel;

        nestedLoopsCount = nestedLoops.length;
        for (i = 0; i < nestedLoopsCount; i++) {
          parsedLoop = parsedLoop.replace(new RegExp('{' + (i + 1) + '_nestedLoop.*?}', 'g'), function(match) {
            var localModel = getAttribute(match, 'data-local-model'),
                nestedLoop = nestedLoops[i];
//console.log(nestedLoop);
            if (nestedLoop.indexOf(' data-local-model') === -1) {
              nestedLoop = nestedLoop.replace('>', ' data-local-model=\''+ localModel +'\'>');
            }
            return nestedLoop;
          });
        }

        return parsedLoop;
      }
    }
    else {
      if (teddy.params.verbosity > 1) {
        teddy.console.warn('teddy.renderLoop() called for a loop element that does not exist.');
      }
      return false;
    }
  }

  // parses a single <if> or <unless> tag and any related <elseif>, <elseunless>, and <else> tags
  function renderConditional(condString, parts, model) {
    var el = parts[0],
        satisfiedCondition = false,
        nextSibling = el;

    // add local vars to model
    model = applyLocalModel(el, model);

    while (!satisfiedCondition) {

      if (evalCondition(el, model)) {
        satisfiedCondition = true;
        return getInnerHTML(el);
      }
      else {
        do {
          nextSibling = parts[parts.indexOf(nextSibling) + 1];
          if (nextSibling && evalCondition(nextSibling, model)) {
            satisfiedCondition = true;
            return getInnerHTML(nextSibling);
          }
        }
        while (nextSibling);

        // restore original model
        model = baseModel;
        return false;
      }
    }
  }

  // parses a single one line conditional
  function renderOneLineConditional(el, model) {
    var conditionContent,
        parts = el.split(' if-'),
        part,
        l = parts.length,
        i,
        el = parts[0],
        flip = false,
        extraString = '';

    for (i = 1; i < l; i++) {
      part = parts[i];
      if (flip) {
        extraString += ' if-' + part;
      }
      else {
        el += ' if-' + part;
        flip = true;
      }
    }

    if (evalCondition(el, model)) {
      conditionContent = getAttribute(el, 'true');
    }
    else {
      conditionContent = getAttribute(el, 'false');
    }

    // remove conditionals from element
    el = removeAttribute(el, 'true');
    el = removeAttribute(el, 'false');

    // remove if-conditions at end of element
    el = el.replace(/(?: if-[\S]*?=(?:"[\S\s]*?"|'[\S\s]*?')>| if-[\S]*?>)/, '');
    if (el.charAt(el.length - 1) !== '>') {
      el += '>';
    }

    // remove if-conditions in middle of element
    el = el.replace(/(?: if-[\S]*?=(?:"[\S\s]*?"|'[\S\s]*?') | if-[\S]*? )/, ' ');

    // append condition content to element
    el = el.slice(0, -1) + ' ' + conditionContent;

    // append additional one line content if any
    el += extraString;

    if (el.charAt(el.length - 1) !== '>') {
      el += '>';
    }

    // restore original model
    model = baseModel;

    return el;
  }

  // determines if a condition is true for <if>, <unless>, <elseif>, and <elseunless>, and one-liners
  function evalCondition(el, model) {
    el = el.trim();

    var conditionType,
        attrCount = 0,
        conditionAttr,
        attributes,
        length,
        i,
        condition,
        conditionVal,
        modelVal,
        curVar,
        dots,
        numDots,
        d,
        notDone = true,
        condResult,
        truthStack = [];

    conditionType = getNodeName(el);
    attributes = getAttributes(el);
    length = attributes.length;

    if (conditionType === 'else') {
      return true;
    }
    else if (conditionType !== 'if' && conditionType !== 'unless' && conditionType !== 'elseif' && conditionType !== 'elseunless') {

      // it's a one-liner
      conditionType = 'onelineif';
      for (i = 0; i < length; i++) {
        conditionAttr = attributes[i].split('=');
        if (conditionAttr[0].substr(0, 3) === 'if-') {
          conditionVal = conditionAttr[1];
          if (conditionVal) {
            conditionVal = conditionVal.substring(1, conditionVal.length - 1);
            conditionVal = parseVars(conditionVal, model);
          }
          conditionAttr = attributes[i].replace('if-', '');
          break;
        }
      }
      return evalStatement();
    }

    // regular conditional, could be multipart
    do {

      // examine each of the condition attributes
      conditionAttr = attributes[attrCount];
      if (conditionAttr) {
        condition = undefined;
        conditionVal = undefined;
        truthStack.push(evalStatement());
        attrCount++;
      }
      else {
        notDone = false;
        length = truthStack.length;
      }
    }
    while (notDone);

    function evalStatement() {
      conditionAttr = conditionAttr.split('=');
      condition = conditionAttr[0];

      var hasNotOperator;
      if (condition.substr(0, 4) === 'not:') {
        hasNotOperator = true;
        condition = condition.substring(4);
      }
      else {
        hasNotOperator = false;
      }

      if (condition === 'or' || condition === 'and' || condition === 'xor') {
        return condition; // this is a logical operator, not a condition to evaluate
      }

      if (conditionVal === undefined) {
        conditionVal = conditionAttr[1];
        if (conditionVal) {
          conditionVal = conditionVal.substring(1, conditionVal.length - 1);
          conditionVal = parseVars(conditionVal, model);
        }
        else {
          conditionVal = condition;
        }
      }

      dots = condition.split('.');
      numDots = dots.length;
      curVar = model;
      if (curVar) {
        for (d = 0; d < numDots; d++) {
          curVar = curVar[dots[d]];
        }
      }
      else {
        if (teddy.params.verbosity > 1) {
          teddy.console.warn('teddy.evalCondition() supplied an empty model');
        }
        return false;
      }
      modelVal = curVar;

      // force empty arrays and empty objects to be falsey (#44)
      if (modelVal && ((Array.isArray(modelVal) && modelVal.length === 0) || (typeof modelVal === 'object' && Object.keys(modelVal).length === 0 && modelVal.constructor === Object))) {
        modelVal = false;
      }

      if (conditionType === 'if' || conditionType === 'onelineif' || conditionType === 'elseif') {
        if (condition === conditionVal || (conditionType === 'onelineif' && 'if-' + condition === conditionVal)) {
          if (modelVal) {
            return hasNotOperator ? false : true;
          }
          else {
            return hasNotOperator ? true : false;
          }
        }
        else if (modelVal == conditionVal) {
          return hasNotOperator ? false : true;
        }
        else {
          return hasNotOperator ? true : false;
        }
      }
      else {
        if (condition === conditionVal) {
          if (modelVal) {
            return hasNotOperator ? true : false;
          }
          else {
            return hasNotOperator ? false : true;
          }
        }
        else if (modelVal != conditionVal) {
          return hasNotOperator ? false : true;
        }
        else {
          return hasNotOperator ? true : false;
        }
      }
    }

    // loop through the results
    for (i = 0; i < length; i++) {
      condition = truthStack[i];
      condResult = condResult !== undefined ? condResult : truthStack[i - 1];
      if (condition === 'and') {
        condResult = Boolean(condResult && truthStack[i + 1]);
      }
      else if (condition === 'or') {
        condResult = Boolean(condResult || truthStack[i + 1]);
      }
      else if (condition === 'xor') {
        condResult = Boolean((condResult && !truthStack[i + 1]) || (!condResult && truthStack[i + 1]));
      }
    }

    return condResult !== undefined ? condResult : condition;
  }

  // replaces a single {var} with its value from a given model
  function renderVar(str, varname, varval, escapeOverride) {
    if (str) {

      // escape html entities
      if (varname.slice(-2) !== '|s' && varname.slice(-3) !== '|s`') {
        if (!escapeOverride) {
          varval = escapeHtmlEntities(varval);
        }
      }

      return str.replace(new RegExp('{' + varname.replace(/\|/g, '\\|') + '}', 'g'), varval);
    }
    else {
      if (teddy.params.verbosity > 1) {
        teddy.console.warn('an empty string was passed to teddy.renderVar.');
      }
    }
  }


  /**
   * private utility methods
   */

  // gets nested object by string
  function getNestedObjectByString(o, s) {
    s = s.replace(/\[(\w+)\]/g, '.$1');  // convert indexes to properties
    s = s.replace(/^\./, ''); // strip leading dot
    var a = s.split('.'), n;
    while (a.length) {
      n = a.shift();
      if (n in o) {
        o = o[n];
      }
      else {
        return;
      }
    }
    return o;
  }

  // get all attributes of an element
  function getAttributes(el) {
    var attributes = el.split('>');
    attributes = attributes[0];
    attributes = attributes.substring(attributes.indexOf(' '));
    attributes = attributes.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g);
    return attributes;
  }

  // get a specific attribute from a given element
  function getAttribute(el, attr) {
    var i, l, a, match;
    match = el.match(new RegExp(attr + '=(\\\'.*?\\\'|\\".*?\\")'));

    if (!match) {
      return false;
    }

    l = match.length;
    for (i = 0; i < l; i++) {
      a = match[i];
      if (a && typeof a === 'string') {
        a = a.trim();
        if (a.substring(0, attr.length) === attr) {
          // got a match
          break;
        }
      }
    }
    if (!a) {
      return false;
    }
    else {
      a = a.substring(attr.length + 2).slice(0, -1);
      return a;
    }
  }

  // get a specific attribute from a given element
  function removeAttribute(el, attr) {
    var newEl = el.replace(new RegExp('(?: (?:' + attr + '(?: |>))| (?:' + attr + '=)(?:\\"([\\S\\s]*?)\\"|\\\'([\\S\\s]*?)\\\')(?: |>))'), ' ');
    if (newEl.charAt(newEl.length - 1) !== '>') {
      newEl = newEl.trim();
      newEl += '>';
    }
    return newEl;
  }

  // gets children of a given element
  function getInnerHTML(el) {
    el = el.trim();

    var nodeName = getNodeName(el);
    el = el.replace(new RegExp('<' + nodeName + '(?:>| [\\S\\s]*?>)'), '');
    el = el.substring(0, el.lastIndexOf('</' + nodeName + '>'));
    return el.trim();
  }

  // get an element's node name
  function getNodeName(el) {
    var nodeName = el.split(' ');
    nodeName = nodeName[0];
    nodeName = nodeName.split('>');
    nodeName = nodeName[0];
    nodeName = nodeName.substring(1, nodeName.length);
    return nodeName;
  }

  function escapeHtmlEntities(v) {
    if (v && typeof v === 'string') {
      return v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&#34;').replace(/'/g, '&#39;');
    }
    else {
      return v;
    }
  }

  // expose as a CommonJS module
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = teddy; // makes teddy requirable in server-side JS
    module.exports.__express = teddy.render; // express.js support

    if (require) {
      // server-side module dependencies
      fs = require('fs');
      path = require('path');
    }
  }

  // set env specific vars for client-side
  if (typeof document !== 'undefined' && typeof window !== 'undefined') {
    global.teddy = teddy;

    // test for old IE
    oldIE = document.createElement('p');
    oldIE.innerHTML = '<!--[if lte IE 9]><i></i><![endif]-->';
    oldIE = oldIE.getElementsByTagName('i').length === 1 ? true : false;

    if (!oldIE) {
      // IE does not populate console unless the developer tools are opened
      if (typeof console === 'undefined') {
        window.console = {};
        console.log = console.warn = console.error = function() {};
      }
    }
  }
})(this);
