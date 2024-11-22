const ExpressionParser = require("./ExpressionParser.js");
const Bacon = require("../../node_modules/baconjs");
const readline = require("readline");

var parsers = {
    "operand": { "arity": 1, "precedence": 0, "parser": function(t) { return(parseInt(t)); } },
    "D":       { "arity": 2, "precedence": 4, "parser": function(a,b) { return(b / a); } },
    "M":       { "arity": 2, "precedence": 3, "parser": function(a,b) { return(a * b); } },
    "A":       { "arity": 2, "precedence": 2, "parser": function(a,b) { return(a + b); } },
    "S":       { "arity": 2, "precedence": 1, "parser": function(a,b) { return(b - a); } }
};

var rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false
});

var parser = new ExpressionParser(parsers);
rl.on('line', function(line){
    console.log(parser.parseExpression(line.trim()));
})
