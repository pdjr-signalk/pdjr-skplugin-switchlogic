# pdjr-skplugin-switchlogic

Apply binary logic over Signal K path values.

This project implements a plugin for the
[Signal K Node server](https://github.com/SignalK/signalk-server-node).

__pdjr-skplugin-switchlogic__ operates a collection of user-defined rules
each of which consists of an *input expression* and an *output target*.

*input expression* is a boolean expression in which each variable operand
is a data value identified by a Signal K path.
This expression returns the 0 (false) or 1 (true).

*output target* is a Signal K path which will be updated with either the
value of *input expression* or some specified constant values into which
0 or 1 can be mapped.

There are some special treatments and convenience notations for path names
in both input expressions and targets.

In general, an *output target* is updated using the Signal K 'put' function.
Arbitrary bespoke put handlers can be used to implement whatever action is
required when a request is made to change the value of the target path.
Exceptionally, targets in the Signal K 'notifications.\*' tree are updated
directly using a Signal K delta.

With appropriate supporting put handlers __pdjr-skplugin-switchlogic__
provides a generic solution to the problem of doing something when something
happens: perhaps as simple as operating a relay when a switch is pressed.

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

Operands in input expression refer to paths in the Signal K tree and values
appearing on these paths become the boolean values over which the expression
is applied.
Signal K data with values 0 and 1 (like switches) can be used directly in
an expression, but other values must be mapped to 0 and 1 using some
comparison test.
At the time of writing the only test available is equality.

And, or and not operators can be used to build arbitrarily complex
conditions, for example:
```
1. 'electrical.switches.bank.0.1.state'\
2. '[0,1]'\
3. '[0,1] and (not [1,2])'
4. 'electrical.venus.acSource:battery'
```

There is a full explanation of input expression syntax below.

__Output target__ [output]\
This required string property specifies the Signal K path that should
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

* a token of the form '*path*[__:__*value*]'.

  If *value* is not specified then the operand will be true if *path* has
  a non-null value.
  If *value* is specified and *path* does not specify a key in the 'notification.\*'
  tree, then the operand will be true if the value of *path* equals *value*.
  If *path* does specify a notification key, then the operand will be true if the
  value of the specified notification state property equals *value*.

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

There are three possible types of __output__ property value. 

1. *path*[__:__*true-value*__,__*false-value__]

   Where *path* is a Signal K path somewhere other than in the
   notification tree and *true-value* and *false-value*, if specified,
   define the values that will be output to *path* using a Signal K put
   request in response to changes in *input-expression*.
   
   If *true-value* and *false-value* are not specified, then the value
   1 will be output is *input-expression* resolves tru, otherwise 0.
   
2. *notification-path*[__:__*state*[__:__*method*[__:__*description*]]]

  Where *path* is a notification path, and *state*, *method* and
  *description* optionally set the corresponding properties of any
  issued notification. 
  If these options are not specified then they will default to
  "alert", [] and "Inserted by signalk-switchlogic".

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
