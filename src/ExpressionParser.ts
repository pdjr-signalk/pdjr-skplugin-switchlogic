/**********************************************************************
 * ExpressionParser provides a framework for parsing a logical
 * expression whose terminal terms are BaconJS event streams into as
 * stream filter which applies the expressin logic to incoming events.
 */
export class ExpressionParser {

  parsers: any = undefined;
  tokens: any = undefined;
  index: number = 0;
  app: any = undefined;
   
  /******************************************************************
   * Create a new ExpressionParser which will apply the termParser
   * function to translate a terminal symbol into its equivalent
   * BaconJS EventStream.
   */
  constructor(parsers: any, app: any) {
    this.parsers = parsers;
    this.app = app;
  }    

  parseExpression(expression: any): any {
    return(this.parsePrefixExpression(this.infixToPrefix(expression)));
  }

  /******************************************************************
   * Parse the prefix <expression> into a BaconJS EventStream that
   * will apply the specified logical processing to values derived
   * from its input EventStreams.
   */
  parsePrefixExpression(expression: string): any {
    var tokens: string[] = [];
    var stack: any[] = [];

    this.app.debug("ExpressionParser: parsePrefixExpression: %s", expression);

    if (expression) {
      tokens = expression.split(/\s+/);
      if ((tokens) && (tokens.length > 0)) {
        tokens.reverse().forEach(token => {
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
  infixToPrefix(infixExpression: string): string {
    var infixTokens: string[] = infixExpression.replace(/\(/g, ' ( ').replace(/\)/g, ' ) ').trim().split(/\s+/);
    var prefixTokens: string[] = [];
    var stack: string[] = [];
    var t: string | undefined;

    this.app.debug("ExpressionParser: infixToPrefix: %s", infixExpression);
    
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
              t = stack.pop();
              if (t) prefixTokens.push(t);
            }
            stack.push(token);
          } else { // we have an operand
            prefixTokens.push(token);
          }
          break;
      }
    });
    while (stack.length > 0) { t = stack.pop(); if (t) prefixTokens.push(t); }
    return(prefixTokens.reverse().join(' '));
  }

  precedence(token: string): number {
    return((this.parsers.hasOwnProperty(token))?this.parsers[token].precedence:0);
  }      

}
