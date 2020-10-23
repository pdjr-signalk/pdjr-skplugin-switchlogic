# signalk-switchlogic

Apply binary logic over switch and notification states.

This project implements a plugin for the
[Signal K Node server](https://github.com/SignalK/signalk-server-node).

Reading the [Alarm, alert and notification handling](http://signalk.org/specification/1.0.0/doc/notifications.html)
section of the Signal K documentation may provide helpful orientation.

__signalk-switchlogic__ processes a collection of user-defined rules
each of which consists of an *input expression* and an *output target*.

An *input expression* is a boolean expression whose operands are the
values of Signal K paths in either the "notification...." or
"electrical.switches...." trees.

An *output target* specifies both a Signal K path which should be
updated with the value of *input expression* and a mechanism through
which the update should be performed.

The update mechanism can be either a Signal K delta update of a path in
the "notifications..." or "electrical.switches...." trees or the
issuing of a *command* to a proxy application which will *inter-alia*
be responsible for updating the path specified by *output target*.

Commands are issued over a *control channel* which can be either a
Signal K notification path or an IPC socket and hence a proxy
application can be either another Signal K plugin or an application
outside of Signal K.

Two plugins which will directly accept *command*s from
__signalk-switchlogic__ are
[signalk-switchbank](https://github.com/preeve9534/signalk-switchbank#readme)
which translates *command*s into equivalent PGN 127502 Switch Bank Update
messages and so operates remote NMEA 2000 relay modules and
[signalk-devantech](https://github.com/preeve9534/signalk-devantech#readme)
which similarly operates relay modules connected by USB and ethernet.

## System requirements

__signalk-switchlogic__ has no special installation requirements.

## Installation

Download and install __signalk-switchlogic__ using the "Appstore" menu
option in your Signal K Node server console.
The plugin can also be obtained from the 
[project homepage](https://github.com/preeve9534/signalk-switchlogic)
and installed using
[these instructions](https://github.com/SignalK/signalk-server-node/blob/master/SERVERPLUGINS.md).

## Using the plugin

__signalk-switchlogic__ operates autonomously, but must be configured
before use.

The plugin configuration is stored in the file ```switchlogic.json```
and can be maintained using the Signal K plugin configuration GUI or by
directly editing the file using a text editor.

The general structure of the configuration file is illustrated below.
```
{
  "enabled": false,
  "enableLogging": false,
  "configuration": {
    "controlchannel": "notification:notifications.switchlogic.commands",
    "rules": [
      *** ONE OR MORE RULE DEFINITIONS ***
    ]
  }
}
```

The __controlchannel__ property value introduces a string which
specifies the control channel to which the plugin will write any
command output.
The supplied value must have the format "*channel-type*__:__*channel-id*",
where *channel-type* identifies the protocol to be used for
transferring commands and *channel-id* specifies the channel.
Possible values for *channel-type* and the required content for
*channel-id* are shown below.

| *channel-type*   | *channel-id*                             |
|:-----------------|:-----------------------------------------|
| __notification__ | A Signal K notification path.            |
| __ipc__          | An OS pathname specifying an IPC socket. |

The __rules__ property introduces an array which contains an arbitrary
number of rule definitions, for example:
```
    {
      "input": "[0,1]",
      "output": "[12,1]",
      "description": "Immersion heater 1kW"
    }
```

The __input__ property introduces a string value containing a boolean
*input expression*.
Operands in *input expression* refer to paths in the Signal K
"notifications...." and "electrical,switches...." trees and values
appearing on these paths become the value of the operands.
In the simple example given above, the expression result will just be
the values of the operand "[0,1]" which concisely specifies the Signal K
path "electrical.switches.bank.0.1.state".
There is a full explanation of *input expression* syntax below.

The __output__ property value specifies both the Signal K path that
should be updated with the value of *input expression* and also the
mechanism through which that update should occur.
The shorthand used in the example above says "update the value of the
switch bank path 'electrical.switches.bank.12.1.state'" and (by virtue
of the single brackets) "do this by writing a command to the *control
channel* specified by the __controlchannel__ property."
See below for a more complete discussion of valid __output__ property
values.
 
The __description__ property value supplies some text that will be
used to identify the rule in status and debug outputs.

### Input expression syntax

The simplest expression, as we saw in the above example, will consist
of just a single operand, but expressions can be arbitrarily complex.
These are the ground rules.

1. An operand must be:

1.1 A reference to a Signal K notification path of the form:

        *path[__:__*state*]

    If *state* is not specified then the operand will be true if a
    notification exists on *path*, otherwise false.
    If *state* is specified, then the operand will be true if a
    notification exists on *path* and its state property value is
    equal to *state*, otherwise false.

1.2 A reference to a Signal K switch path of the form:

    __[__[*b*__,__]*c*__]__

    If *b* is present, then the reference expands to the path
    "electrical.switches.bank.*b*.*c*.state".

    If *b* is absent, then the reference expands to the path
    "electrical.switches.*c*.state"

    In both cases the operand simply assumes the value of the expanded
    path (i.e. either 0 or 1).

1.3 One of the constant values "true" or "false".

2. The available operators are "and", "or" and "not";

3. Expressions can be disambiguated or clarified by the use of
   parentheses.

Examples of valid expressions are "[10,3]", "(not [10,4])" and
"[10,3] and notifications.tanks.wasteWater.0.level:alert".

### Output property values

There are three possible forms for an __output__ property value. 

1. Output to a notification path is specified by a string of the form:

   *path*[__:__[*state*][__:__[*method*][__:__[*description*]]]]

   Where *path* is a notification path, and *state*, *method* and
   *description* optionally set the corresponding properties of any
   issued notification. 
   If these options are not specified then they will default to
   "alert", [] and "Inserted by signalk-switchbank".

   A notification will be issued when the associated *input expression*
   resolves to 1 and cancelled when it resolves to 0.

2. Output to a switch path is specified by a string of the form:

   __[[__[*b*__,__]*c*__]]__

   which is expanded to a switch path as described for 1.2.

   The resolved value of the input expression will be written directly
   to the specified path.
   Note that if the specified path is associated with a physical input
   to Signal K, then both Signal K and the plugin will be updating the
   path value and things are likely to be chaotic.

3. Command output is always addressed to a switch bank and is specified
   by a string of the form:

   __[__*b*__,__*c*__]__

   which is expanded to a switch path as described for 1.2.

   When command output is selected, __signalk-switchlogic__ generates a
   JSON *command* of the form:
```
   {
     "moduleid": "*b*",
     "channelid":  "*c*",
     "state": "*value of input expression*"
   }
```

   The JSON *command* is converted into a *command string* using
   JSON.stringify() before being written to the plugin's configured
   control channel.

   If the control channel is of type "ipc", then *command string* is
   written to the control channel directly.
   If the control channel is of type "notification", then *command
   string* is wrapped in a Signal K notification of the form
```
   { "description": *command-string*, "state": "normal", "method": [] }
```
   and the notification is issued on the specified control channel path.

   It is the responsibility of control channel listeners to manage
   updates to the Signal K switch bank path specified in any commands
   that they handle.
   If this isn't done, then the originating rule will never be resolved
   and __signalk-switchbank__ will retransmit the failed command up to
   a maximum of five times before reporting an error to the system logs
   and abandoning the transmit attempt.

## A real example

I use this rule to manage my waste pump-out.
```
{
  "description": "Discharge pump",
  "input": "([0,5] and notifications.tanks.wasteWater.0.currentLevel:alert) or [0,6]" ]
  "output": "[10,4]"
}
```

Switch channel [0,5] and [0,6] refer to switch input channels on an
NMEA 2000 switch input module mounted below the helm panel.
This in turn takes connections from the "AUTO" and "MANUAL"
terminals on my two-position pump out switch.

Data from an NMEA 2000 tank level sensor is processed by the
[signalk-threshold-notifier](https://github.com/preeve9534/signalk-threshold-notifier#readme)
plugin into alert notifications, one of which become another operand
of the input expression.

Output from the rule is written to a notification control channel as a
switch bank operating command which is picked up by the
[signalk-switchbank](https://github.com/preeve9534/signalk-switchbank#readme)
plugin and transmitted as an NMEA 2000 PGN 127502 messages to operate
the waste pump connected to relay number 4 on an NMEA 2000 relay output
module down in the bilge.

## Debugging and logging

The plugin understands the following debug keys.

| Key | Meaning                                                                                                   |
|:-------------------|:-------------------------------------------------------------------------------------------|
| switchbank:\*      | Enable all keys.                                                                           | 
| switchbank:actions | Log each output action taken by the plugin.                                                |
| switchbank:rules   | Log each rule loaded by the plugin and indicate whether it was successfully parsed or not. |

## Author

Paul Reeve <preeve@pdjr.eu>\
October 2020
