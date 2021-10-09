/**********************************************************************
 * ExpressionParser provides a framework for parsing a logical
 * expression whose terminal terms are BaconJS event streams into as
 * stream filter which applies the expressin logic to incoming events.
 */

module.exports = class ExpressionParser {

    /******************************************************************
     * Create a new ExpressionParser which will apply the termParser
     * function to translate a terminal symbol into its equivalent
     * BaconJS EventStream.
     */

    constructor(parsers) {
        this.parsers = parsers;
        this.tokens = null;
        this.index = 0;
    }    

    parseExpression(expression) {
        return(this.parsePrefixExpression(this.infixToPrefix(expression)));
    }

    /******************************************************************
     * Parse the prefix <expression> into a BaconJS EventStream that
     * will apply the specified logical processing to values derived
     * from its input EventStreams.
     */

    parsePrefixExpression(expression) {
        var tokens = null;
        var stack = [];

        if (expression) {
            tokens = expression.split(/\s+/);
            if ((tokens) && (tokens.length > 0)) {
                (tokens.reverse()).forEach(token => {
                    if (this.precedence(token) ==  0) {
                        stack.push(this.parsers.operand.parser(token));
                    } else {
                        switch (this.parsers[token].arity) {
                            case 1:
                                if (stack.length > 0) {
                                    stack.push(this.parsers[token].parser(stack.pop()));
                                }
                                break;
                            case 2:
                                if (stack.length > 1) {
                                    stack.push(this.parsers[token].parser(stack.pop(), stack.pop()));
                                }
                                break;
                            default:
                                // error
                                break;
                        }
                    }
                });
            }
        }
        return((stack.length == 1)?stack[0]:null);
    }
    
    /******************************************************************
     * Process <infixExpression> returning an equivalent prefix form or
     * null if <infixExpression> is badly formed.
     */
 
    infixToPrefix(infixExpression) {
        var infixTokens = infixExpression.replace(/\(/g, ' ( ').replace(/\)/g, ' ) ').trim().split(/\s+/);
        var prefixTokens = [];
        var stack = [];
        var t;

        infixTokens.forEach(token => {
            switch (token) {
                case "(":
                    stack.push(token);
                    break;
                case ")":
                    while (t = stack.pop()) {
                        if (t == "(") break;
                        prefixTokens.push(t);
                    }
                    break;
                default:
                    if (this.precedence(token) > 0) { // we have an operator
                        while ((stack.length > 0) && (stack[stack.length - 1] != "(") && (this.precedence(stack[stack.length - 1]) > this.precedence(token))) {
                            prefixTokens.push(stack.pop());
                        }
                        stack.push(token);
                    } else { // we have an operand
                        prefixTokens.push(token);
                    }
                    break;
            }
        });
        while (stack.length > 0) prefixTokens.push(stack.pop());
        return(prefixTokens.reverse().join(' '));
    }

    precedence(token) {
        var retval = 0;
        if (this.parsers.hasOwnProperty(token)) retval = this.parsers[token].precedence;
        return(retval);
    }
        

}
