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
        }
      }
    }
  }
};
const PLUGIN_UISCHEMA = {};

const OPTIONS_DEFAULT = {
  "rules": [
  ]
}

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
        return(s1.combine(s2, (a,b) => (a && b)));
      }
    },
    "or": {
      "arity": 2,
      "precedence": 1,
      "parser": function(s1,s2) {
        return(s1.combine(s2, (a,b) => (a || b)));
      }
    }
  });

  plugin.start = function(options) {
    if (Object.keys(options).length === 0) {
      options = OPTIONS_DEFAULT;
      app.savePluginOptions(options, () => { log.N("installing default configuration"); });
    }

    if ((options.rules) && (Array.isArray(options.rules))) {
      
      log.N("operating %d rule%s", options.rules.length, ((options.rules.length == 1)?"":"s"), true);

      unsubscribes = (options.rules || []).reduce((a, rule) => {
        var description = rule.description || "";
        var outputTermObject = new TermObject(rule.output);
        
        var inputStream = expressionParser.parseExpression(rule.input);
        var outputStream = outputTermObject.getStream(app, bacon);
        
        app.debug("input stream = %s, output stream = %s", inputStream, outputStream);
 
        if ((inputStream) && (outputStream)) {
          log.N("enabling rule %o", rule, false);
          a.push(inputStream.combine(outputStream, function(iv, ov) { 
            if ((iv == 1) && (ov == 0)) return(1);
            if ((iv == 0) && (ov != 0)) return(0);
            return(-1);
          }).onValue(action => {
            switch (action) {
              case 0: // Switch output off.
                log.N("switching " + description + " OFF");
                switch (outputTermObject.type.getName()) {
                  case "switch":
                    var path = "electrical.switches." + ((outputTermObject.instance === undefined)?"":("bank." + outputTermObject.instance + ".")) + outputTermObject.channel + ".state";
                    app.debug("issuing put request (%s <= %s)", path, 1);
                    app.putSelfPath(path, 1, (d) => app.debug("put response: %s", d.message));
                    break;
                  case "notification":
                    app.debug("issuing normal notification on %s", outputTermObject.path,);
                    delta.addValue(outputTermObject.path, { message: "OFF state", state: "normal", method: [] }).commit().clear();
                    break;
                  case "path":
                    if (outputTermObject.offvalue) {
                      app.debug("issuing put request (%s <= %s)", outputTermObject.path, outputTermObject.offvalue);
                      app.putSelfPath(outputTermObject.path + ".value", outputTermObject.offvalue, (d) => app.debug("put response: %s", d.message));
                    } else {
                      app.debug("cannot issue put request because offvalue is undefined");
                    }
                    break;
                  default:
                    log.E("internal error - bad output type (%s)", description);
                    break;
                }
                break;
              case 1: // Switch output on. 
                log.N("switching " + description + " ON");
                switch (outputTermObject.type.getName()) {
                  case "switch":
                    var path = "electrical.switches." + ((outputTermObject.instance === undefined)?"":("bank." + outputTermObject.instance + ".")) + outputTermObject.channel + ".state";
                    app.debug("issuing put request (%s <= %s)", path, 0);
                    app.putSelfPath(path, 0, (d) => app.debug("put response: %s", d.message));
                    break;
                  case "notification":
                    app.debug("issuing alert notification on %s", outputTermObject.path,);
                    delta.addValue(outputTermObject.path, { message: "ON state", state: "alert", method: [] }).commit().clear();
                    break;
                  case "path":
                    if (outputTermObject.onvalue) {
                      app.debug("issuing put request (%s <= %s)", outputTermObject.path, outputTermObject.onvalue);
                      app.putSelfPath(outputTermObject.path + ".value", outputTermObject.onvalue, (d) => app.debug("put response: %s", d.message));
                    } else {
                      app.debug("cannot issue put request because onvalue is undefined");
                    }
                    break;
                  default:
                    log.E("internal error - bad output type (%s)", description);
                    break;
                }
              default:
                break; 
            }
          }))
        } else {
          log.W("ignoring badly formed rule %o", rule);
        }
        return(a);
      }, []);
    } else {
      log.N("bad or missing configuration file");
    }
  }

  plugin.stop = function() {
	  unsubscribes.forEach(f => f());
	  unsubscribes = [];
  }

  return(plugin);
}
