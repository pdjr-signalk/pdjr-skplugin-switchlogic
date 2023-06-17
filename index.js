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
const Log = require("./lib/signalk-liblog/Log.js");
const Delta = require("./lib/signalk-libdelta/Delta.js");
const ExpressionParser = require("./lib/expression-parser/ExpressionParser.js");
const TermObject = require("./lib/term-object/TermObject.js");

const PLUGIN_ID = "switchlogic";
const PLUGIN_NAME = "pdjr-skplugin-switchlogic";
const PLUGIN_DESCRIPTION = "Apply binary logic over Signal K path values";
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
          },
          "usePut": {
            "title": "Update output via a put request rather than a delta",
            "type": "boolean"
          }
        },
        "required": [ "input", "output" ]
      }
    }
  },
  "required": [ "usePut", "rules" ],
  "default": {
    "usePut": [ "electrical.switches." ],
    "rules": []
  }
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

  const log = new Log(plugin.id, { ncallback: app.setPluginStatus, ecallback: app.setPluginError });
  const delta = new Delta(app, plugin.id);
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
    if (!options) {
      options = plugin.schema.default;
      log.N("using default configuration", false);
    }

    if ((options.rules) && (Array.isArray(options.rules)) && (options.rules.length > 0)) {
      
      log.N("started: operating %d rule%s", options.rules.length, ((options.rules.length == 1)?"":"s"), true);

      unsubscribes = (options.rules.filter((rule) => (rule.output != ""))).reduce((a, rule) => {
        log.N("enabling rule %s", rule.description, false);

        var description = rule.description || (rule.input + " => " + rule.output);
        var outputTermObject = new TermObject(rule.output);
        var usePut = ((options.usePut.reduce((a,prefix) => (a || ((outputTermObject.path) && (outputTermObject.path.startsWith(prefix)))), false)) || ((rule.usePut) && (rule.usePut === true)));
        
        var inputStream = expressionParser.parseExpression(rule.input);
        var outputStream = outputTermObject.getStream(app, bacon);
        
        app.debug("input stream = %s, output stream = %s", inputStream, outputStream);
 
        if ((inputStream) && (outputStream)) {
          a.push(inputStream.combine(outputStream, function(iv, ov) { 
            if ((iv == 1) && (ov == 0)) return(1);
            if ((iv == 0) && (ov != 0)) return(0);
            return(-1);
          }).onValue(action => {
            var value = undefined;
            switch (action) {
              case 0: // Switch output off.
                log.N("switching %s OFF", rule.description);
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
                    log.E("internal error - bad output type (%s) on rule %s", outputTermObject.type.getName(), description);
                    break;
                }
                if (value !== undefined) performAction(outputTermObject.path, value, usePut);
                break;
              case 1: // Switch output on. 
                log.N("switching %s ON", rule.description);
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
                    log.E("internal error - bad output type (%s) on rule %s", outputTermObject.type.getName(), description);
                    break;
                }
                if (value !== undefined) performAction(outputTermObject.path, value, usePut);
                break;
              default:
                break; 
            }
          }));
        } else {
          log.W("ignoring badly formed rule (%s)", rule.description);
        }
        return(a);
      }, []);
    } else {
      log.N("stopped: no rules are defined");
    }
  }

  plugin.stop = function() {
	  unsubscribes.forEach(f => f());
	  unsubscribes = [];
  }

  function performAction(path, value, usePut) {
    if (!usePut) {
      app.debug("issuing delta update (%s <= %s)", path, value);
      delta.clear().addValue(path, value).commit();
    } else {
      app.debug("issuing put request (%s <= %s)", path, value);
      app.putSelfPath(path, value, (d) => app.debug("put response: %s", JSON.stringify(d)));
    }
  }

  return(plugin);
}
