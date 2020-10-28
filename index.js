/**********************************************************************
 * Copyright 2018 Paul Reeve <paul@pdjr.eu>
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

const fs = require('fs');
const bacon = require('baconjs');
const Log = require("./lib/signalk-liblog/Log.js");
const DebugLog = require("./lib/signalk-liblog/DebugLog.js");
const Schema = require("./lib/signalk-libschema/Schema.js");
const Notification = require("./lib/signalk-libnotification/Notification.js");
const ExpressionParser = require("./lib/expression-parser/ExpressionParser.js");

const PLUGIN_SCHEMA_FILE = __dirname + "/schema.json";
const PLUGIN_UISCHEMA_FILE = __dirname + "/uischema.json";
const PLUGIN_DEBUG_TOKENS = [ "rules", "actions" ];

module.exports = function(app) {
  var plugin = {};
  var unsubscribes = [];
  var switchbanks = {};

  plugin.id = "switchlogic";
  plugin.name = "Switch logic";
  plugin.description = "Apply binary logic over switch and notification states.";

  const log = new Log(plugin.id, { ncallback: app.setPluginStatus, ecallback: app.setPluginError });
  const debug = new DebugLog(plugin.id, PLUGIN_DEBUG_TOKENS);
  const notification = new Notification(app, plugin.id);
  const expressionParser = new ExpressionParser({
    "operand": { "arity": 1, "precedence": 0, "parser": function(t) { return(parseTerm(t, true).stream); } },
    "not":     { "arity": 1, "precedence": 3, "parser": function(s) { return(s.not()); } },
    "and":     { "arity": 2, "precedence": 2, "parser": function(s1,s2) { return(bacon.combineWith((a,b) => (a && b), [s1, s2])); } },
    "or":      { "arity": 2, "precedence": 1, "parser": function(s1,s2) { return(bacon.combineWith((a,b) => (a || b), [s1, s2])); } }
  });

  plugin.schema = function() {
    var schema = Schema.createSchema(PLUGIN_SCHEMA_FILE);
    return(schema.getSchema());
  };

  plugin.uiSchema = function() {
    var schema = Schema.createSchema(PLUGIN_UISCHEMA_FILE);
    return(schema.getSchema());
  }

  plugin.start = function(options) {
    log.N("operating %d rule%s", options.rules.length, (options.rules.length == 1)?"":"s");
    debug.N("*", "available debug tokens: %s", debug.getKeys().join(", "));

    unsubscribes = (options.rules || []).reduce((a, rule) => {
      var description = rule.description || "";
      var input = expressionParser.parseExpression(rule.input);
      var output = parseTerm(rule.output, true);
      if ((input !== null) && (output !== null) && (output.stream !== null)) {
        debug.N("rules", "enabling %o", rule);
        a.push(bacon.combineWith(function(iv,ov) { return((iv == ov)?-1:((iv > ov)?1:0)); }, [ input, output.stream ]).onValue(action => {
          if (action != -1) {
            log.N("switching " + description + " " + ((action)?"ON":"OFF"));
            switch (output.type) {
              case "switch":
                var path = "electrical.switches." + ((output.instance === undefined)?"":("bank." + output.instance + ".")) + output.channel;
                var deltas = { "path": path + ".control", "value": { "moduleid": output.instance, "channelid": output.channel, "state": action } };
                debug.N("actions", "issuing update %o", deltas);
                app.handleMessage(plugin.id, makeDelta(plugin.id, deltas));
                var putdelta = { "context": "vessels.self", "correlationId": "184743-434373-348483", "put": { "path": path, "source": plugin.id, "value": action } };
                app.handleMessage(plugin.id, putdelta);
                break;
              case "notification":
                if (action) {
                  notification.issue(output.path, output.description, output.state, output.method);
                  debug.N("actions", "issued %s notification on %s", output.state, output.path);
                } else {
                  notification.cancel(output.path);
                  debug.N("actions", "cancelled notification on %s", output.path);
                }
                break;
              default:
                log.E("internal error - bad output type");
                break;
            } 
          }
        }))
      } else {
        debug.N("rules", "ignoring rule %o", rule);
      }
      return(a);
    }, []);
  }

  plugin.stop = function() {
	unsubscribes.forEach(f => f());
	unsubscribes = [];
  }

  /********************************************************************
   * Parse <term> into structure that decodes and expands its implied
   * properties and especially its referenced key path. If that works,
   * and <openstream> is true, then attempt to create a data stream
   * for the decoded path. Return null if the parse fails.
   */

  function parseTerm(term, openstream = false) {
    var retval = null, matches, parts, stream;

    // Parse <term> into a <retval> structure or throw an exception.
    if ((term == null) || (term == "") || (term == "off") || (term == "false") || (term == "0")) {
      retval = {
        "type": "off",
        "stream": null
      };
    } else if ((term == "on") || (term == "true") || (term == "1")) {
      retval = {
        "type": "on",
        "stream": null
      };
    } else if ((matches = term.match(/^notifications\..*/)) !== null) {
      let parts = term.split(":");
      let path = parts[0];
      let state = (parts.length > 1)?((parts[1] == "")?null:parts[1]):null;
      let method = (parts.length > 2)?((parts[2] == "")?null:parts[2].split(/[\s|,]+/)):[];
      let description = (parts.length > 3)?((parts[3] == "")?null:parts[3]):null;
      retval = {
        "type": "notification",
        "stream": null,
        "path": path,
        "state": state,
        "method": method,
        "description": description
      };
    } else if ((matches = term.match(/^\[(.+),(.+)\]$/)) !== null) {
      retval = {
        "type": "switch",
        "stream": null,
        "path": "electrical.switches.bank." + matches[1] + "." + matches[2] + ".state",
        "instance": matches[1],
        "channel": matches[2]
      };
    } else if ((matches = term.match(/^\[(.+)\]$/)) !== null) {
      retval = {
        "type": "switch",
        "stream": null,
        "path": "electrical.switches." + matches[1] + ".state",
        "channel": matches[1]
      };
    }

    if ((retval) && (openstream)) {
      switch (retval.type) {
        case "off":
          retval.stream = bacon.constant(0);
          break;
        case "on":
          retval.stream = bacon.constant(1);
          break
        case "notification":
          retval.stream = app.streambundle.getSelfStream(retval.path).map((s,v) => {
            if (s == null) {
              return((v == null)?0:1);
            } else {
              return((v == null)?0:((v.state == s)?1:0));
            }
          }, retval.state);
          break;
        case "switch":
          retval.stream = app.streambundle.getSelfStream(retval.path);
          break;
        default:
          break; 
      }
      if (retval.stream) retval.stream = retval.stream.skipDuplicates();
    }

    return(retval);
  }

  /********************************************************************
   * Return a delta from <pairs> which can be a single value of the
   * form { path, value } or an array of such values. <src> gives the
   * name of the issuing entity.
   */

  function makeDelta(src, pairs = []) {
    pairs = (Array.isArray(pairs))?pairs:[pairs]; 
    return({
      "updates": [{
        "source": { "type": "plugin", "src": ((src)?src:"anon"), },
        "timestamp": (new Date()).toISOString(),
        "values": pairs.map(p => { return({ "path": p.path, "value": p.value }); }) 
      }]
    });
    console.log("%o", retval);
  }

  return(plugin);
}
