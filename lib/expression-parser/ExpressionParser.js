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
        if (expression != null) {
            this.tokens = expression.split(/\s+/);
            this.index = 0;
            return(this.resolveToken(this.getNextToken()));
        } else {
            throw "empty expression";
        }
    }

    /******************************************************************
     * Return the stream that results from recursively processing the
     * current expression starting at <token>.
     */

    resolveToken(token) {
        if (token != null) {
            if (this.precedence(token) > 0) {
                switch (this.parsers[token].arity) {
                    case 1:
                        return(this.parsers[token].parser(this.resolveToken(this.getNextToken())));
                        break;
                    case 2:
                        return(this.parsers[token].parser(this.resolveToken(this.getNextToken()), this.resolveToken(this.getNextToken())));
                        break;
                    default:
                        break;
                }
            } else {
                return(this.parsers.operand.parser(token));
            }
        } else {
            throw "parse error at token " + this.index;
        }
    }
    
    infixToPrefix(expression) {
        var infixTokens = expression.replace(/\(/g, ' ( ').replace(/\)/g, ' ) ').trim().split(/\s+/);
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

    /******************************************************************
     * Get the next term from the current expression, or null if all
     * the terms in the current expression have been consumed.
     */

    getNextToken() {
        return((this.index < this.tokens.length)?this.tokens[this.index++]:null);
    }

    precedence(token) {
        var retval = 0;
        if (this.parsers.hasOwnProperty(token)) retval = this.parsers[token].precedence;
        return(retval);
    }
        

}
