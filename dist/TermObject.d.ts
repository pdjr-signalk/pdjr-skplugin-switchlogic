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
export declare class TermObject {
    stream: any;
    type: TermType;
    instance: string | undefined;
    channel: string | undefined;
    path: string | undefined;
    methods: string[];
    message: string | undefined;
    onstate: string | undefined;
    offstate: string | undefined;
    comparator: string | undefined;
    value: string | undefined;
    onvalue: string | undefined;
    offvalue: string | undefined;
    constructor(term: string);
    isValid(): boolean;
    getStream(app: any, bacon: any): any;
}
