import ts from "typescript";
import { RuntimeLexicalScope } from "./runtimeLexicalScope";

type Held = "translator" | "plain" | "unknown";
type Use = "asTranslator" | "ownMember" | "other";

const iterations = new Set([
  "map",
  "forEach",
  "filter",
  "flatMap",
  "find",
  "findLast",
  "findIndex",
  "findLastIndex",
  "some",
  "every",
  "sort",
  "toSorted",
  "reduce",
  "reduceRight",
]);
const accumulations = new Set(["reduce", "reduceRight"]);
const callingMembers = ["call", "apply", "bind"];
const translatorMembers = new Set(["_", "rich", "trans", "field", "enum", ...callingMembers]);
const plainTypes = new Set([
  ts.SyntaxKind.StringKeyword,
  ts.SyntaxKind.NumberKeyword,
  ts.SyntaxKind.BooleanKeyword,
  ts.SyntaxKind.BigIntKeyword,
]);
//? A translator inside an array or object literal is itself a use the reader reports, so the literal holds none unseen.
const plainKinds = new Set([
  ts.SyntaxKind.TrueKeyword,
  ts.SyntaxKind.FalseKeyword,
  ts.SyntaxKind.NullKeyword,
  ts.SyntaxKind.NumericLiteral,
  ts.SyntaxKind.BigIntLiteral,
  ts.SyntaxKind.RegularExpressionLiteral,
  ts.SyntaxKind.TemplateExpression,
  ts.SyntaxKind.ArrayLiteralExpression,
  ts.SyntaxKind.ObjectLiteralExpression,
  ts.SyntaxKind.PrefixUnaryExpression,
  ts.SyntaxKind.PostfixUnaryExpression,
  ts.SyntaxKind.TypeOfExpression,
]);
const eitherSide = new Set([
  ts.SyntaxKind.BarBarToken,
  ts.SyntaxKind.AmpersandAmpersandToken,
  ts.SyntaxKind.QuestionQuestionToken,
]);
const replacing = new Set([
  ts.SyntaxKind.EqualsToken,
  ts.SyntaxKind.BarBarEqualsToken,
  ts.SyntaxKind.AmpersandAmpersandEqualsToken,
  ts.SyntaxKind.QuestionQuestionEqualsToken,
]);

const isWrapper = (node: ts.Node): node is ts.Expression & { expression: ts.Expression } =>
  ts.isParenthesizedExpression(node) ||
  ts.isAsExpression(node) ||
  ts.isSatisfiesExpression(node) ||
  ts.isNonNullExpression(node) ||
  ts.isTypeAssertionExpression(node);

const isPattern = (node: ts.Node) =>
  ts.isArrayLiteralExpression(node) ||
  ts.isObjectLiteralExpression(node) ||
  ts.isPropertyAssignment(node) ||
  ts.isShorthandPropertyAssignment(node) ||
  ts.isSpreadElement(node) ||
  ts.isSpreadAssignment(node);

const isPlain = (expression: ts.Expression): boolean => {
  if (isWrapper(expression)) return isPlain(expression.expression);
  if (ts.isStringLiteralLike(expression) || plainKinds.has(expression.kind)) return true;
  if (ts.isPropertyAccessExpression(expression)) return expression.name.text === "length";
  if (ts.isConditionalExpression(expression)) return isPlain(expression.whenTrue) && isPlain(expression.whenFalse);
  if (!ts.isBinaryExpression(expression)) return false;
  const operator = expression.operatorToken.kind;
  if (eitherSide.has(operator)) return isPlain(expression.left) && isPlain(expression.right);
  const assigns = operator >= ts.SyntaxKind.FirstAssignment && operator <= ts.SyntaxKind.LastAssignment;
  return !assigns && operator !== ts.SyntaxKind.CommaToken;
};

//? A name counts as the translator unless shown otherwise: a missed translator drops texts, a mistaken one loads more.
export class TranslatorBindings {
  readonly #sourceFile: ts.SourceFile;
  readonly #scope: RuntimeLexicalScope;
  readonly #names: ReadonlySet<string>;
  readonly #others = new Map<ts.Identifier, boolean>();
  #uses: Map<ts.Identifier, Use[]> | null = null;

  constructor(sourceFile: ts.SourceFile, scope: RuntimeLexicalScope, names: ReadonlySet<string>) {
    this.#sourceFile = sourceFile;
    this.#scope = scope;
    this.#names = names;
  }

