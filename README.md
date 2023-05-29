# pdjr-switchlogic

Apply binary logic over Signal K path values.

__pdjr-switchlogic__ allows the user to define a collection of rules
which will be applied to the Signal K data store.
Each rule consists of an *input expression* and an *output path*.

*input expression* is a boolean expression in which each operand is a
Signal K data value (identified by its path) or a boolean constant.
Changes in the value of *input expression* operands are processed
through the boolean expression and may in an update of the value of
*output path* to make it conform to the state of *input expression*.

*outout path* and variable operands in *input expression* are arbitrary
Signal K paths, but there are special notational forms for switches and
notifications which simplify the writing of rules and imply the
mechanism that will be used for updating the *output path* value.

By default the plugin issues a put request to update an *output path*
value, but this default can be substituted by a delta update dependent
on the notational form used to specify an operand or by an explcit
override for a particular rule.

With appropriate supporting put handlers the plugin provides a generic
solution to the problem of doing something when a state change happens
in Signal K: perhaps as simple as operating a relay when a switch is
pressed.
[pdjr-skplugin-switchbank](https://github.com/preeve9534/pdjr-skplugin-switchbank)
implements a put handler for operating NMEA 2000 relay output switchbanks.

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

The configuration consists of a collection of *rule definitions* each
of which specifies an input condition that determines an output state.

__Rule definitions__ [rules]\
This array property can contain an arbitrary number of *rule
definitions* each of which is characterised by the following 
properties.

__Input expression__ [input]\
This required string property introduces a boolean *input expression*.

Operands in input expression refer to paths in the Signal K tree and values
appearing on these paths become the boolean values over which the expression
is applied.
In the plugin boolean values are represented as 0 (false) and 1 (true) which
allows Signal K switch state values to be used directly in an expression, but
other path values must be mapped to 0 and 1 using a comparison test.

There are a few notational forms that can be used to specify a variable operand.

'and', 'or' and 'not' operators can be used to build arbitrarily complex
conditions.
```
1. 'electrical.switches.bank.0.1.state'\
2. '[0,1]'\
3. '[0,1] and (not [1,2])'\
4. 'electrical.venus.acSource:battery'\
5. 'tanks.wasteWater.0.currentLevel:gt:0.7 and [0,6]'
```

There is a full explanation of input expression syntax below.

__Output path__ [output]\
This required string property specifies the Signal K path that should be updated
dependent upon the value of *input expression* and also the values that should be
used in the update.
There are a few alternative notations.

1. __[__[*b*__,__]*c*__]__ (shorthand for a path in 'electrical.switches...')

   If *b* is not specified, then use a put to request update of 'electrical.switches.*c*.state'
   with the value of the containing rule's *input expression* (either 0 or 1)
   
   If *b* is specified, then use a put to request update of 'electrical.switches.*b*.*c*.state'
   with the value of the containing rule's *input expression* (either 0 or 1)

2. *notification-path*[__:__*state*[__:__*method*[__:__*description*]]]

   Where *notification-path* is a path in the Signal K 'notifications...' tree
   and *state*, *method* and *description* optionally set the corresponding
   properties of any issued notification. 
   If these options are not specified then they will default to 'alert', [] and ''
   respectively.

   A delta will be used to issue the specified notification when the containing
   rule's *input expression* resolves to 1 and to cancel the notification when
   the expression resolves to 0.

3. *path*[__:__*true-value*__,__*false-value__]

   Where *path* is a Signal K path somewhere other than in the 'notifications...'
   tree and *true-value* and *false-value*, if specified, define the values that
   will be used in a put requests issued to *path* when the value of
   *input-expression* changes.
   
   If *true-value* and *false-value* are not specified, then the value
   1 will be output if *input-expression* resolves true, otherwise 0.
 
__Description__ [description]\
This optional string property supplies some text that will be used to
identify the rule in status and debug outputs.

### Input expression syntax

The simplest expression, as we saw in the above example, will consist
of just a single operand, but expressions can be arbitrarily complex.
These are the ground rules.

1. An operand must be one of:

* a token of the form '*path*[__:__[*comparator*__:__]*value*]'.

  If *comparator* and *value* are not supplied then the operand will be true if
  *path* has a non-null value.
  
  If *value* is supplied and *path* does not specify a key in the 'notification.\*'
  tree, then the operand will be true if the value of *path* equals *value*.
  If required, one of the following *comparator* tokens can be supplied to tweak
  the nature of the test for truthiness.
  
  'eq' - true if the value of *path* is equal to *value*\
  'ne' - true if the value of *path* is not equal to *value*\
  'lt' - true if the value of *path* is less than *value*\
  'le' - true if the value of *path* is less than or equal to *value*\
  'gt' - true if the value of *path* is greater than *value*\
  'ge' - true if the value of *path* is greater than or equal to *value*
  
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

### Output property values

There are three possible types of __output__ property value. 



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
NMEA 2000 switch input module.
These channels are connected to the "AUTO" and "MANUAL" terminals on
my two-position pump out switch.

Data from an NMEA 2000 tank level sensor is processed by the
[threshold-notifier](https://github.com/preeve9534/threshold-notifier#readme)
plugin into alert notifications, one of which becomes an operand
of the input expression.

Output from the rule is written as a put request to "electrical.switches.bank.10.4.state".

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
