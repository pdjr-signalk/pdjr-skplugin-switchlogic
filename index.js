/**********************************************************************
 * Copyright 2018 Paul Reeve <preeve@pdjr.eu>
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you
 * may not use this file except in compliance with the License. You may
 * obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or
 * implied. See the License for the specific language governing
 * permissions and limitations under the License.
 */

const bacon = require('baconjs');
const MyApp = require('signalk-libapp/App.js');
const Log = require('signalk-liblog/Log.js');
const ExpressionParser = require('./lib/expression-parser/ExpressionParser.js');
const TermObject = require('./lib/term-object/TermObject.js');

const PLUGIN_ID = 'switchlogic';
const PLUGIN_NAME = 'pdjr-skplugin-switchlogic';
const PLUGIN_DESCRIPTION = 'Apply binary logic over Signal K path values';
const PLUGIN_SCHEMA = {
  "type": "object",
  "properties": {
    "usePut" : {
      "type": "array",
      "items": {
        "type": "string"
      }
    },
    "rules": {
      "title": "Rule definitions",
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "input": {
            "title": "Input expression",
            "type": "string"
          },
          "output": {
            "title": "Output target",
            "type": "string"
          },
          "description": {
            "title": "Description",
            "type": "string"
          }
        },
        "required": [ "input", "output" ],
        "default": { "description": "Not configured" }
      }
    }
  },
  "required": [ "rules" ],
  "default": { "usePut": [ "electrical.switches." ], "rules": [] }
};
const PLUGIN_UISCHEMA = {};

module.exports = function(app) {  

  var plugin = {};
  var unsubscribes = [];

  plugin.id = PLUGIN_ID;
  plugin.name = PLUGIN_NAME;
  plugin.description = PLUGIN_DESCRIPTION;
  plugin.schema = PLUGIN_SCHEMA;
  plugin.uiSchema = PLUGIN_UISCHEMA;
  plugin.App = new MyApp(app);

  const log = new Log(plugin.id, { ncallback: app.setPluginStatus, ecallback: app.setPluginError });
  const expressionParser = new ExpressionParser({
    "operand": {
      "arity": 1,
      "precedence": 0,
      "parser": function(t) {
        return((new TermObject(t)).getStream(app, bacon));
      }
    },
    "not": {
      "arity": 1,
      "precedence": 3,
      "parser": function(s) {
        return(s.not());
      }
    },
    "and": {
      "arity": 2,
      "precedence": 2,
      "parser": function(s1,s2) {
        return(s1.combine(s2, (a,b) => {
          app.debug("and-ing %d and %d", a, b);
          return(a && b);
        }));
      }
    },
    "or": {
      "arity": 2,
      "precedence": 1,
      "parser": function(s1,s2) {
        return(s1.combine(s2, (a,b) => {
          app.debug("or-ing %d and %d", a, b);
          return(a || b);
        }));
      }
    }
  }, app);

  plugin.start = function(options) {
    plugin.options = { ...plugin.schema.properties.default, ...options };
    plugin.options.rules = options.rules.reduce((a,rule) => {
      try {
        var validRule = { ...plugin.schema.properties.rules.items.default, ...rule }
        if (!validRule.input) throw new Error("missing 'input' property");
        if (!validRule.output) throw new Error("missing 'output' property");
        a.push(validRule);
      } catch(e) { log.W(`dropping rule (${e.message})`); }
      return(a);
    }, []);

    app.debug(`Using configuration: ${JSON.stringify(plugin.options, null, 2)}`);

    if ((plugin.options.rules) && (Array.isArray(plugin.options.rules)) && (plugin.options.rules.length > 0)) {      
      
      log.N(`operating ${plugin.options.rules.length} rule${((plugin.options.rules.length == 1)?'':'s')}`);

      unsubscribes = (options.rules.filter((rule) => (rule.output != ""))).reduce((a, rule) => {
        app.debug(`enabling rule ${rule.description}`);

        var description = rule.description || (rule.input + " => " + rule.output);
        var outputTermObject = new TermObject(rule.output);
        var usePut = ((options.usePut.reduce((a,prefix) => (a || ((outputTermObject.path) && (outputTermObject.path.startsWith(prefix)))), false)) || ((rule.usePut) && (rule.usePut === true)));
        
        var inputStream = expressionParser.parseExpression(rule.input);
        var outputStream = outputTermObject.getStream(app, bacon);
        
        app.debug(`input stream = ${inputStream}, output stream = ${outputStream}`);
 
        if ((inputStream) && (outputStream)) {
          a.push(inputStream.combine(outputStream, function(iv, ov) { 
            if ((iv == 1) && (ov == 0)) return(1);
            if ((iv == 0) && (ov != 0)) return(0);
            return(-1);
          }).onValue(action => {
            var value = undefined;
            switch (action) {
              case 0: // Switch output off.
                log.N(`switching ${rule.description} OFF`);
                switch (outputTermObject.type.getName()) {
                  case "switch":
                    value = 0;
                    break;
                  case "notification":
                    if (outputTermObject.offstate) {
                      value = {
                        message: (outputTermObject.message)?(outputTermObject.message + " (OFF)"):"OFF state",
                        state: (outputTermObject.offstate)?outputTermObject.offstate:"normal",
                        method: (outputTermObject.method)?outputTermObject.method:[]
                      };
                    } else {
                      value = null;
                    }
                    break;
                  case "path":
                    value = (outputTermObject.offvalue)?outputTermObject.offvalue:0;
                    break;
                  default:
                    log.E(`internal error - bad output type (${outputTermObject.type.getName()}) on rule ${description}`);
                    break;
                }
                if (value !== undefined) performAction(outputTermObject.path, value, usePut);
                break;
              case 1: // Switch output on. 
                log.N(`switching ${rule.description} ON`);
                switch (outputTermObject.type.getName()) {
                  case "switch":
                    value = 1;
                    break;
                  case "notification":
                    value = {
                      message: (outputTermObject.message)?(outputTermObject.message + " (ON)"):"ON state",
                      state: (outputTermObject.onstate)?outputTermObject.onstate:"normal",
                      method: (outputTermObject.method)?outputTermObject.method:[]
                    };
                    break;
                  case "path":
                    value = (outputTermObject.offvalue)?outputTermObject.offvalue:1;
                    break;
                  default:
                    log.E(`internal error - bad output type (${outputTermObject.type.getName()}) on rule ${description}`);
                    break;
                }
                if (value !== undefined) performAction(outputTermObject.path, value, usePut);
                break;
              default:
                break; 
            }
          }));
        } else {
          log.W(`ignoring badly formed rule (${rule.description})`);
        }
        return(a);
      }, []);
    } else {
      log.E("configuration 'rules' property is missing or empty");
    }
  }

  plugin.stop = function() {
	  unsubscribes.forEach(f => f());
	  unsubscribes = [];
  }

  function performAction(path, value, usePut) {
    if (!usePut) {
      app.debug(`issuing delta update (${path} <= ${value})`);
      plugin.App.notify(path, value, plugin.id);
    } else {
      app.debug(`issuing put request (${path} <= ${value})`);
      app.putSelfPath(path, value, (d) => app.debug(`put response: ${JSON.stringify(d)}`));
    }
  }

  return(plugin);
}
