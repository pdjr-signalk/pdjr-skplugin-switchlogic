# signalk-switchlogic

Apply binary logic over switch and notification states.

This project implements a plugin for the
[Signal K Node server](https://github.com/SignalK/signalk-server-node).

Reading the [Alarm, alert and notification handling](http://signalk.org/specification/1.0.0/doc/notifications.html)
section of the Signal K documentation may provide helpful orientation.

__signalk-switchlogic__ processes a collection of user-defined rules
each of which computes the result of an input boolean expression and
outputs the result to a Signal K path using a mechanism which is
defined in each rule.

Operands in input expressions are values drawn from Signal K paths in
either the "notification...." or "electrical.switches...." trees.
Output mechanisms include writing values into the same Signal K trees
or issuing a switch bank operating command over a specified control
channel so that some proxy-application can implement the required
update.

Control channel output is particularly useful since applications inside
and outside of Signal K can listen to the control channel for relevant
commands and take appropriate action.
For example, the
[signalk-switchbank](https://github.com/preeve9534/signalk-switchbank#readme)
plugin accepts commands on a control channel and issues PGN 127502
Switch Bank Update messages to operate remote relays on the NMEA bus.
In a similar way, the
[signalk-devantech](https://github.com/preeve9534/signalk-devantech#readme)
plugin can be used to operate usb and ethernet relay modules from the
manufacturer Devantech. 

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

The __rules__ array is used to define the rules that the plugin must
obey in order to map changes in switch or notification path values into
operating commands or path value changes.

It is easiest to illustrate the detail of the configuration file format
by example, so let's assume that we have a two-channel switch input
module at the helm connected to a two-channel relay output module in
the engine room and that the relay module controls power to two
immersion heaters.

The __rules__ property introduces an array which contains an arbitrary
number of rule definitions.
Each rule definition defines three properties.
```
    {
      "input": "[0,0]",
      "output": "[12,0]",
      "description": "Immersion heater 1kW"
    }
```

The __input__ property introduces a string value containing a boolean
expression that evaluates to 1 (ON) or 0 (OFF).
In the example given above, the expression "[0,0]" is used as shorthand
for the Signal K path "electrical.switches.bank.0.0.state" whose stream
values will become the result of the expression.
There is a full explanation of input expression syntax below.

The __output__ property value specifies both what Signal K path should
be updated (to the result of the input expression) and the mechanism
through which that update should occur.
The shorthand used in the example above says "update the value of the
switch bank path 'electrical.switches.bank.12.0.state'" and by virtue
of the single brackets) "do this by writing a command to the channel
specified by the __controlchannel__ property."
See below for a more complete discussion.
 
The __description__ property value supplies some text that will be
used to identify the rule in status and debug outputs.

### Input property expression syntax

The simplest expression, as we saw in the above example, will consist
of just a single _operand_, but expressions can be arbitrarily complex.
These are the ground rules.

1. An operand must be either:

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

2. The available operators are "and", "or" and "not";

3. Expressions can be disambiguated or clarified by the use of
   parentheses.

Examples of valid expressions are "[10,3]", "(not [10,4])" and
"[10,3] and notifications.tanks.wasteWater.0.level:alert".

### Output property values

The syntax of the output property value specifies one of three possible
types of output action.

1. Notification output is specified by a string of the form:

   *path*[__:__[*state*][__:__[*method*][__:__[*description*]]]]

   Where *path* is a notification path, and *state*, *method* and
   *description* optionally set the corresponding properties of any
   issued notification. 
   If these options are not specified then they will default to
   "alert", [] and "Inserted by signalk-switchbank".

   A notification will be issued when the input expression resolves
   to 1 and cancelled when it resolves to 0.

2. Switch path output is specified by a string of the form:

   __[[__[*b*__,__]*c*__]]__

   which is expanded to a switch path as described for 1.2.

   The resolved value of the input expression will be written directly
   to the specified path.
   Note that if the specified path is associated with a physical input
   to Signal K, then both Signal K and the plugin will be updating the
   path value and things are likely to be chaotic.

3. Command output to the configured control channel is specified by a
   string of the form:

   __[__*b*__,__*c*__]__

   where *b* is the value of the command's 'instanceid' property and
   *c* is the value of the command's channelid property.
   The resolved value of the input expression will become the value of
   the command's 'state' property.

### Command output

When command output is selected, __signalk-switchlogic__ generates a
JSON command of the form:
```
{
  "moduleid": "12",
  "channelid": "0",
  "state": "*result of input expression*"
}
```

where the values of the __moduleid__ and __channelid__ properties are
derived from the rule's __output__ property value and the value of the
__state__ property is the result of the rule's __input__ expression.
The JSON command is converted into a command string using
JSON.stringify() before being written to the plugin's configured
control channel.

If the control channel is of type "ipc", then the command string is
written to the control channel directly. If the control channel is of
type "notification", then the command string is wrapped in a Signal K
notification of the form
```
{ "description": *command-string*, "state": "normal", "method": [] }
```
and the notification is issued on the specified control channel path.

It is the responsibility of control channel listeners to manage updates
to the Signal K switch bank path specified in any commands that they
handle.
If this isn't done, then the originating rule will never be resolved.

If a rule fails to resolve, then __signalk-switchbank__ will retransmit
the failed command up to a maximum of five times before reporting an
error to the system logs.

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
