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
/**
 * Class representing the type of a TermObject. In a proper programming
 * language this would be an enum.
 */
export declare class TermType {
    private name;
    static on: TermType;
    static off: TermType;
    static notification: TermType;
    static switch: TermType;
    static path: TermType;
    static undefined: TermType;
    constructor(name: string);
    getName(): string;
}