  isOther(identifier: ts.Identifier): boolean {
    const declared = this.#scope.resolve(identifier);
    if (!declared) return false;
    const known = this.#others.get(declared);
    if (known !== undefined) return known;
    const other = this.#decide(declared);
    this.#others.set(declared, other);
    return other;
  }

  #decide(declared: ts.Identifier): boolean {
    const held = TranslatorBindings.#heldBy(declared);
    if (held === "translator") return false;
    const uses = this.#usesOf(declared);
    if (uses.every((use) => use === "ownMember")) return true;
    return held === "plain" && !uses.includes("asTranslator");
  }

  static #heldBy(name: ts.Identifier): Held {
    let declaration: ts.Node = name.parent;
    while (ts.isBindingElement(declaration) && ts.isArrayBindingPattern(declaration.parent)) {
      if (declaration.initializer) return "unknown";
      declaration = declaration.parent.parent;
    }
    if (ts.isParameter(declaration)) return TranslatorBindings.#parameterIsPlain(declaration) ? "plain" : "unknown";
    if (!ts.isVariableDeclaration(declaration)) return "translator";
    if (declaration.type) return plainTypes.has(declaration.type.kind) ? "plain" : "unknown";
    const list = declaration.parent;
    if (!ts.isVariableDeclarationList(list)) return "unknown";
    if (ts.isForOfStatement(list.parent) || ts.isForInStatement(list.parent)) return "plain";
    const { initializer } = declaration;
    return declaration.name === name && initializer && isPlain(initializer) ? "plain" : "unknown";
  }

  static #parameterIsPlain(parameter: ts.ParameterDeclaration): boolean {
    if (parameter.type) return plainTypes.has(parameter.type.kind);
    if (parameter.initializer || parameter.dotDotDotToken) return false;
    const callback = parameter.parent;
    const call = callback.parent;
    if (!(ts.isArrowFunction(callback) || ts.isFunctionExpression(callback)) || !ts.isCallExpression(call))
      return false;
    if (!call.arguments.includes(callback) || !ts.isPropertyAccessExpression(call.expression)) return false;
    const method = call.expression.name.text;
    return iterations.has(method) && !(accumulations.has(method) && callback.parameters[0] === parameter);
  }

  #usesOf(declared: ts.Identifier): Use[] {
    if (!this.#uses) {
      const uses = new Map<ts.Identifier, Use[]>();
      const visit = (node: ts.Node) => {
        if (ts.isIdentifier(node) && this.#names.has(node.text) && RuntimeLexicalScope.isReference(node)) {
          const binding = this.#scope.resolve(node);
          if (binding) uses.set(binding, [...(uses.get(binding) ?? []), TranslatorBindings.#useOf(node)]);
        }
        ts.forEachChild(node, visit);
      };
      visit(this.#sourceFile);
      this.#uses = uses;
    }
    return this.#uses.get(declared) ?? [];
  }

  static #useOf(reference: ts.Identifier): Use {
    let outer: ts.Node = reference;
    while (isWrapper(outer.parent)) outer = outer.parent;
    const { parent } = outer;
    if (ts.isCallExpression(parent) && parent.expression === outer) return "asTranslator";
    if (ts.isTaggedTemplateExpression(parent) && parent.tag === outer) return "asTranslator";
    if (ts.isPropertyAccessExpression(parent) && parent.expression === outer)
      return translatorMembers.has(parent.name.text) ? "asTranslator" : "ownMember";
    if (ts.isElementAccessExpression(parent) && parent.expression === outer) {
      const key = parent.argumentExpression;
      if (ts.isNumericLiteral(key)) return "ownMember";
      if (!ts.isStringLiteralLike(key)) return "other";
      return translatorMembers.has(key.text) ? "asTranslator" : "ownMember";
    }
    return TranslatorBindings.#isReplaced(outer) ? "asTranslator" : "other";
  }

  static #isReplaced(reference: ts.Node): boolean {
    let target = reference;
    while (isPattern(target.parent) || isWrapper(target.parent)) target = target.parent;
    const { parent } = target;
    if (ts.isForOfStatement(parent) || ts.isForInStatement(parent)) return parent.initializer === target;
    if (!ts.isBinaryExpression(parent) || parent.left !== target) return false;
    return replacing.has(parent.operatorToken.kind) && (target !== reference || !isPlain(parent.right));
  }
}
