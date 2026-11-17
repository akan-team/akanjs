import ts from "typescript";
import { RuntimeLexicalScope } from "./runtimeLexicalScope";
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

type Wrapper =
  | ts.ParenthesizedExpression
  | ts.NonNullExpression
  | ts.AsExpression
  | ts.TypeAssertion
  | ts.SatisfiesExpression;

const isWrapper = (node: ts.Node): node is Wrapper =>
  ts.isParenthesizedExpression(node) ||
  ts.isNonNullExpression(node) ||
  ts.isAsExpression(node) ||
  ts.isTypeAssertionExpression(node) ||
  ts.isSatisfiesExpression(node);

export const climbCasts = (node: ts.Expression) => {
  let current: ts.Expression = node;
  let parent = current.parent;
  while (isWrapper(parent) && parent.expression === current) {
    current = parent;
    parent = current.parent;
  }
  return { current, parent };
};

export const unwrap = (expression: ts.Expression): ts.Expression => {
  let current = expression;
  while (ts.isParenthesizedExpression(current)) current = current.expression;
  return current;
};

export const uncast = (expression: ts.Expression): ts.Expression => {
  let current = expression;
  while (isWrapper(current)) current = current.expression;
  return current;
};

export const inlineFunction = (expression: ts.Expression) => {
  const value = uncast(expression);
  return ts.isArrowFunction(value) || ts.isFunctionExpression(value) ? value : null;
};

export const returnsOf = (body: ts.Block) => {
  const returned: ts.Expression[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isFunctionLike(node)) return;
    if (ts.isReturnStatement(node) && node.expression) returned.push(node.expression);
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(body, visit);
  return returned;
};

export const ownArguments = (body: ts.Node) => {
  let found: ts.Identifier | null = null;
  const visit = (node: ts.Node) => {
    if (found || (ts.isFunctionLike(node) && !ts.isArrowFunction(node))) return;
    if (ts.isIdentifier(node) && node.text === "arguments" && RuntimeLexicalScope.isReference(node)) found = node;
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(body, visit);
  return found as ts.Identifier | null;
};

export const declaredFunction = (
  expression: ts.Expression,
  lexical: RuntimeLexicalScope,
): ts.FunctionLikeDeclaration | null => {
  const callee = uncast(expression);
  if (ts.isIdentifier(callee)) {
    const declared = lexical.resolve(callee)?.parent;
    if (!declared) return null;
    if (ts.isFunctionDeclaration(declared)) return declared;
    if (!ts.isVariableDeclaration(declared) || !declared.initializer || !ts.isIdentifier(declared.name)) return null;
    const list = declared.parent;
    const constant = ts.isVariableDeclarationList(list) && !!(list.flags & ts.NodeFlags.Const);
    return constant ? inlineFunction(declared.initializer) : null;
  }
  if (!ts.isPropertyAccessExpression(callee) || !ts.isIdentifier(callee.expression)) return null;
  const owner = lexical.resolve(callee.expression)?.parent;
  if (!owner || !ts.isClassDeclaration(owner)) return null;
  const [method, ...others] = owner.members.filter(
    (member): member is ts.MethodDeclaration =>
      ts.isMethodDeclaration(member) &&
      !!member.body &&
      !!(ts.getCombinedModifierFlags(member) & ts.ModifierFlags.Static) &&
      staticName(member.name) === callee.name.text,
  );
  return method && !others.length ? method : null;
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
