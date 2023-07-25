# pdjr-switchlogic

Apply binary logic over Signal K path values.

__pdjr-switchlogic__ allows the user to define a collection of *rule*s
which monitor the Signal K data store and update it in response to
changes in path values.

Each *rule* consists of a binary *input* expression whose value is
continuously computed and used to determine the value of some *output*
path.

Variable operands in *input* expression are data values identified by
their Signal K path.
Operand values must be inherently binary (like, for example, keys under
'electrical.switches.') or be able to be converted into a binary value.
Special support is provided for handling keys in the 'notifications.'
tree such that binary values can be derived from either the presence or
absence of a notification *per-se* or from the presence or absence of a
particular notification state.
In general, the value of keys under any path can be tested with a range
of comparators and so reduced to a boolean.

The *output* path can reference any key and special handling is provided
to convert boolean states into notifications.
New values can be assigned to *output* keys using either Signal K's put
or delta methods.

The plugin defaults to using delta updates for all outputs, but this
can be overriden based on output path root or at the level of an
individual rule.
On my ship for example I provide put handlers for all relay outputs and
hence override delta output for all paths under 'electrical.switches.'

The plugin provides a generic solution to the problem of doing something
when a state change happens in Signal K.

The following examples illustrate the basics.

#### Example 1: Make a relay track the value of a switch
```
{
  "description": "Anchor light",
  "input": "[0,1]",
  "output": "[10,7]"
}
```
Here, 'switch' notation is used to specify a switch on path
'electrical.switches.bank.0.1.state' and a relay on
'electrical.switches.bank.10.7.state'.

#### Example 2: Raise an alert notification when a tank nears full
```
{
   "description": "Waste tank full notification",
   "input": "tanks.wasteWater.0.level:ge:0.85",
   "output": "notifications.wasteWater.0.level:alert::Waste tank at 85% capacity:sound,visual"
}
```
This example uses the'path' notation to test the value of a tank level
and the 'notification' notation to raise an alert notification.

#### Example 3: Operate an output relay when a tank alert notification is raised, but only if some switch is also off.
```
{
   "description": "Sound waste tank full alarm",
   "input": "(not [0,12]) and notifications.wasteWater.0.level:alert",
   "output": "[10.3]"
}
```
This example uses a more complex input expression.


[pdjr-skplugin-switchbank](https://github.com/preeve9534/pdjr-skplugin-switchbank)
implements a put handler for operating NMEA 2000 relay output switchbanks.

## Configuration

The plugin configuration has the following properties.

| Property | Default                    | Description |
| :------- | :------------------------- | :---------- |
| usePut   | [ "electrical.switches." ] | Optional array containing the prefixes of paths on which a PUT (rather than a delta update) should be used to perform updates. |
| rules    | (none)                     | Required array of *rule* objects. |

Each *rule* object has the following properties.

| Property    | Default | Description |
| :---------- | :------ | :---------- |
| input       | (none)  | Required string specifying a boolean expression. |
| output      | (none)  | Required string specifying the Signal K path that should be updated by this rule. |
| description | ''      | Optional string describing this rule. |
| usePut      | false   | Optional boolean saying whether or not to use PUT for updatint this rules *output*. |

### Input expressions

Operands in input expression refer to paths in the Signal K tree and values
appearing on these paths become the boolean values over which the expression
is applied.
In the plugin boolean values are represented as 0 (false) and 1 (true) which
allows Signal K switch state values to be used directly in an expression, but
other path values must be mapped to 0 and 1 using a comparison test.

Operators 'and', 'or' and 'not' can be used to build arbitrarily complex
conditions and parentheses can be used for disambiguation.

The following example input expressions give a flavour of what is possible.

| Input expression | Description |
| :--- | :--- |
| 'electrical.switches.bank.0.1.state'              | True when the specified switch state is on, otherwise false. |
| '[0,1]'                                           | Notional short form equivalent to the above example. |
| '[0,1] and (not [1,2])'                           | A complex expression involving two switch states. |
| 'electrical.venus.acSource:battery'               | True when the value of 'electrical.venus.acSource' is equal to 'battery'. |
|'tanks.wasteWater.0.currentLevel:gt:0.7 and [0,6]' | True when the specified switch is on and the value of 'tanks.wasteWater.0.currentLevel is greater than 0.7. |

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
