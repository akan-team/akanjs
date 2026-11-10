import ts from "typescript";

const isFieldCall = (node: ts.Expression): boolean =>
  ts.isCallExpression(node) &&
  (ts.isIdentifier(node.expression)
    ? node.expression.text === "field"
    : ts.isPropertyAccessExpression(node.expression) && isFieldCall(node.expression.expression));

export const constantFieldNames = (content: string) => {
  const names: string[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isPropertyAssignment(node) && ts.isIdentifier(node.name) && isFieldCall(node.initializer))
      names.push(node.name.text);
    ts.forEachChild(node, visit);
  };
  visit(ts.createSourceFile("constant.ts", content, ts.ScriptTarget.Latest));
  return names;
};
