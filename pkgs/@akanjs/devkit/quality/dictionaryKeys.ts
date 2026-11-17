import ts from "typescript";
import { RuntimeLexicalScope } from "./runtimeLexicalScope";

export interface DictionaryKeyUnread {
  line: number;
  why: string;
}

export interface DictionaryKeyRead {
  //? The first segment of every string the file holds, and every string that is one name: a superset of its groups.
  names: string[];
  //? PascalCase names, which a constant table turns into the groups of the enums, scalars and models they name.
  classNames: string[];
  //? One-name strings handed to a component as a prop (`modelName="memo"`): what a server module tells client UI.
  propNames: string[];
  api: boolean;
  unread: DictionaryKeyUnread[];
  //? A framework surface that shows the texts of whichever module its data names, not of the modules a page loads.
  anyModule: string | null;
}

const leadName = /^([A-Za-z_$][\w$]*)(?:\.|$)/;
const className = /^[A-Z][A-Za-z0-9]*$/;
const apiKey = /\.signal\.[^.\s]*\.(?:desc|arg)\b/;
const anyModuleSurfaces = new Set(["Signal", "Constant"]);
const frameworkUi = /^akanjs\/ui(?:\/(Signal|Constant)(?:\/|$)|$)/;
const oneName = /^[A-Za-z_$][\w$]*$/;
//? `Data.Dashboard` labels its columns `summary.<column>` unless it is handed another `summaryRefName`.
const impliedNames = new Map([["Dashboard", "summary"]]);
const tableMethods = new Set(["map", "forEach", "filter", "flatMap", "find", "findLast", "some", "every"]);
const subsetMethods = new Set(["filter", "slice", "sort", "toSorted", "reverse", "toReversed", "concat", "at"]);
const objectReaders = new Set(["keys", "values", "entries"]);
const maxDepth = 16;

const strip = (node: ts.Expression): ts.Expression =>
  ts.isParenthesizedExpression(node) ||
  ts.isAsExpression(node) ||
  ts.isSatisfiesExpression(node) ||
  ts.isNonNullExpression(node) ||
  ts.isTypeAssertionExpression(node)
    ? strip(node.expression)
    : node;

//* Which dictionary groups a client file can show: the keys it hands `l`, `l._`, `l.rich` or `translate` must come from
//* strings written in the file (a literal, a template with a literal group, a table or a typed union it holds).
export class DictionaryKeys {
  readonly #sourceFile: ts.SourceFile;
  readonly #scope = new RuntimeLexicalScope();
  readonly #translators = new Set(["l"]);
  readonly #names = new Set<string>();
  readonly #classNames = new Set<string>();
  readonly #propNames = new Set<string>();
  readonly #unread: DictionaryKeyUnread[] = [];
  #api = false;
  #anyModule: string | null = null;

  private constructor(sourceFile: ts.SourceFile) {
    this.#sourceFile = sourceFile;
  }

