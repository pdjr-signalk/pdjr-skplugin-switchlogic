# signalk-switchlogic

Apply binary logic over switch and notification states.

This project implements a plugin for the
[Signal K Node server](https://github.com/SignalK/signalk-server-node).

Reading the [Alarm, alert and notification handling](http://signalk.org/specification/1.0.0/doc/notifications.html)
section of the Signal K documentation may provide helpful orientation.

__signalk-switchlogic__ allows the user to define a collection of rules
each of which maps the result of an input boolean expression onto some
output action.

Operands in input expressions are values drawn from Signal K notification
or switch bank paths.

There are three possible types of output action.

1. Issue (if expression is true) or cancel a notification on a path in
   Signal K's "notifications....) tree.
   The notification path is defined in the rule and the definition can
   specify any or all property values in the issued notification.

2. Write a 1 (if expression is true) or 0 as the state value of a path
   in Signal K's "electrical.switches...." tree.
   The switch path is defined in the rule.

3. Write a JSON command specifying a switch bank update to a 
   control channel.
   The control channel type and identity is defined globally in the
   plugin configuration and the output command will have properties
   identifying the switch bank, channel and state (derived as in (2))
   to which it applies. 

Option (3) is especially useful since applications inside and outside
of Signal K can listen to the control channel and take appropriate
action.
For example,
[signalk-switchbank](https://github.com/preeve9534/signalk-switchbank)
accepts commands on a control channel and outputs PGN 127502 Switch Bank
Update messages to operate remote relays on the NMEA bus.
In a similar way, 
[signalk-devantech](https://github.com/preeve9534/signalk-devantech)
can be used to operate usb and ethernet connected relay modules. 

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

The plugin can be configured using the Signal K Node server plugin
configuration GUI or by directly editing the plugin's JSON
configuration file.
 
The plugin looks for the configuration file 'switchlogic.json' in the
server's 'plugin-config-data/' directory.
This file must have the following general structure:
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
with the following constraints.

| *channel-type*   | *channel-id*                                                      |
|:-----------------|:------------------------------------------------------------------|
| __notification__ | The notification path to which commands should be written.        |
| __fifo__         | The pathname of a named pipe to which commands should be written. |
| __dbus__         | The D-Bus bus name to which commands should be written.           |

The __rules__ array is used to define the rules the plugin must obey
in order to map changes in switch or notification path values into
operating commands or path value changes.

It is easiest to illustrate the detail of the configuration file format
by example, so let's assume that we have a two-channel switch input
module at the helm connected to a two-channel relay output module in
the engine room and that the relay module controls power to two
immersion heaters.

#### Defining rules

Rule definitions can be arbitrarily complex, but our proposed
application demands just a simple __rules__ list.
```
    "rules": [
      {
        "input": "[0,0]",
        "output": "[12,0]",
        "description": "Immersion heater 1kW"
      },
      {
        "input": "[0,1]",
        "output": "[12,1]",
        "description": "Immersion heater 2kW"
      }
    ]
```

Each rule defines the mapping of an input state onto an output path.
In this case, our inputs are simply switch input module channels and
our outputs are the relay output module channels that should be
operated.
The mapping is straightforward: make the output state reflect the input
state.

__input__ property values supply an expression that evaluates to 1 (ON)
or 0 (OFF) and in this example we use "[*b*,*c*]" as shorthand for
switchbank *b*, channel *c*.

__output__ defines the channel that should have its state set to match
the computed input state (in this case, we use the same notation to
specify the associated relay output channel).

__description__ property values supply some human-readable text that
will be used to identify the rule in status and debug outputs.

#### That's it

Our example system is now configured.
All that remains is for us to enable the plugin by changing the
__enabled__ property value to 'true'.
When we restart the server the plugin will execute.

Of course, you will want to create a configuration that suits your
needs and that might be helped by learning some more about rule
definitions.

### More about rules

The rule __input__ property value must be a string containing a boolean
expression.
The simplest expression, as we saw in the above example, will consist
of just a single _operand_, but expressions can be arbitrarily complex.

The ground rules are:

1. an operand must be either a reference to a Signal K key from which
   operand values can be drawn or a boolean constant (either "true" or
   "false");

2. the available operators are "and", "or" and "not";

3. expressions can be disambiguated or clarified by the use of
   parentheses.

An example __input__ property value is "[10,3] and (not [10,4])".

The rule __output__ property value is always a single key reference to
either a switchbank channel or a notification key.

#### Key references and boolean constants

The possible forms of key reference are:

| Form | Syntax                                                       | As operand | As output | Refers to the value of key          |
|:----:|:-------------------------------------------------------------|:----------:|:---------:|:------------------------------------|
| 1    | __[__*b*__,__*c*__]__                                        | Yes        | Yes       | Control channel command for *b*.*c* |
| 3    | __[[__*b*__,__*c*__]]__                                      | Yes        | Yes       | electrical.switches.bank.*b*.*c*    |
| 4    | *key*[__:__*state*]                                          | Yes        | Yes       | *key*                               |
| 5    | *key*[__:__[*state*][__:__[*method*][__:__[*description*]]]] | Yes        | Yes       | *key*                               |

And the two boolean constants are:

| Form | Syntax                                                       | As operand | As output | Resolves to                      |
|:----:|:-------------------------------------------------------------|:----------:|:---------:|:---------------------------------|
| 6    | { __true__ \| __on__ \| 1 }                                  | Yes        | No        | 1                                |
| 7    | { __false__ \| __off__ \| 0 }                                | Yes        | No        | 0                                |

Form 1, when used as an output reference, will result in the plugin
transmitting an NMEA 2000 PGN127502 Switch Bank Update message whenever
the state of the associated __input__ expression changes.
Note that the plugin will not directly set the value of the referenced
key - this will only be updated when the target switchbank device
responds to the PGN127502 by transmitting a PGN127501 Switch Bank
Status message that is picked up by Signal K.

Form 2, when used as an output reference, will set the specified Signal K
key whenever the state of the associated __input__ expression changes.
If the specified key is associated with a physical input to Signal K,
then both Signal K and the plugin will be updating the referenced key
and things are likely to be chaotic.

Form 3 is the switchbank version of Form 2: when used as an output
reference it will set the specified Signal K key whenever the state of
the associated __input__ expression changes.
If the specified key is associated with a physical input to Signal K,
then both Signal K and the plugin will be updating the referenced key
and things are likely to be chaotic.

Form 4, in the absence of the optional *state* value, will interpret the
presence of *key* as 1 and its absense as 0.
If *state* is specified then additionally the state property of a
present *key* must equal *state* for a 1 to be resolved.

Form 5 results in the issuing or deletion of the referenced
notification key when the state of the associated __input__ expression
resolves respectively to 1 or 0.
The *state*, *method* and *description* values may be used to set the
corresponding properties of issued notifications. 
I these options are not specified then they will default to "alert",
[] and "Inserted by signalk-switchbank".

Forms 6 and 7 simply generate boolean constants.

#### Some further example rules

Example 1.
I use this rule to operate the courtesy lights on my side-deck.
To do this I rely on a separate plugin which raises a notification
when it is "daylight" in whateiver happens to be my current timezone.
The rule looks for the absence of this notification or the presence
of a switch override on switchbank 0, channel 7 and if either is
present it operates the relay on switchbank 1, channel 4 to which the
courtesy lights are connected.
```
{
  "id": "COURTESY LIGHTS",
  "input": "(not notifications.daylight) or [0,7]",
  "output": "[1,4]"
}
```

Example 2.
I use this rule to manage my waste pump-out.
To do this I rely on a separate plugin which issues notifications based
upon tank level with an 'alert' notification corresponding to 80% full.
My helm switch has two positions: an "auto" (switch [0,5]) position
which makes the pumput happen when the tank has got full and "on"
(switch [0,6]) position which runs the pump directly.
```
{
  "description": "Discharge pump",
  "input": "([0,5] and notifications.tanks.wasteWater.0.currentLevel:alert) or [0,6]" ]
  "output": "(10,4)"
}
```

## Debugging and logging

__signalk-switchbank__ uses the standard Signal K logging mechanism
based around the idea of debug keys (you can access the relevant GUI
from your server console menu Server -> Server Log).

The plugin understands the following debug keys.

| Key | Meaning                                                                                                                    |
|:-------------------|:------------------------------------------------------------------------------------------------------------|
| switchbank:\*      | Enable all keys.                                                                                            |
| switchbank:actions | Log each PGN 127502 Switch Bank Update message transmitted by the plugin.                                   |
| switchbank:rules   | Log each rule loaded by the plugin and indicate whether it was successfully parsed or not.                  |
| switchbank:updates | Log each time a PGN127501 Switch Bank Status message is used to update the plugin's switchbank state model. | 
