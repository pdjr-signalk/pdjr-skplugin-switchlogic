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
const Notification = require("./lib/signalk-libnotification/Notification.js");
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
  const notification = new Notification(app, plugin.id);
  const expressionParser = new ExpressionParser({
    "operand": {
      "arity": 1,
      "precedence": 0,
      "parser": function(t) {
        app.debug("Executing operand parser on term %s", t);
        return((new TermObject(t)).getStream(app, bacon));
      }
    },
    "not": {
      "arity": 1,
      "precedence": 3,
      "parser": function(s) {
        app.debug("Executing NOT function on term %d", s);
        return((s === 0)?1:0);
      }
    },
    "and": {
      "arity": 2,
      "precedence": 2,
      "parser": function(s1,s2) {
        app.debug("Executing AND function on %d %d", s1, s2);
        return(bacon.combineWith((a,b) => ((a === 1) && (b === 1))?1:0, [s1, s2]));
      }
    },
    "or": {
      "arity": 2,
      "precedence": 1,
      "parser": function(s1,s2) {
        app.debug("Executing OR function on %d %d", s1, s2);
        return(bacon.combineWith((a,b) => ((a === 1) || (b === 1))?1:0, [s1, s2]));
      }
    }
  });

  plugin.start = function(options) {
    if (Object.keys(options).length === 0) {
      options = OPTIONS_DEFAULT;
      app.savePluginOptions(options, () => { log.N("installing default configuration"); });
    }

    if ((options.rules) && (Array.isArray(options.rules))) {
      
      log.N("operating %d rule%s", options.rules.length, (options.rules.length == 1)?"":"s");

      unsubscribes = (options.rules || []).reduce((a, rule) => {
        var description = rule.description || "";
        var outputTermObject = new TermObject(rule.output);
        var inputStream = expressionParser.parseExpression(rule.input);
        var outputStream = outputTermObject.getStream(app, bacon);

        if ((inputStream) && (outputStream)) {
          app.debug("enabling %o", rule);
          a.push(bacon.combineWith(function(iv, ov) { return((iv > ov)?1:((ov > iv)?0:-1)); }, [ inputStream, outputStream ]).onValue(action => {
            if (action !== -1) {
              log.N("switching " + description + " " + ((action === 1)?"ON":"OFF"));
              switch (outputTermObject.type.getName()) {
                case "switch":
                  var path = "electrical.switches." + ((outputTermObject.instance === undefined)?"":("bank." + outputTermObject.instance + ".")) + outputTermObject.channel + ".state";
                  app.debug("issuing put request (%s <= %s)", path, action);
                  app.putSelfPath(path, action, (d) => app.debug("put response: %s", d.message));
                  break;
                case "notification":
                  if (action) {
                    app.debug("issuing notification (%s <= %s)", outputTermObject.path, outputTermObject.state);
                    notification.issue(outputTermObject.path, outputTermObject.description, output.TermObject.state, outputTermObject.method);
                  } else {
                    app.debug("cancelling notification (%s)", outputTermObject.path);
                    notification.cancel(outputTermObject.path);
                  }
                  break;
                case "path":
                  if (action) {
                    if (outputTermObject.onvalue) {
                      app.debug("issuing put request (%s <= %s)", outputTermObject.path, outputTermObject.onvalue);
                      app.putSelfPath(outputTermObject.path + ".value", outputTermObject.onvalue, (d) => app.debug("put response: %s", d.message));
                    } else {
                      app.debug("cannot issue put request because onvalue is undefined");
                    }
                  } else {
                    if (outputTermObject.offvalue) {
                      app.debug("issuing put request (%s <= %s)", outputTermObject.path, outputTermObject.offvalue);
                      app.putSelfPath(outputTermObject.path + ".value", outputTermObject.offvalue, (d) => app.debug("put response: %s", d.message));
                    } else {
                      app.debug("cannot issue put request because offvalue is undefined");
                    }
                  }
                  break;
                default:
                  log.E("internal error - bad output type (%s)", description);
                  break;
              } 
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
