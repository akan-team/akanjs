import ts from "typescript";
import { hasUseClientDirective } from "./rscUseClientTransform";

export type ObjectModuleClause = "bare-import" | "effect-statement" | "call" | "effect-value" | "mutated-import";

export interface ObjectMemberImport {
  specifier: string;
  /** `*` for a namespace import, `default` for a default import. */
  imported: string;
}

export interface ObjectShape {
  /** null: a member the analysis cannot point at a file (declared in the object's own file, or computed there). */
  members: Map<string, ObjectMemberImport | null>;
  /** Members the analysis cannot list (a spread, a computed key, an object copied in by name). */
  open: boolean;
}

export interface ObjectModuleFacts {
  useClient: boolean;
  failed: { clause: ObjectModuleClause; line: number } | null;
  objects: Map<string, ObjectShape>;
}

export interface ModuleExports {
  names: Set<string>;
  star: boolean;
  useClient: boolean;
}

interface Collected {
  imports: Map<string, ObjectMemberImport>;
  locals: Map<string, ts.Expression | null>;
  exported: Map<string, string>;
  assigned: { target: string; member: string | null; value: ts.Expression; node: ts.Node }[];
}

const STAR_EXPORT_RE = /(?:^|\n)\s*export\s*\*\s*from\b/;
const ASSIGN_OPERATORS = new Set([
  ts.SyntaxKind.EqualsToken,
  ts.SyntaxKind.PlusEqualsToken,
  ts.SyntaxKind.MinusEqualsToken,
  ts.SyntaxKind.AsteriskEqualsToken,
  ts.SyntaxKind.SlashEqualsToken,
  ts.SyntaxKind.PercentEqualsToken,
  ts.SyntaxKind.AmpersandAmpersandEqualsToken,
  ts.SyntaxKind.BarBarEqualsToken,
  ts.SyntaxKind.QuestionQuestionEqualsToken,
]);

//* The rule a module meets before an importer may skip it and import the object's members instead. Every top-level
//* statement is a declaration (an import or re-export that binds names, a type, a directive, a `const` or `function`,
//* an `export` list) or puts a member on an object the module declares (`X.m = v`, `Object.assign(X, …)`), and every
//* value evaluated at load is effect-free (no call but `Object.assign` onto the module's own object). Such a module
//* only binds names, so an importer that never reaches the object loses nothing by not running it.
export class ObjectModule {
  static scriptKindOf(file: string): ts.ScriptKind {
    if (file.endsWith(".tsx")) return ts.ScriptKind.TSX;
    if (file.endsWith(".jsx")) return ts.ScriptKind.JSX;
    if (/\.[cm]?js$/.test(file)) return ts.ScriptKind.JS;
    return ts.ScriptKind.TS;
  }

  static read(source: string, file: string): ObjectModuleFacts {
    const sourceFile = ts.createSourceFile(
      file,
      source,
      ts.ScriptTarget.Latest,
      false,
      ObjectModule.scriptKindOf(file),
    );
    const reader = new ObjectModule(sourceFile);
    return reader.#facts(hasUseClientDirective(source));
  }

  static readonly #tsTranspiler = new Bun.Transpiler({ loader: "ts" });
  static readonly #tsxTranspiler = new Bun.Transpiler({ loader: "tsx" });

