/**********************************************************************
 * ExpressionParser provides a framework for parsing a logical
 * expression whose terminal terms are BaconJS event streams into as
 * stream filter which applies the expressin logic to incoming events.
 */
export declare class ExpressionParser {
    parsers: any;
    tokens: any;
    index: number;
    app: any;
    /******************************************************************
     * Create a new ExpressionParser which will apply the termParser
     * function to translate a terminal symbol into its equivalent
     * BaconJS EventStream.
     */
    constructor(parsers: any, app: any);
    parseExpression(expression: any): any;
    /******************************************************************
     * Parse the prefix <expression> into a BaconJS EventStream that
     * will apply the specified logical processing to values derived
     * from its input EventStreams.
     */
    parsePrefixExpression(expression: string): any;
    /******************************************************************
     * Process <infixExpression> returning an equivalent prefix form or
     * null if <infixExpression> is badly formed.
     */
    infixToPrefix(infixExpression: string): string;
    precedence(token: string): number;
}
