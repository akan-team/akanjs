import { createAst } from "@akanjs/language";
import ts from "typescript";

export const {
  sourceFileFor,
  nodeName,
  propertyName,
  expressionName,
  callExpressionName,
  firstObjectReturnedByArrow,
  heritageCall,
} = createAst(ts);

export const hasParseDiagnostics = (source: ts.SourceFile) =>
  ((source as ts.SourceFile & { parseDiagnostics?: readonly ts.Diagnostic[] }).parseDiagnostics ?? []).length > 0;

export const hasSourceParseErrors = (content: string, fileName = "source.ts") =>
  hasParseDiagnostics(sourceFileFor(fileName, content));

export const findClassDeclaration = (source: ts.SourceFile, className: string): ts.ClassDeclaration | null => {
  let found: ts.ClassDeclaration | null = null;
  const visit = (node: ts.Node) => {
    if (found) return;
    if (ts.isClassDeclaration(node) && node.name?.text === className) {
      found = node;
      return;
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(source, visit);
  return found;
};

export const firstHeritageCall = (node: ts.ClassDeclaration): ts.CallExpression | null => {
  const expression = (node.heritageClauses?.flatMap((clause) => [...clause.types]) ?? [])[0]?.expression;
  return expression && ts.isCallExpression(expression) ? expression : null;
};

export const factoryArrowOf = (call: ts.CallExpression): ts.ArrowFunction | ts.FunctionExpression | null => {
  const arg = call.arguments.find((argument) => ts.isArrowFunction(argument) || ts.isFunctionExpression(argument));
  return arg && (ts.isArrowFunction(arg) || ts.isFunctionExpression(arg)) ? arg : null;
};
