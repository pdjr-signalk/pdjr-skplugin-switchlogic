/**********************************************************************
 * Copyright 2020 Paul Reeve <preeve@pdjr.eu>
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you
 * may not use this file except in compliance with the License. You
 * may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or
 * implied. See the License for the specific language governing
 * permissions and limitations under the License.
 */

const TermType = require('./TermType.js');

module.exports = class TermObject {

  constructor(term) {
    var matches;
    this.stream = null;
    if ((term == null) || (term == "") || (term == "off") || (term == "false") || (term == "0")) {
      this.type = TermType.off;
    } else if ((term == "on") || (term == "true") || (term == "1")) {
      this.type = TermType.on;
    } else if ((matches = term.match(/^notifications\..*/)) !== null) {
      let parts = term.split(":");
      switch (parts.length) {
        case 4:
          this.description = parts[3];
        case 3:
          this.method = parts[2].split(/[\s|,]+/);
        case 2:
          this.state = parts[1];
        case 1:
          this.path = parts[0];
          this.type = TermType.notification;
          break;
        default:
          break;
      }
    } else if (((matches = term.match(/^\[(.+),(.+)\]$/)) !== null) && (matches.length == 3)) {
      this.type = TermType.switch;
      this.instance = matches[1];
      this.channel = matches[2];
      this.path = 'electrical.switches.bank.' + this.instance + '.' + this.channel + '.state';
    } else if (((matches = term.match(/^\[(.+)\]$/)) !== null) && (matches.length == 2)) {
      this.type = TermType.switch;
      this.channel = matches[1];
      this.path = 'electrical.switches.' + this.channel + '.state';
    } else if ((matches = term.match(/^.*$/)) !== null) {
      let parts = term.split(":");
      switch (parts.length) {
        case 3: //
          this.type = TermType.path;
          if (['eq','ne','lt','le','gt','ge'].includes(parts[1])) {
            this.comparator = parts[1];
            this.value = parts[2];
          } else {
            this.onvalue = parts[1];
            this.offvalue = parts[2];
          }
          break;
        case 2:
          this.type = TermType.path;
          this.comparator = 'eq';
          this.value = parts[1];
          break;
        default:
          break;
      }
      this.path = parts[0];
    }
  }

  isValid() {
    return((this.type !== undefined))
  }

  getStream(app, bacon) {
    if ((this.type) && (this.stream == null)) {
      switch (this.type.getName()) {
        case "off":
          this.stream = bacon.constant(0)
            .doAction((x) => app.debug("off stream issuing %d", x));
          break;
        case "on":
          this.stream = bacon.constant(1)
            .doAction((x) => app.debug("on stream issuing %d", x));
          break
        case "notification":
          this.stream = app.streambundle.getSelfStream(this.path)
            .map((s, v) => ((v == null)?0:((v.state == s)?1:0)), this.state)
            .toProperty(0)
            .doAction((x) => app.debug("notification stream %s issuing %d", this.path, x));
          break;
        case "switch":
          this.stream = app.streambundle.getSelfStream(this.path)
            .toProperty(0)
            .doAction((x) => app.debug("switch stream %s issuing %d", this.path, x));
          break;
        case "path":
          if (this.value == null) {
            this.stream = app.streambundle.getSelfStream(this.path)
              .toProperty(0)
              .doAction((x) => app.debug("psth stream %s issuing %d", this.path, x));
          } else {
            switch (this.comparator) {
              case 'eq':
                this.stream = app.streambundle.getSelfStream(this.path).map((s,v) => {
                  return((v == null)?0:((v == s)?1:0));
                }, this.value);
                break;
              case 'ne':
                this.stream = app.streambundle.getSelfStream(this.path).map((s,v) => {
                  return((v == null)?0:((v != s)?1:0));
                }, this.value);
                break;
              case 'lt':
                this.stream = app.streambundle.getSelfStream(this.path).map((s,v) => {
                  return((v == null)?0:((v < s)?1:0));
                }, this.value);
                break;
              case 'le':
                this.stream = app.streambundle.getSelfStream(this.path).map((s,v) => {
                  return((v == null)?0:((v <= s)?1:0));
                }, this.value);
                break;
              case 'gt':
                this.stream = app.streambundle.getSelfStream(this.path).map((s,v) => {
                  return((v == null)?0:((v > s)?1:0));
                }, this.value);
                break;
              case 'ge':
                this.stream = app.streambundle.getSelfStream(this.path).map((s,v) => {
                  return((v == null)?0:((v >= s)?1:0));
                }, this.value);
                break;
              default:
                break; 
            }
          }
          break;
        default:
            break;
      }
      if (this.stream) {
        this.stream = this.stream.filter((v) => ((!isNaN(v)) && ((v == 0) || (v == 1)))).skipDuplicates();
      }
    }
    return(this.stream);
  }

}
 