  static read(text: string, fileName: string): DictionaryKeyRead {
    const kind = fileName.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
    const sourceFile = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true, kind);
    return new DictionaryKeys(sourceFile).#read();
  }

  #read(): DictionaryKeyRead {
    this.#collectAliases(this.#sourceFile);
    this.#visit(this.#sourceFile);
    return {
      names: [...this.#names].sort(),
      classNames: [...this.#classNames].sort(),
      propNames: [...this.#propNames].sort(),
      api: this.#api,
      unread: this.#unread,
      anyModule: this.#anyModule,
    };
  }

  #collectAliases(node: ts.Node) {
    if (ts.isBindingElement(node) && node.propertyName && ts.isIdentifier(node.name)) {
      const property = node.propertyName;
      if (ts.isIdentifier(property) && property.text === "l") this.#translators.add(node.name.text);
    }
    ts.forEachChild(node, (child) => this.#collectAliases(child));
  }

  #visit(node: ts.Node) {
    if (ts.isImportDeclaration(node)) this.#readImport(node);
    else if (ts.isStringLiteralLike(node)) this.#addText(node.text, node.text);
    else if (ts.isTemplateExpression(node))
      this.#addText(node.head.text, [node.head.text, ...node.templateSpans.map((span) => span.literal.text)].join("*"));
    else if (ts.isIdentifier(node) && className.test(node.text)) this.#classNames.add(node.text);
    else if (ts.isCallExpression(node)) this.#readCall(node);
    else if (ts.isJsxAttribute(node) && node.initializer && ts.isStringLiteral(node.initializer)) {
      if (oneName.test(node.initializer.text)) this.#propNames.add(node.initializer.text);
    }
    const implied = ts.isPropertyAccessExpression(node) ? impliedNames.get(node.name.text) : undefined;
    if (implied) {
      this.#names.add(implied);
      this.#propNames.add(implied);
    }
    ts.forEachChild(node, (child) => this.#visit(child));
  }

  #addText(lead: string, pattern: string) {
    const name = lead.match(leadName)?.[1];
    if (name) this.#names.add(name);
    if (apiKey.test(pattern)) this.#api = true;
  }

  #readImport(node: ts.ImportDeclaration) {
    if (!ts.isStringLiteral(node.moduleSpecifier) || node.importClause?.isTypeOnly) return;
    const specifier = node.moduleSpecifier.text;
    const [matched, surface] = specifier.match(frameworkUi) ?? [];
    if (!matched) return;
    const bindings = node.importClause?.namedBindings;
    const named =
      bindings && ts.isNamedImports(bindings)
        ? bindings.elements
            .filter((element) => !element.isTypeOnly)
            .map((element) => (element.propertyName ?? element.name).text)
        : [];
    const shown = surface ?? named.find((name) => anyModuleSurfaces.has(name));
    if (shown) this.#anyModule ??= `${shown} from ${specifier} shows the texts of any module its data names`;
  }

  #readCall(call: ts.CallExpression) {
    for (const argument of call.arguments)
      if (this.#isTranslator(strip(argument))) this.#fail(argument, "passes the translator on");
    const key = this.#keyOf(call);
    if (!key || this.#follows(key, 0)) return;
    this.#fail(key, this.#whyOf(strip(key)));
  }

  #isTranslator(node: ts.Expression): boolean {
    if (ts.isIdentifier(node)) return this.#translators.has(node.text);
    if (!ts.isPropertyAccessExpression(node)) return false;
    const name = node.name.text;
    if (name === "l") return true;
    return (name === "_" || name === "rich") && this.#isTranslator(strip(node.expression));
  }

  #keyOf(call: ts.CallExpression): ts.Expression | undefined {
    const callee = strip(call.expression);
    if (this.#isTranslator(callee)) return call.arguments[0];
    const name = ts.isIdentifier(callee)
      ? callee.text
      : ts.isPropertyAccessExpression(callee)
        ? callee.name.text
        : null;
    if (name === "translate" || name === "translateByLocale")
      return call.arguments.length > 1 ? call.arguments[1] : undefined;
    return undefined;
  }

  #fail(node: ts.Node, why: string) {
    const { line } = this.#sourceFile.getLineAndCharacterOfPosition(node.getStart(this.#sourceFile));
    const text = node.getText(this.#sourceFile).replace(/\s+/g, " ");
    this.#unread.push({ line: line + 1, why: `${text.length > 60 ? `${text.slice(0, 57)}...` : text} ${why}` });
  }

  #whyOf(node: ts.Expression): string {
    if (ts.isCallExpression(node)) return "is a call's result";
    if (ts.isIdentifier(node)) {
      const declared = this.#scope.resolve(node)?.parent;
      if (!declared) return "is not declared in this file";
      if (ts.isImportSpecifier(declared) || ts.isImportClause(declared) || ts.isNamespaceImport(declared))
        return "is imported from another file";
      if (ts.isParameter(this.#rootOf(declared) ?? declared)) return "is a parameter or prop whose type names no key";
      return "is a variable this file does not hold as a written key";
    }
    if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node))
      return "is read from data at run time";
    return "is built from data at run time";
  }

  #rootOf(node: ts.Node): ts.Node | null {
    let at: ts.Node = node;
    while (ts.isBindingElement(at) || ts.isObjectBindingPattern(at) || ts.isArrayBindingPattern(at)) at = at.parent;
    return at === node ? null : at;
  }

  #follows(expression: ts.Expression, depth: number): boolean {
    if (depth > maxDepth) return false;
    const next = (inner: ts.Expression) => this.#follows(inner, depth + 1);
    const node = strip(expression);
    if (ts.isStringLiteralLike(node)) return true;
    if (ts.isTemplateExpression(node)) {
      if (node.head.text.includes(".")) return true;
      const [first] = node.templateSpans;
      return !node.head.text && !!first && first.literal.text.startsWith(".") && next(first.expression);
    }
    if (ts.isConditionalExpression(node)) return next(node.whenTrue) && next(node.whenFalse);
    if (ts.isBinaryExpression(node)) {
      const operator = node.operatorToken.kind;
      if (operator === ts.SyntaxKind.QuestionQuestionToken || operator === ts.SyntaxKind.BarBarToken)
        return next(node.left) && next(node.right);
      if (operator === ts.SyntaxKind.AmpersandAmpersandToken) return next(node.right);
      if (operator !== ts.SyntaxKind.PlusToken) return false;
      const left = strip(node.left);
      const right = strip(node.right);
      if (ts.isStringLiteralLike(left)) return left.text.includes(".");
      return next(left) && ts.isStringLiteralLike(right) && right.text.startsWith(".");
    }
    if (ts.isIdentifier(node)) return this.#bindingFollows(node, depth + 1, false);
    if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node))
      return this.#isTable(node.expression, depth + 1);
    return false;
  }

  #isTable(expression: ts.Expression, depth: number): boolean {
    if (depth > maxDepth) return false;
    const node = strip(expression);
    const value = (inner: ts.Expression) => this.#isValue(inner, depth + 1);
    if (ts.isArrayLiteralExpression(node))
      return node.elements.every((element) =>
        ts.isSpreadElement(element) ? this.#isTable(element.expression, depth + 1) : value(element),
      );
    if (ts.isObjectLiteralExpression(node))
      return node.properties.every((property) => {
        if (ts.isPropertyAssignment(property)) return value(property.initializer);
        if (ts.isShorthandPropertyAssignment(property)) return value(property.name);
        if (ts.isSpreadAssignment(property)) return this.#isTable(property.expression, depth + 1);
        return ts.isMethodDeclaration(property);
      });
    if (ts.isIdentifier(node)) return this.#bindingFollows(node, depth + 1, true);
    if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node))
      return this.#isTable(node.expression, depth + 1);
    if (!ts.isCallExpression(node)) return false;
    const callee = strip(node.expression);
    if (!ts.isPropertyAccessExpression(callee)) return false;
    const method = callee.name.text;
    if (ts.isIdentifier(callee.expression) && callee.expression.text === "Object" && objectReaders.has(method))
      return !!node.arguments[0] && this.#isTable(node.arguments[0], depth + 1);
    if (!subsetMethods.has(method)) return false;
    const own = this.#isTable(callee.expression, depth + 1);
    return own && (method !== "concat" || node.arguments.every((argument) => this.#isTable(argument, depth + 1)));
  }

  //? A value in a table is either text the file writes or something no key is made from (a number, an icon, a handler).
  #isValue(expression: ts.Expression, depth: number): boolean {
    const node = strip(expression);
    if (
      ts.isNumericLiteral(node) ||
      node.kind === ts.SyntaxKind.TrueKeyword ||
      node.kind === ts.SyntaxKind.FalseKeyword ||
      node.kind === ts.SyntaxKind.NullKeyword ||
      ts.isArrowFunction(node) ||
      ts.isFunctionExpression(node) ||
      ts.isJsxElement(node) ||
      ts.isJsxSelfClosingElement(node) ||
      ts.isJsxFragment(node) ||
      (ts.isIdentifier(node) && (node.text === "undefined" || className.test(node.text)))
    )
      return true;
    return this.#follows(node, depth) || this.#isTable(node, depth);
  }

  #bindingFollows(identifier: ts.Identifier, depth: number, asTable: boolean): boolean {
    const declared = this.#scope.resolve(identifier);
    if (!declared) return false;
    const declaration = declared.parent;
    const root = this.#rootOf(declaration) ?? declaration;
    if (ts.isParameter(root)) return this.#parameterFollows(root, declaration, depth, asTable);
    if (!ts.isVariableDeclaration(root)) return false;
    const list = root.parent;
    if (ts.isVariableDeclarationList(list) && ts.isForOfStatement(list.parent))
      return this.#isTable(list.parent.expression, depth + 1);
    if (!ts.isVariableDeclarationList(list) || !(list.flags & ts.NodeFlags.Const) || !root.initializer) return false;
    if (root !== declaration) return this.#isTable(root.initializer, depth + 1);
    return asTable ? this.#isTable(root.initializer, depth + 1) : this.#follows(root.initializer, depth + 1);
  }

  #parameterFollows(parameter: ts.ParameterDeclaration, declaration: ts.Node, depth: number, asTable: boolean) {
    if (parameter.type) {
      const property = ts.isBindingElement(declaration) ? (declaration.propertyName ?? declaration.name) : null;
      if (!property) return this.#typeFollows(parameter.type, depth + 1, asTable);
      const member = ts.isIdentifier(property) ? this.#memberType(parameter.type, property.text, depth) : null;
      return !!member && this.#typeFollows(member, depth + 1, asTable);
    }
    const callback = parameter.parent;
    const call = callback.parent;
    if (!(ts.isArrowFunction(callback) || ts.isFunctionExpression(callback)) || !ts.isCallExpression(call))
      return false;
    const callee = strip(call.expression);
    return (
      ts.isPropertyAccessExpression(callee) &&
      tableMethods.has(callee.name.text) &&
      callback.parameters[0] === parameter &&
      this.#isTable(callee.expression, depth + 1)
    );
  }

  #memberType(type: ts.TypeNode, name: string, depth: number): ts.TypeNode | null {
    if (depth > maxDepth) return null;
    if (ts.isTypeLiteralNode(type))
      for (const member of type.members)
        if (ts.isPropertySignature(member) && member.name.getText(this.#sourceFile) === name)
          return member.type ?? null;
    if (ts.isIntersectionTypeNode(type)) {
      for (const part of type.types) {
        const found = this.#memberType(part, name, depth + 1);
        if (found) return found;
      }
      return null;
    }
    if (!ts.isTypeReferenceNode(type) || !ts.isIdentifier(type.typeName)) return null;
    const declared = this.#typeDeclaration(type.typeName.text);
    if (declared && ts.isTypeAliasDeclaration(declared)) return this.#memberType(declared.type, name, depth + 1);
    if (!declared || !ts.isInterfaceDeclaration(declared)) return null;
    for (const member of declared.members)
      if (ts.isPropertySignature(member) && member.name.getText(this.#sourceFile) === name) return member.type ?? null;
    return null;
  }

  #typeFollows(type: ts.TypeNode, depth: number, asTable: boolean): boolean {
    if (depth > maxDepth) return false;
    const next = (inner: ts.TypeNode) => this.#typeFollows(inner, depth + 1, asTable);
    if (ts.isParenthesizedTypeNode(type)) return next(type.type);
    if (ts.isUnionTypeNode(type)) return type.types.every(next);
    if (ts.isLiteralTypeNode(type)) return true;
    if (type.kind === ts.SyntaxKind.UndefinedKeyword || type.kind === ts.SyntaxKind.NullKeyword) return true;
    if (ts.isTemplateLiteralTypeNode(type)) return type.head.text.includes(".");
    if (ts.isArrayTypeNode(type)) return asTable && next(type.elementType);
    if (ts.isTypeOperatorNode(type) && type.operator === ts.SyntaxKind.ReadonlyKeyword) return next(type.type);
    if (ts.isTypeOperatorNode(type) && type.operator === ts.SyntaxKind.KeyOfKeyword)
      return ts.isTypeQueryNode(type.type) && this.#queryIsTable(type.type, depth);
    if (ts.isIndexedAccessTypeNode(type)) {
      let object = type.objectType;
      while (ts.isParenthesizedTypeNode(object)) object = object.type;
      return ts.isTypeQueryNode(object) && this.#queryIsTable(object, depth);
    }
    if (!ts.isTypeReferenceNode(type) || !ts.isIdentifier(type.typeName)) return false;
    const declared = this.#typeDeclaration(type.typeName.text);
    return !!declared && ts.isTypeAliasDeclaration(declared) && next(declared.type);
  }

  #queryIsTable(query: ts.TypeQueryNode, depth: number): boolean {
    const name = query.exprName;
    return ts.isIdentifier(name) && this.#isTable(name, depth + 1);
  }

  #typeDeclaration(name: string): ts.TypeAliasDeclaration | ts.InterfaceDeclaration | undefined {
    return this.#sourceFile.statements.find(
      (statement): statement is ts.TypeAliasDeclaration | ts.InterfaceDeclaration =>
        (ts.isTypeAliasDeclaration(statement) || ts.isInterfaceDeclaration(statement)) && statement.name.text === name,
    );
  }
}
