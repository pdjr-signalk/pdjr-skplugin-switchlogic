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

import { TermType } from './TermType';

  /**
   * Return a TermObject by parsing a string representation.
   * 
   * A TermObject is a simple object containing fields derived from a
   * string which represents an operand in a boolean expression.
   * There are five types of operand, each with some common an some
   * unique protperties and each defined by a TermType.
   * 
   * type = TermType.off
   * ~~~~~~~~~~~~~~~~~~~
   * 
   * 
   * o 
   * @param {*} term - string representaion of an expression term.
   */

export class TermObject {

  public stream: any = undefined
  public type: TermType = TermType.undefined;
  public instance: string | undefined = undefined;
  public channel: string | undefined = undefined;
  public path: string | undefined = undefined;
  public methods: string[] = []
  public message: string | undefined = undefined;
  public onstate: string | undefined = undefined;
  public offstate: string | undefined = undefined;
  public comparator: string | undefined = undefined;
  public value: string | undefined = undefined;
  public onvalue: string | undefined = undefined;
  public offvalue: string | undefined = undefined;

  constructor(term: string) {
    var matches: RegExpMatchArray | null;

    this.stream = null;
    if ((term == null) || (term == "") || (term == "off") || (term == "false") || (term == "0")) {
      this.type = TermType.off;
    } else if ((term == "on") || (term == "true") || (term == "1")) {
      this.type = TermType.on;
    } else if (((matches = term.match(/^\[(.+),(.+)\]$/)) !== null) && (matches.length == 3)) {
      this.type = TermType.switch;
      this.instance = matches[1];
      this.channel = matches[2];
      this.path = 'electrical.switches.bank.' + this.instance + '.' + this.channel + '.state';
    } else if (((matches = term.match(/^\[(.+)\]$/)) !== null) && (matches.length == 2)) {
      this.type = TermType.switch;
      this.channel = matches[1];
      this.path = 'electrical.switches.' + this.channel + '.state';
    } else if ((matches = term.match(/^notifications\..*/)) !== null) {
      let parts = term.split(":");
      switch (parts.length) {
        case 5:
          this.methods = parts[4].split(",");
        case 4:
          this.message = parts[3];
        case 3:
          this.offstate = parts[2];
        case 2:
          this.onstate = parts[1];
        case 1:
          this.path = parts[0];
          this.type = TermType.notification;
          break;
        default:
          break;
      }
    } else if ((matches = term.match(/^.*$/)) !== null) {
      let parts = term.split(":");
      switch (parts.length) {
        case 3: //
          this.type = TermType.path;
          this.path = parts[0];
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
          this.path = parts[0];
          this.comparator = 'eq';
          this.value = parts[1];
          break;
        case 1:
          this.type = TermType.path;
          this.path = parts[0];
          break;
        default:
          break;
      }
    }
  }

  isValid(): boolean {
    return((this.type !== undefined))
  }

  getStream(app: any, bacon: any): any {
    if ((this.type) && (this.stream == null)) {
      switch (this.type.getName()) {
        case "off":
          this.stream = bacon.constant(0)
            .doAction((x: any) => app.debug("off stream issuing %d", x));
          break;
        case "on":
          this.stream = bacon.constant(1)
            .doAction((x: any) => app.debug("on stream issuing %d", x));
          break
        case "notification":
          this.stream = app.streambundle.getSelfStream(this.path)
            .map((s: any, v: any) => {
              if (v) {
                if (s) {
                  return((v.state == s)?1:0);
                } else {
                  return(1);
                }
              } else {
                return(0);
              }
            }, this.onstate)
            .toProperty(0)
            .doAction((x: any) => app.debug("notification stream %s issuing %d", this.path, x));
          break;
        case "switch":
          this.stream = app.streambundle.getSelfStream(this.path)
            .toProperty(0)
            .doAction((x: any) => app.debug("switch stream %s issuing %d", this.path, x));
          break;
        case "path":
          if (this.value == null) {
            this.stream = app.streambundle.getSelfStream(this.path)
              .toProperty(0)
              .doAction((x: any) => app.debug("path stream %s issuing %d", this.path, x));
          } else {
            switch (this.comparator) {
              case 'eq':
                this.stream = app.streambundle.getSelfStream(this.path).map((s: any,v: any) => {
                  return((v == null)?0:((v == s)?1:0));
                }, this.value);
                break;
              case 'ne':
                this.stream = app.streambundle.getSelfStream(this.path).map((s: any,v: any) => {
                  return((v == null)?0:((v != s)?1:0));
                }, this.value);
                break;
              case 'lt':
                this.stream = app.streambundle.getSelfStream(this.path).map((s: any,v: any) => {
                  return((v == null)?0:((v < s)?1:0));
                }, this.value);
                break;
              case 'le':
                this.stream = app.streambundle.getSelfStream(this.path).map((s: any,v: any) => {
                  return((v == null)?0:((v <= s)?1:0));
                }, this.value);
                break;
              case 'gt':
                this.stream = app.streambundle.getSelfStream(this.path).map((s: any,v: any) => {
                  return((v == null)?0:((v > s)?1:0));
                }, this.value);
                break;
              case 'ge':
                this.stream = app.streambundle.getSelfStream(this.path).map((s: any,v: any) => {
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
        this.stream = this.stream.filter((v: any) => ((!isNaN(v)) && ((v == 0) || (v == 1)))).skipDuplicates();
      }
    }
    return(this.stream);
  }

}
 