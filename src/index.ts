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

import * as bacon from 'baconjs'
import { ExpressionParser } from  './ExpressionParser'
import { TermObject } from './TermObject'

const PLUGIN_ID: string = 'switchlogic'
const PLUGIN_NAME: string = 'pdjr-skplugin-switchlogic'
const PLUGIN_DESCRIPTION: string = 'Apply binary logic over Signal K path values'
const PLUGIN_SCHEMA: any = {
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
const PLUGIN_UISCHEMA: any = {};

module.exports = function(app: any) {  

  var unsubscribes: any[] = [];
  var options: any;
  const expressionParser: ExpressionParser = new ExpressionParser({
    "operand": {
      "arity": 1,
      "precedence": 0,
      "parser": function(t: any) {
        return((new TermObject(t)).getStream(app, bacon));
      }
    },
    "not": {
      "arity": 1,
      "precedence": 3,
      "parser": function(s: any) {
        return(s.not());
      }
    },
    "and": {
      "arity": 2,
      "precedence": 2,
      "parser": function(s1: any, s2: any) {
        return(s1.combine(s2, (a: any, b: any) => {
          app.debug("and-ing %d and %d", a, b);
          return(a && b);
        }));
      }
    },
    "or": {
      "arity": 2,
      "precedence": 1,
      "parser": function(s1: any, s2: any) {
        return(s1.combine(s2, (a: any, b: any) => {
          app.debug("or-ing %d and %d", a, b);
          return(a || b);
        }));
      }
    }
  }, app);

  const plugin: SKPlugin = {

    id: PLUGIN_ID,
    name: PLUGIN_NAME,
    description: PLUGIN_DESCRIPTION,
    schema: PLUGIN_SCHEMA,
    uiSchema: PLUGIN_UISCHEMA,

    start: function(props: any) {
      options = { ...plugin.schema.properties.default, ...props };
      options.rules = props.rules.reduce((a: any, rule: any) => {
        try {
          var validRule: any = { ...plugin.schema.properties.rules.items.default, ...rule }
          if (!validRule.input) throw new Error("missing 'input' property");
          if (!validRule.output) throw new Error("missing 'output' property");
          a.push(validRule);
        } catch(e: any) { app.setPluginError(`Dropping rule (${e.message})`); }
        return(a);
      }, []);

      app.debug(`Using configuration: ${JSON.stringify(options, null, 2)}`);

      if ((options.rules) && (Array.isArray(options.rules)) && (options.rules.length > 0)) {      
      
        app.setPluginStatus(`Operating ${options.rules.length} rule${((options.rules.length == 1)?'':'s')}`);

        unsubscribes = (options.rules.filter((rule: any) => (rule.output != ""))).reduce((a: any, rule: any) => {
          app.debug(`enabling rule ${rule.description}`);

          var description: string = rule.description || (rule.input + " => " + rule.output);
          var outputTermObject: TermObject = new TermObject(rule.output);
          var usePut = ((options.usePut.reduce((a: any, prefix: any) => (a || ((outputTermObject.path) && (outputTermObject.path.startsWith(prefix)))), false)) || ((rule.usePut) && (rule.usePut === true)));
        
          var inputStream = expressionParser.parseExpression(rule.input);
          var outputStream = outputTermObject.getStream(app, bacon);
        
          app.debug(`input stream = ${inputStream}, output stream = ${outputStream}`);
 
          if ((inputStream) && (outputStream)) {
            a.push(inputStream.combine(outputStream, function(iv: any, ov: any) { 
              if ((iv == 1) && (ov == 0)) return(1);
              if ((iv == 0) && (ov != 0)) return(0);
              return(-1);
            }).onValue((action: any) => {
              var value: any = undefined;
              switch (action) {
                case 0: // Switch output off.
                  app.setPluginStatus(`switching ${rule.description} OFF`);
                  switch (outputTermObject.type.getName()) {
                    case "switch":
                      value = 0;
                      break;
                    case "notification":
                      if (outputTermObject.offstate) {
                        value = {
                          message: (outputTermObject.message)?(outputTermObject.message + " (OFF)"):"OFF state",
                          state: (outputTermObject.offstate)?outputTermObject.offstate:"normal",
                          method: (outputTermObject.methods)?outputTermObject.methods:[]
                        };
                      } else {
                        value = null;
                      }
                      break;
                    case "path":
                      value = (outputTermObject.offvalue)?outputTermObject.offvalue:0;
                      break;
                    default:
                      app.setPluginError(`internal error - bad output type (${outputTermObject.type.getName()}) on rule ${description}`);
                      break;
                  }
                  if (value !== undefined) performAction(outputTermObject.path, value, usePut);
                  break;
                case 1: // Switch output on. 
                  app.setPluginStatus(`switching ${rule.description} ON`);
                  switch (outputTermObject.type.getName()) {
                    case "switch":
                      value = 1;
                      break;
                    case "notification":
                      value = {
                        message: (outputTermObject.message)?(outputTermObject.message + " (ON)"):"ON state",
                        state: (outputTermObject.onstate)?outputTermObject.onstate:"normal",
                        method: (outputTermObject.methods)?outputTermObject.methods:[]
                      };
                      break;
                    case "path":
                      value = (outputTermObject.offvalue)?outputTermObject.offvalue:1;
                      break;
                    default:
                      app.setPluginError(`internal error - bad output type (${outputTermObject.type.getName()}) on rule ${description}`);
                      break;
                  }
                  if (value !== undefined) performAction(outputTermObject.path, value, usePut);
                  break;
                default:
                  break; 
              }
            }));
          } else {
            app.debug(`ignoring badly formed rule (${rule.description})`);
          }
          return(a);
        }, []);
      } else {
        app.setPluginError("configuration 'rules' property is missing or empty");
      }
    },

    stop: function() {
	    unsubscribes.forEach(f => f());
	    unsubscribes = [];
    }
  
  } // End of plugin

  function performAction(path: string | undefined, value: any, usePut: boolean) {
    if (!usePut) {
      app.debug(`issuing delta update (${path} <= ${value})`);
      app.notify(path, value, plugin.id);
    } else {
      app.debug(`issuing put request (${path} <= ${value})`);
      app.putSelfPath(path, value, (d: any) => app.debug(`put response: ${JSON.stringify(d)}`));
    }
  }

  return(plugin);
}

interface SKPlugin {
  id: string,
  name: string,
  description: string,
  schema: any,
  uiSchema: any,
  start: (options: any) => void,
  stop: () => void
}
