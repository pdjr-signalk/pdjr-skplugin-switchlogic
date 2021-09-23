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

const bacon = require('baconjs');
const Log = require("./lib/signalk-liblog/Log.js");
const DebugLog = require("./lib/signalk-liblog/DebugLog.js");
const Schema = require("./lib/signalk-libschema/Schema.js");
const Notification = require("./lib/signalk-libnotification/Notification.js");
const ExpressionParser = require("./lib/expression-parser/ExpressionParser.js");

const PLUGIN_ID = "switchlogic";
const PLUGIN_NAME = "Switch logic processor";
const PLUGIN_DESCRIPTION = "Apply binary logic over Signal K path values";

const PLUGIN_SCHEMA_FILE = __dirname + "/schema.json";
const PLUGIN_UISCHEMA_FILE = __dirname + "/uischema.json";
const PLUGIN_DEBUG_TOKENS = [ "rules", "puts" ];

module.exports = function(app) {
  var plugin = {};
  var unsubscribes = [];
  var switchbanks = {};

  plugin.id = PLUGIN_ID;
  plugin.name = PLUGIN_NAME;
  plugin.description = PLUGIN_DESCRIPTION;

  const log = new Log(plugin.id, { ncallback: app.setPluginStatus, ecallback: app.setPluginError });
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
    if ((options) && (options.rules)) {
      log.N("operating %d rule%s", options.rules.length, (options.rules.length == 1)?"":"s");

      unsubscribes = (options.rules || []).reduce((a, rule) => {
        var description = rule.description || "";
        var input = expressionParser.parseExpression(rule.input);
        var output = parseTerm(rule.output, true);
        if ((input !== null) && (output !== null) && (output.stream !== null)) {
          app.debug("enabling %o", rule);
          a.push(bacon.combineWith(function(iv,ov) { return((iv == ov)?-1:((iv > ov)?1:0)); }, [ input, output.stream ]).onValue(action => {
            if (action != -1) {
              log.N("switching " + description + " " + ((action)?"ON":"OFF"));
              switch (output.type) {
                case "switch":
                  var path = "electrical.switches." + ((output.instance === undefined)?"":("bank." + output.instance + ".")) + output.channel;
                  app.debug("issuing put request (%s <= %s)", path, action);
                  app.putSelfPath(path + ".state", action, (d) => app.debug("put response: %s", d.message));
                  break;
                case "notification":
                  if (action) {
                    app.debug("issuing notification (%s:%s)", output.path, output.state);
                    notification.issue(output.path, output.description, output.state, output.method);
                  } else {
                    app.debug("cancelling notification (%s)", output.path);
                    notification.cancel(output.path);
                  }
                  break;
                case "path":
                  if (action) {
                    if (output.onvalue) {
                      app.debug("issuing put request (%s <= %s)", path, output.onvalue);
                      app.putSelfPath(path + ".value", output.onvalue, (d) => app.debug("put response: %s", d.message));
                    } else {
                      app.debug("cannot issue put request because onvalue is undefined");
                    }
                  } else {
                    if (output.offvalue) {
                      app.debug("issuing put request (%s <= %s)", path, output.offvalue);
                      app.putSelfPath(path + ".value", output.offvalue, (d) => app.debug("put response: %s", d.message));
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
      log.N("missing configuration file");
    }
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
      retval = { "type": "off" };
    } else if ((term == "on") || (term == "true") || (term == "1")) {
      retval = { "type": "on" };
    } else if ((matches = term.match(/^notifications\..*/)) !== null) {
      let parts = term.split(":");
      switch (parts.length) {
        case 1:
          retval = { 'type': 'notification', 'path': parts[0] };
          break;
        case 2:
          retval = { 'type': 'notification', 'path': parts[0], 'state': parts[1] };
          break;
        case 3:
          retval = { 'type': 'notification', 'path': parts[0], 'state': parts[1], 'method': parts[2].split(/[\s|,]+/) };
          break;
        case 4:
          retval = { 'type': 'notification', 'path': parts[0], 'state': parts[1], 'method': parts[2].split(/[\s|,]+/), 'description': parts[3] };
          break;
        default:
          log.E("error parsing term '%s'", term);
          break;
      };
    } else if ((matches = term.match(/^\[(.+),(.+)\]$/)) !== null) {
      retval = { "type": "switch", "path": "electrical.switches.bank." + matches[1] + "." + matches[2] + ".state", "instance": matches[1], "channel": matches[2] };
    } else if ((matches = term.match(/^\[(.+)\]$/)) !== null) {
      retval = { "type": "switch", "path": "electrical.switches." + matches[1] + ".state", "channel": matches[1] };
    } else if ((matches = term.match(/^.*$/)) !== null) {
      let parts = term.split(":");
      switch (parts.length) {
        case 2: // is "path:value"
          retval = { 'type': 'path', 'path': parts[0], 'value': parts[1], 'comparator': 'eq' };
          break;
        case 3: //
          if (['eq','ne','lt','le','gt','ge'].includes(parts[1])) {
            retval = { 'type': 'path', 'path': parts[0], 'value': parts[2], 'comparator': parts[1] };
          } else {
            retval = { 'type': 'path', 'path': parts[0], 'onvalue': parts[1], 'offvalue': parts[2] };
          }
          break;
        default:
          log.E("error parsing term '%s'", term);
          break;
      }
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
        case "path":
          if (retval.value == null) {
            retval.stream = app.streambundle.getSelfStream(retval.path);//.map(v) => { return((v == null)?0:((v == 1)?1:0)); };
          } else {
            switch (retval.comparator) {
              case 'eq': retval.stream = app.streambundle.getSelfStream(retval.path).map((s,v) => { return((v == null)?0:((v == s)?1:0)); }, retval.value); break;
              case 'ne': retval.stream = app.streambundle.getSelfStream(retval.path).map((s,v) => { return((v == null)?0:((v != s)?1:0)); }, retval.value); break;
              case 'lt': retval.stream = app.streambundle.getSelfStream(retval.path).map((s,v) => { return((v == null)?0:((v < s)?1:0)); }, retval.value); break;
              case 'le': retval.stream = app.streambundle.getSelfStream(retval.path).map((s,v) => { return((v == null)?0:((v <= s)?1:0)); }, retval.value); break;
              case 'gt': retval.stream = app.streambundle.getSelfStream(retval.path).map((s,v) => { return((v == null)?0:((v > s)?1:0)); }, retval.value); break;
              case 'ge': retval.stream = app.streambundle.getSelfStream(retval.path).map((s,v) => { return((v == null)?0:((v >= s)?1:0)); }, retval.value); break;
              default: break; 
            }
          }
        default:
          break;
      }
      if (retval.stream) retval.stream = retval.stream.filter((v) => ((!isNaN(v)) && ((v == 0) || (v == 1)))).skipDuplicates();
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
