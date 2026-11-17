import ts from "typescript";
import type { RuntimeUseProblem, RuntimeUseReason } from "./runtimeUse";

export type PositionedProblem = RuntimeUseProblem & { position: number };

export const climb = (node: ts.Expression) => {
  let current: ts.Expression = node;
  let parent = current.parent;
  while ((ts.isParenthesizedExpression(parent) || ts.isNonNullExpression(parent)) && parent.expression === current) {
    current = parent;
    parent = current.parent;
  }
  return { current, parent };
};

export const memberName = (node: ts.PropertyAccessExpression | ts.ElementAccessExpression) => {
  if (ts.isPropertyAccessExpression(node)) return node.name.text;
  return ts.isStringLiteralLike(node.argumentExpression) ? node.argumentExpression.text : null;
};

export const staticName = (name: ts.PropertyName | ts.BindingName) => {
  if (ts.isIdentifier(name) || ts.isPrivateIdentifier(name)) return name.text;
  if (ts.isStringLiteralLike(name) || ts.isNumericLiteral(name)) return name.text;
  if (ts.isComputedPropertyName(name) && ts.isStringLiteralLike(name.expression)) return name.expression.text;
  return null;
};

export const problemAt = (
  source: ts.SourceFile,
  reason: RuntimeUseReason,
  node: ts.Node,
  why: string,
): PositionedProblem => {
  const position = node.getStart(source);
  const { line, character } = source.getLineAndCharacterOfPosition(position);
  const raw = node.getText(source).replace(/\s+/g, " ");
  const text = raw.length > 80 ? `${raw.slice(0, 77)}...` : raw;
  return { reason, line: line + 1, column: character + 1, text, message: `\`${text}\`: ${why}`, position };
};

export const sortedProblems = (problems: PositionedProblem[]): RuntimeUseProblem[] =>
  problems.sort((a, b) => a.position - b.position).map(({ position: _, ...problem }) => problem);
