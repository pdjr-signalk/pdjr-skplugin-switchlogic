const ExpressionParser = require("./ExpressionParser.js");

var parsers = {
    "operand": { "arity": 1, "precedence": 0, "parser": function(t) { return(parseInt(t)); }},
    "not":     { "arity": 1, "precedence": 1, "parser": function(s) { return(~s); }},
    "and":     { "arity": 2, "precedence": 3, "parser": function(s1,s2) { return(s1 && s2); }},
    "or":      { "arity": 2, "precedence": 2, "parser": function(s1,s2) { return(s1 || s2); }}
};

var expression = "1 or 0";

var parser = new ExpressionParser(parsers);

console.log(expression);
console.log(parser.infixToPrefix(expression));


console.log(parser.parseExpression(expression));