  static exportsOf(source: string, file: string): ModuleExports {
    const jsx = [ts.ScriptKind.TSX, ts.ScriptKind.JSX].includes(ObjectModule.scriptKindOf(file));
    let names: string[] = [];
    try {
      names = (jsx ? ObjectModule.#tsxTranspiler : ObjectModule.#tsTranspiler).scan(source).exports;
    } catch {
      return { names: new Set(), star: true, useClient: hasUseClientDirective(source) };
    }
    return { names: new Set(names), star: STAR_EXPORT_RE.test(source), useClient: hasUseClientDirective(source) };
  }

  readonly #sourceFile: ts.SourceFile;
  readonly #collected: Collected = { imports: new Map(), locals: new Map(), exported: new Map(), assigned: [] };
  #failed: ObjectModuleFacts["failed"] = null;

  constructor(sourceFile: ts.SourceFile) {
    this.#sourceFile = sourceFile;
  }

  #facts(useClient: boolean): ObjectModuleFacts {
    for (const statement of this.#sourceFile.statements) this.#collect(statement);
    const { locals, assigned, imports } = this.#collected;
    for (const [, init] of locals) if (init) this.#checkValue(init);
    for (const { target, value, node } of assigned) {
      if (imports.has(target)) this.#fail("mutated-import", node);
      else if (!locals.has(target)) this.#fail("effect-statement", node);
      this.#checkValue(value);
    }
    const objects = new Map<string, ObjectShape>();
    for (const [name, local] of this.#collected.exported) {
      const shape = this.#shapeOf(local);
      if (shape) objects.set(name, shape);
    }
    return { useClient, failed: this.#failed, objects };
  }

  #fail(clause: ObjectModuleClause, node: ts.Node) {
    if (this.#failed) return;
    const line = this.#sourceFile.getLineAndCharacterOfPosition(node.getStart(this.#sourceFile)).line + 1;
    this.#failed = { clause, line };
  }

  #collect(statement: ts.Statement) {
    if (ts.isImportDeclaration(statement)) return this.#collectImport(statement);
    if (ts.isExportDeclaration(statement)) return this.#collectExportList(statement);
    if (ObjectModule.#isTypeOnly(statement)) return;
    if (ts.isExpressionStatement(statement)) return this.#collectExpression(statement);
    if (ts.isFunctionDeclaration(statement)) {
      if (!statement.body) return;
      const name = statement.name?.text ?? "default";
      this.#collected.locals.set(name, null);
      if (ObjectModule.#hasModifier(statement, ts.SyntaxKind.DefaultKeyword))
        this.#collected.exported.set("default", name);
      else if (ObjectModule.#hasModifier(statement, ts.SyntaxKind.ExportKeyword))
        this.#collected.exported.set(name, name);
      return;
    }
    if (ts.isVariableStatement(statement)) return this.#collectVariables(statement);
    if (ts.isExportAssignment(statement) && !statement.isExportEquals) return this.#checkValue(statement.expression);
    this.#fail("effect-statement", statement);
  }

  #collectImport(statement: ts.ImportDeclaration) {
    const clause = statement.importClause;
    if (!clause) return this.#fail("bare-import", statement);
    if (clause.phaseModifier === ts.SyntaxKind.TypeKeyword || !ts.isStringLiteral(statement.moduleSpecifier)) return;
    const specifier = statement.moduleSpecifier.text;
    const { imports } = this.#collected;
    if (clause.name) imports.set(clause.name.text, { specifier, imported: "default" });
    const bindings = clause.namedBindings;
    if (!bindings) return;
    if (ts.isNamespaceImport(bindings)) {
      imports.set(bindings.name.text, { specifier, imported: "*" });
      return;
    }
    for (const element of bindings.elements) {
      if (element.isTypeOnly) continue;
      imports.set(element.name.text, { specifier, imported: (element.propertyName ?? element.name).text });
    }
  }

  #collectExportList(statement: ts.ExportDeclaration) {
    if (statement.moduleSpecifier || statement.isTypeOnly) return;
    const clause = statement.exportClause;
    if (!clause || !ts.isNamedExports(clause)) return;
    for (const element of clause.elements) {
      if (element.isTypeOnly) continue;
      this.#collected.exported.set(element.name.text, (element.propertyName ?? element.name).text);
    }
  }

  #collectExpression(statement: ts.ExpressionStatement) {
    const expression = ObjectModule.#unwrap(statement.expression);
    if (ts.isStringLiteral(expression)) return;
    if (
      ts.isBinaryExpression(expression) &&
      expression.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      ts.isPropertyAccessExpression(expression.left) &&
      ts.isIdentifier(expression.left.expression)
    ) {
      this.#collected.assigned.push({
        target: expression.left.expression.text,
        member: expression.left.name.text,
        value: expression.right,
        node: statement,
      });
      return;
    }
    const assign = ObjectModule.#objectAssignOf(expression);
    const target = assign?.[0];
    if (assign && target && ts.isIdentifier(target)) {
      for (const source of assign.slice(1))
        this.#collected.assigned.push({ target: target.text, member: null, value: source, node: statement });
      return;
    }
    this.#fail("effect-statement", statement);
  }

  #collectVariables(statement: ts.VariableStatement) {
    if (ObjectModule.#hasModifier(statement, ts.SyntaxKind.DeclareKeyword)) return;
    if (!(statement.declarationList.flags & ts.NodeFlags.Const)) return this.#fail("effect-statement", statement);
    const exported = ObjectModule.#hasModifier(statement, ts.SyntaxKind.ExportKeyword);
    for (const declaration of statement.declarationList.declarations) {
      if (!ts.isIdentifier(declaration.name) || !declaration.initializer) {
        this.#fail("effect-statement", declaration);
        continue;
      }
      this.#collected.locals.set(declaration.name.text, declaration.initializer);
      if (exported) this.#collected.exported.set(declaration.name.text, declaration.name.text);
    }
  }

  #checkValue(node: ts.Expression): void {
    const value = ObjectModule.#unwrap(node);
    const assign = ObjectModule.#objectAssignOf(value);
    if (assign) this.#checkObjectAssign(assign, value);
    else if (ts.isObjectLiteralExpression(value)) this.#checkObjectLiteral(value);
    else {
      const parts = ObjectModule.#partsOf(value);
      if (typeof parts === "string") this.#fail(parts, value);
      else for (const part of parts) this.#checkValue(part);
    }
  }

  static #partsOf(value: ts.Expression): ts.Expression[] | ObjectModuleClause {
    if (
      ts.isIdentifier(value) ||
      ts.isLiteralExpression(value) ||
      ts.isArrowFunction(value) ||
      ts.isFunctionExpression(value) ||
      [ts.SyntaxKind.TrueKeyword, ts.SyntaxKind.FalseKeyword, ts.SyntaxKind.NullKeyword].includes(value.kind)
    )
      return [];
    if (ts.isTemplateExpression(value)) return value.templateSpans.map((span) => span.expression);
    if (ts.isArrayLiteralExpression(value))
      return value.elements
        .filter((element) => !ts.isOmittedExpression(element))
        .map((element) => (ts.isSpreadElement(element) ? element.expression : element));
    if (ts.isPropertyAccessExpression(value)) return [value.expression];
    if (ts.isElementAccessExpression(value)) return [value.expression, value.argumentExpression];
    if (ts.isConditionalExpression(value)) return [value.condition, value.whenTrue, value.whenFalse];
    if (ts.isBinaryExpression(value))
      return ASSIGN_OPERATORS.has(value.operatorToken.kind) ? "effect-value" : [value.left, value.right];
    if (ts.isPrefixUnaryExpression(value))
      return [ts.SyntaxKind.PlusPlusToken, ts.SyntaxKind.MinusMinusToken].includes(value.operator)
        ? "effect-value"
        : [value.operand];
    if (ts.isTypeOfExpression(value) || ts.isVoidExpression(value)) return [value.expression];
    if (ts.isCallExpression(value) || ts.isNewExpression(value) || ts.isTaggedTemplateExpression(value)) return "call";
    return "effect-value";
  }

  #checkObjectLiteral(value: ts.ObjectLiteralExpression): void {
    for (const property of value.properties) {
      if (property.name && ts.isComputedPropertyName(property.name)) this.#checkValue(property.name.expression);
      if (ts.isPropertyAssignment(property)) this.#checkValue(property.initializer);
      else if (ts.isSpreadAssignment(property)) this.#checkValue(property.expression);
    }
  }

  #checkObjectAssign(args: ts.Expression[], node: ts.Node): void {
    const [target, ...sources] = args;
    if (!target) return;
    const unwrapped = ObjectModule.#unwrap(target);
    if (ts.isIdentifier(unwrapped)) {
      if (this.#collected.imports.has(unwrapped.text)) this.#fail("mutated-import", node);
      else if (!this.#collected.locals.has(unwrapped.text)) this.#fail("effect-value", node);
    } else this.#checkValue(unwrapped);
    for (const source of sources) this.#checkValue(source);
  }

  #shapeOf(local: string): ObjectShape | null {
    const { locals, assigned } = this.#collected;
    if (!locals.has(local)) return null;
    const init = locals.get(local);
    const shape: ObjectShape = { members: new Map(), open: false };
    let isObject = false;
    const value = init ? ObjectModule.#unwrap(init) : null;
    if (value && ts.isObjectLiteralExpression(value)) {
      isObject = true;
      this.#addLiteral(shape, value);
    } else if (value) {
      const assign = ObjectModule.#objectAssignOf(value);
      if (assign) {
        isObject = true;
        for (const arg of assign) this.#addSource(shape, arg);
      }
    }
    for (const entry of assigned) {
      if (entry.target !== local) continue;
      isObject = true;
      if (entry.member === null) this.#addSource(shape, entry.value);
      else shape.members.set(entry.member, this.#memberOf(entry.value));
    }
    return isObject ? shape : null;
  }

  #addSource(shape: ObjectShape, node: ts.Expression) {
    const value = ObjectModule.#unwrap(node);
    if (ts.isObjectLiteralExpression(value)) this.#addLiteral(shape, value);
    else if (!ts.isArrowFunction(value) && !ts.isFunctionExpression(value) && !this.#isLocalFunction(value))
      shape.open = true;
  }

  #isLocalFunction(value: ts.Expression) {
    if (!ts.isIdentifier(value) || !this.#collected.locals.has(value.text)) return false;
    const init = this.#collected.locals.get(value.text);
    if (!init) return true;
    const unwrapped = ObjectModule.#unwrap(init);
    return ts.isArrowFunction(unwrapped) || ts.isFunctionExpression(unwrapped);
  }

  #addLiteral(shape: ObjectShape, literal: ts.ObjectLiteralExpression) {
    for (const property of literal.properties) {
      if (ts.isSpreadAssignment(property)) {
        shape.open = true;
        continue;
      }
      const key = ObjectModule.#keyOf(property.name);
      if (key === null) {
        shape.open = true;
        continue;
      }
      if (ts.isPropertyAssignment(property)) shape.members.set(key, this.#memberOf(property.initializer));
      else if (ts.isShorthandPropertyAssignment(property)) shape.members.set(key, this.#memberOf(property.name));
      else shape.members.set(key, null);
    }
  }

  #memberOf(node: ts.Expression): ObjectMemberImport | null {
    const value = ObjectModule.#unwrap(node);
    if (ts.isIdentifier(value)) return this.#collected.imports.get(value.text) ?? null;
    if (ts.isPropertyAccessExpression(value) && ts.isIdentifier(value.expression)) {
      const namespace = this.#collected.imports.get(value.expression.text);
      if (namespace?.imported === "*") return { specifier: namespace.specifier, imported: value.name.text };
    }
    return null;
  }

  static #keyOf(name: ts.PropertyName | undefined): string | null {
    if (!name) return null;
    if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) return name.text;
    return null;
  }

  static #objectAssignOf(node: ts.Expression): ts.Expression[] | null {
    if (!ts.isCallExpression(node)) return null;
    const callee = node.expression;
    if (!ts.isPropertyAccessExpression(callee) || callee.name.text !== "assign") return null;
    if (!ts.isIdentifier(callee.expression) || callee.expression.text !== "Object") return null;
    if (node.arguments.some((arg) => ts.isSpreadElement(arg))) return null;
    return [...node.arguments];
  }

  static #unwrap(node: ts.Expression): ts.Expression {
    let current = node;
    while (
      ts.isParenthesizedExpression(current) ||
      ts.isAsExpression(current) ||
      ts.isSatisfiesExpression(current) ||
      ts.isNonNullExpression(current) ||
      ts.isTypeAssertionExpression(current)
    )
      current = current.expression;
    return current;
  }

  static #hasModifier(node: ts.Node, kind: ts.SyntaxKind) {
    return ts.canHaveModifiers(node) && (ts.getModifiers(node) ?? []).some((modifier) => modifier.kind === kind);
  }

  static #isTypeOnly(statement: ts.Statement) {
    if (ts.isInterfaceDeclaration(statement) || ts.isTypeAliasDeclaration(statement)) return true;
    if (ObjectModule.#hasModifier(statement, ts.SyntaxKind.DeclareKeyword)) return true;
    if (ts.isEnumDeclaration(statement)) return ObjectModule.#hasModifier(statement, ts.SyntaxKind.ConstKeyword);
    if (ts.isFunctionDeclaration(statement)) return !statement.body;
    return ts.isEmptyStatement(statement);
  }
}
