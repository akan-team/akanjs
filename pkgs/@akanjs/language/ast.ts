import type * as TS from "typescript";

export type Ts = typeof TS;

export const createAst = (ts: Ts) => {
  const sourceFileFor = (fileName: string, content: string, scriptKind: TS.ScriptKind = ts.ScriptKind.TS) =>
    ts.createSourceFile(fileName, content, ts.ScriptTarget.Latest, true, scriptKind);

  const nodeName = (node: TS.PropertyName | TS.BindingName | undefined) => {
    if (!node) return null;
    if (ts.isIdentifier(node) || ts.isStringLiteral(node) || ts.isNumericLiteral(node)) return node.text;
    return null;
  };

  const propertyName = (node: TS.ObjectLiteralElementLike) =>
    ts.isPropertyAssignment(node) || ts.isShorthandPropertyAssignment(node) || ts.isMethodDeclaration(node)
      ? nodeName(node.name)
      : null;

  const expressionName = (expression: TS.Expression): string | null => {
    if (ts.isIdentifier(expression)) return expression.text;
    if (ts.isPropertyAccessExpression(expression)) return expression.name.text;
    if (ts.isCallExpression(expression)) return expressionName(expression.expression);
    if (ts.isAsExpression(expression)) return expressionName(expression.expression);
    return null;
  };

  const callExpressionName = (node: TS.CallExpression) =>
    ts.isPropertyAccessExpression(node.expression) ? node.expression.name.text : expressionName(node.expression);

  const firstObjectReturnedByArrow = (node: TS.Node): TS.ObjectLiteralExpression | null => {
    if (!ts.isArrowFunction(node) && !ts.isFunctionExpression(node)) return null;
    if (ts.isObjectLiteralExpression(node.body)) return node.body;
    if (ts.isParenthesizedExpression(node.body) && ts.isObjectLiteralExpression(node.body.expression)) {
      return node.body.expression;
    }
    if (!ts.isBlock(node.body)) return null;
    for (const statement of node.body.statements) {
      if (
        ts.isReturnStatement(statement) &&
        statement.expression &&
        ts.isObjectLiteralExpression(statement.expression)
      ) {
        return statement.expression;
      }
    }
    return null;
  };

  const heritageCallNamed = (node: TS.ClassDeclaration, names: ReadonlySet<string>) => {
    const heritage = node.heritageClauses?.flatMap((clause) => [...clause.types]) ?? [];
    for (const { expression } of heritage) {
      if (!ts.isCallExpression(expression)) continue;
      const callee = expressionName(expression.expression);
      if (callee && names.has(callee)) return { callee, call: expression };
    }
    return null;
  };

  const viaNames = new Set(["via"]);
  const heritageCall = (node: TS.ClassDeclaration) => heritageCallNamed(node, viaNames)?.call ?? null;

  return {
    sourceFileFor,
    nodeName,
    propertyName,
    expressionName,
    callExpressionName,
    firstObjectReturnedByArrow,
    heritageCallNamed,
    heritageCall,
  };
};

export type AkanAst = ReturnType<typeof createAst>;
