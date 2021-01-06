# pdjr-skplugin-switchlogic

Apply binary logic over Signal K switch and notification states.

This project implements a plugin for the
[Signal K Node server](https://github.com/SignalK/signalk-server-node).

Reading the
[Alarm, alert and notification handling](http://signalk.org/specification/1.0.0/doc/notifications.html)
section of the Signal K documentation may provide helpful orientation.

__pdjr-skplugin-switchlogic__ operates a collection of user-defined rules
each of which consists of an *input expression* and an *output target*.

An *input expression* is a boolean expression whose operands are the
values of Signal K paths.

An *output target* is a Signal K path which will be updated with
the value of *input expression*.

Operand and target paths must specify keys in either the
'notifications.' or 'electrical.switches.' trees.
Notification targets are updated via a Signal K delta whilst switch
targets are updated by a Signal K put.

With appropriate notification and put handlers __pdjr-skplugin-switchlogic__
provides a generic solution to the problem of doing something when a
switch is operated.

## System requirements

__pdjr-skplugin-switchlogic__ has no special installation requirements.

## Installation

Download and install __pdjr-skplugin-switchlogic__ using the "Appstore" menu
option in your Signal K Node server console.
The plugin can also be obtained from the 
[project homepage](https://github.com/preeve9534/pdjr-skplugin-switchlogic)
and installed using
[these instructions](https://github.com/SignalK/signalk-server-node/blob/master/SERVERPLUGINS.md).

## Using the plugin

__pdjr-skplugin-switchlogic__ operates autonomously, but must be configured
before use.

The plugin configuration is stored in the file 'switchlogic.json' and
can be maintained using the Signal K plugin configuration GUI.

The configuration consists of a collections of *rule definitions* each
of which specifies an input condition that determines an output state.

__Rule definitions__ [rules]\
This array property can contain an arbitrary number of *rule
definitions* each of which is characterised by the following 
roperties.

__Input expression__ [input]\
This required string property introduces a boolean *input expression*.
Operands in input expression refer to paths in the Signal K
"notifications...." and "electrical.switches...." trees and values
appearing on these paths become the value of the expression operands.

The simplest expression possible is just an operand and a short-form
example of this might be '[0,1]' which concisely specifies the Signal K
path 'electrical.switches.bank.0.1.state'.
There is a full explanation of input expression syntax below.

__Output target__ [output]\
This required string  property specifies the Signal K path that should
be updated with the value of *input expression* and also the mechanism
through which that update should occur.
See below for a more complete discussion of valid __output__ property
values.
 
__Description__ [description]\
This optional string property supplies some text that will be used to
identify the rule in status and debug outputs.

### Input expression syntax

The simplest expression, as we saw in the above example, will consist
of just a single operand, but expressions can be arbitrarily complex.
These are the ground rules.

1. An operand must be one of:

* a reference to a Signal K notification path of the form '*path*[__:__*state*]'.

  If *state* is not specified then the operand will be true if a notification
  exists on *path*, otherwise false.
  If *state* is specified, then the operand will be true if a notification
  exists on *path* and its state property value is equal to *state* and
  otherwise false.

* a reference to a Signal K switch path of the form '__[__[*b*__,__]*c*__]__'.

  If *b* is present, then the reference expands to the path 'electrical.switches.bank.*b*.*c*.state'.
  If *b* is absent, then the reference expands to the path 'electrical.switches.*c*.state'
  In both cases the operand simply assumes the value of the expanded path (i.e. either 0 or 1).

* one of the constant values 'true' or 'false'.

2. The available operators are "and", "or" and "not";

3. Expressions can be disambiguated or clarified by the use of
   parentheses.

Examples of valid expressions are '[10,3]', '(not [10,4])' and
'[10,3] and notifications.tanks.wasteWater.0.level:alert'.

### Output property values

There are two types of __output__ property value. 

1. The first type directs output to a Signal K notification and must
   have the form:

  *path*[__:__[*state*][__:__[*method*][__:__[*description*]]]]

  Where *path* is a notification path, and *state*, *method* and
  *description* optionally set the corresponding properties of any
  issued notification. 
  If these options are not specified then they will default to
  "alert", [] and "Inserted by signalk-switchbank".

   A notification will be issued when the associated *input expression*
   resolves to 1 and cancelled when it resolves to 0.

2. The second type directs output to a Signal K switch path and must have the form:

   __[__[*b*__,__]*c*__]__

   which is expanded to a switch path as described above.

   The resolved value of the input expression will be output to the specified
   switch path as a Signal K put request.

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
These channels are connected to the "AUTO" and "MANUAL" terminals on
my two-position pump out switch.

Data from an NMEA 2000 tank level sensor is processed by the
[threshold-notifier](https://github.com/preeve9534/threshold-notifier#readme)
plugin into alert notifications, one of which becomes an operand
of the input expression.

Output from the rule is written as a put request to the specified
switch channel.

The 
[signalk-switchbank](https://github.com/preeve9534/signalk-switchbank#readme)
plugin incorporates an action handler which picks up the put request
and responds by transmitting an NMEA 2000 PGN 127502 message to operate
the waste pump connected to relay number 4 on NMEA 2000 relay output
module 10.

## Debugging and logging

__pdjr-skplugin-switchlogic__ understands the 'switchlogic' debug key.

## Author

Paul Reeve <preeve@pdjr.eu>\
October 2020
