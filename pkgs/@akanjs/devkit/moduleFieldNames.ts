import ts from "typescript";

const isFieldCall = (node: ts.Expression): boolean =>
  ts.isCallExpression(node) &&
  (ts.isIdentifier(node.expression)
    ? node.expression.text === "field"
    : ts.isPropertyAccessExpression(node.expression) && isFieldCall(node.expression.expression));

const propertyNames = (content: string, declares: (initializer: ts.Expression) => boolean) => {
  const names: string[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isPropertyAssignment(node) && ts.isIdentifier(node.name) && declares(node.initializer))
      names.push(node.name.text);
    ts.forEachChild(node, visit);
  };
  visit(ts.createSourceFile("module.ts", content, ts.ScriptTarget.Latest));
  return names;
};

export const constantFieldNames = (content: string) => propertyNames(content, isFieldCall);

export const unlabeledFieldNames = (constantContent: string, dictionaryContent: string) => {
  const labels = new Set(propertyNames(dictionaryContent, () => true));
  return constantFieldNames(constantContent).filter((name) => !labels.has(name));
};
