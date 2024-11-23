const ExpressionParser = require("./ExpressionParser.js");
const Bacon = require("../../node_modules/baconjs");

var parsers = {
    "operand": { "arity": 1, "precedence": 0, "parser": function(t) { return(Bacon.repeatedly(500, (t == "A")?[1,0,1]:[0,0,1])); } },
    "not":     { "arity": 1, "precedence": 3, "parser": function(s) { return(s.not()); } },
    "and":     { "arity": 2, "precedence": 2, "parser": function(s1,s2) { return(Bacon.combineWith((a,b) => ((a == 1) && (b == 1)), [s1, s2])); } },
    "or":      { "arity": 2, "precedence": 1, "parser": function(s1,s2) { return(Bacon.combineWith((a,b) => ((a == 1) || (b == 1)), [s1, s2])); } }
};

var parser = new ExpressionParser(parsers);

var stream = parser.parseExpression("A and B");
console.log(stream);
stream.onValue(v => console.log(v));
