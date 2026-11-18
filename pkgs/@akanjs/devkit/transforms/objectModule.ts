import ts from "typescript";
import { hasUseClientDirective } from "./rscUseClientTransform";

export type ObjectModuleClause =
  | "bare-import"
  | "reexport"
  | "effect-statement"
  | "call"
  | "effect-value"
  | "mutated-import";

export interface ObjectMemberImport {
  specifier: string;
  /** `*` for a namespace import, `default` for a default import. */
  imported: string;
}

export interface ObjectShape {
  /**
   * null: a member the analysis cannot point at a file (declared in the object's own file, or computed there).
   * `Doc.Zone` keys a member of an object literal written one level down (`{ Doc: { Zone } }`).
   */
  members: Map<string, ObjectMemberImport | null>;
  /** Members the analysis cannot list (a spread, a computed key, a source copied in that is no imported object). */
  open: boolean;
  /** Imported objects `Object.assign` copied in, in source order: each may hold a member the shape does not list. */
  copied: ObjectMemberImport[];
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

//? `Object.assign` returns its target, so `const X = Object.assign(Base, …)` and `Base.m = …` change one object.
interface ObjectRoot {
  literal: ts.ObjectLiteralExpression | null;
  edits: { member: string | null; value: ts.Expression }[];
}

interface Collected {
  imports: Map<string, ObjectMemberImport>;
  roots: Map<string, ObjectRoot>;
  exported: Map<string, string>;
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
const REACT_WRAPPERS = new Set(["memo", "forwardRef", "lazy", "createContext"]);

//* The rule a module meets before an importer may skip it and import the object's members instead. Every top-level
//* statement is a declaration (an import that binds names, a type, a directive, a `const` or `function`, an `export`
//* list) or puts a member on an object the module created above it (`X.m = v`, `Object.assign(X, …)`), and every
//* value evaluated at load is effect-free (no call but `Object.assign` onto the module's own object and React's
//* `memo`, `forwardRef`, `lazy` and `createContext`). Such a module only binds names, so an importer that never
//* reaches the object loses nothing by not running it. A re-export fails: skipping the module would skip the module
//* it re-exports from, which nothing else loads.
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
  readonly #collected: Collected = { imports: new Map(), roots: new Map(), exported: new Map() };
  readonly #objectShadowed: boolean;
  #failed: ObjectModuleFacts["failed"] = null;

  constructor(sourceFile: ts.SourceFile) {
    this.#sourceFile = sourceFile;
    this.#objectShadowed = ObjectModule.#bindsObject(sourceFile);
  }

  #facts(useClient: boolean): ObjectModuleFacts {
    for (const statement of this.#sourceFile.statements)
      if (ts.isFunctionDeclaration(statement) && statement.body)
        this.#collected.roots.set(statement.name?.text ?? "default", { literal: null, edits: [] });
    for (const statement of this.#sourceFile.statements) this.#collect(statement);
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
      const name = statement.name?.text ?? "default";
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
    const bindings = clause.namedBindings;
    if (!clause.name && bindings && ts.isNamedImports(bindings) && bindings.elements.length === 0)
      return this.#fail("bare-import", statement);
    const specifier = statement.moduleSpecifier.text;
    const { imports } = this.#collected;
    if (clause.name) imports.set(clause.name.text, { specifier, imported: "default" });
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
    if (statement.isTypeOnly) return;
    const clause = statement.exportClause;
    if (statement.moduleSpecifier) {
      const named = clause && ts.isNamedExports(clause) ? clause.elements : [];
      if (named.length === 0 || named.some((element) => !element.isTypeOnly)) this.#fail("reexport", statement);
      return;
    }
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
      const root = this.#rootNamed(expression.left.expression, "effect-statement");
      this.#checkValue(expression.right);
      root?.edits.push({ member: expression.left.name.text, value: expression.right });
      return;
    }
    const assign = this.#objectAssignOf(expression);
    const target = assign?.[0];
    if (assign && target) {
      const root = this.#rootNamed(target, "effect-statement");
      for (const source of assign.slice(1)) {
        this.#checkValue(source);
        root?.edits.push({ member: null, value: source });
      }
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
      const root = this.#rootOf(declaration.initializer);
      if (root) this.#collected.roots.set(declaration.name.text, root);
      if (exported) this.#collected.exported.set(declaration.name.text, declaration.name.text);
    }
  }

  #rootOf(node: ts.Expression): ObjectRoot | null {
    const value = ObjectModule.#unwrap(node);
    const assign = this.#objectAssignOf(value);
    if (!assign) {
      this.#checkValue(value);
      if (ts.isObjectLiteralExpression(value)) return { literal: value, edits: [] };
      return ObjectModule.#isFunction(value) ? { literal: null, edits: [] } : null;
    }
    const [target, ...sources] = assign;
    if (!target) {
      this.#fail("call", value);
      return null;
    }
    const unwrapped = ObjectModule.#unwrap(target);
    const fresh = ts.isObjectLiteralExpression(unwrapped) || ObjectModule.#isFunction(unwrapped);
    if (!fresh) this.#checkValue(unwrapped);
    const root = fresh ? this.#rootOf(unwrapped) : this.#rootNamed(unwrapped, "effect-value");
    for (const source of sources) {
      this.#checkValue(source);
      root?.edits.push({ member: null, value: source });
    }
    return root;
  }

  #rootNamed(node: ts.Expression, otherwise: ObjectModuleClause): ObjectRoot | null {
    const target = ObjectModule.#unwrap(node);
    const root = ts.isIdentifier(target) ? this.#collected.roots.get(target.text) : undefined;
    if (root) return root;
    this.#fail(this.#isImportBased(target) ? "mutated-import" : otherwise, node);
    return null;
  }

  #isImportBased(node: ts.Expression) {
    let current = ObjectModule.#unwrap(node);
    while (ts.isPropertyAccessExpression(current) || ts.isElementAccessExpression(current))
      current = ObjectModule.#unwrap(current.expression);
    return ts.isIdentifier(current) && this.#collected.imports.has(current.text);
  }

  #checkValue(node: ts.Expression): void {
    const value = ObjectModule.#unwrap(node);
    const assign = this.#objectAssignOf(value);
    if (assign) this.#checkObjectAssign(assign, value);
    else if (ts.isObjectLiteralExpression(value)) this.#checkObjectLiteral(value);
    else {
      const parts = this.#reactWrapped(value) ?? ObjectModule.#partsOf(value);
      if (typeof parts === "string") this.#fail(parts, value);
      else for (const part of parts) this.#checkValue(part);
    }
  }

  //? These four only wrap what they are given: none renders a component, runs a loader or reads a context at load.
  #reactWrapped(value: ts.Expression): ts.Expression[] | null {
    if (!ts.isCallExpression(value)) return null;
    const callee = value.expression;
    const { imports } = this.#collected;
    let wrapper = ts.isIdentifier(callee) ? imports.get(callee.text) : undefined;
    if (ts.isPropertyAccessExpression(callee) && ts.isIdentifier(callee.expression)) {
      const react = imports.get(callee.expression.text);
      if (react && ["default", "*"].includes(react.imported))
        wrapper = { specifier: react.specifier, imported: callee.name.text };
    }
    if (wrapper?.specifier !== "react" || !REACT_WRAPPERS.has(wrapper.imported)) return null;
    return value.arguments.map((argument) => (ts.isSpreadElement(argument) ? argument.expression : argument));
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

  //? Below a `const`, `Object.assign` may only fill a fresh object: one of the module's own would change unrecorded.
  #checkObjectAssign(args: ts.Expression[], node: ts.Node): void {
    const [target, ...sources] = args;
    if (!target) {
      this.#fail("call", node);
      return;
    }
    const unwrapped = ObjectModule.#unwrap(target);
    this.#checkValue(unwrapped);
    if (!ts.isObjectLiteralExpression(unwrapped) && !ObjectModule.#isFunction(unwrapped))
      this.#fail(this.#isImportBased(unwrapped) ? "mutated-import" : "effect-value", node);
    for (const source of sources) this.#checkValue(source);
  }

  #shapeOf(local: string): ObjectShape | null {
    const root = this.#collected.roots.get(local);
    if (!root || (!root.literal && root.edits.length === 0)) return null;
    const shape: ObjectShape = { members: new Map(), open: false, copied: [] };
    if (root.literal) this.#addLiteral(shape, root.literal);
    for (const { member, value } of root.edits) {
      if (member === null) this.#addSource(shape, value);
      else ObjectModule.#setMember(shape, member, this.#memberOf(value));
    }
    return shape;
  }

  static #setMember(shape: ObjectShape, key: string, member: ObjectMemberImport | null) {
    for (const known of shape.members.keys()) if (known.startsWith(`${key}.`)) shape.members.delete(known);
    shape.members.set(key, member);
  }

  //? A spread or computed key may overwrite any member listed before it, so none of those still names a file.
  static #cover(shape: ObjectShape, prefix: string) {
    if (!prefix) shape.open = true;
    for (const key of shape.members.keys()) if (key.startsWith(prefix)) shape.members.set(key, null);
  }

  //? `Object.assign` copies a source's own enumerable members: none from a function nothing put a member on.
  #addSource(shape: ObjectShape, node: ts.Expression) {
    const value = ObjectModule.#unwrap(node);
    if (ts.isObjectLiteralExpression(value)) return this.#addLiteral(shape, value);
    if (ObjectModule.#isFunction(value)) return;
    const root = ts.isIdentifier(value) ? this.#collected.roots.get(value.text) : undefined;
    if (root && !root.literal && root.edits.length === 0) return;
    const copied = ts.isIdentifier(value) && !root ? this.#collected.imports.get(value.text) : undefined;
    if (!copied || copied.imported === "*") return ObjectModule.#cover(shape, "");
    //? A later source wins: the copy may replace a member listed before it, and one listed after replaces the copy's.
    for (const key of shape.members.keys()) shape.members.set(key, null);
    shape.copied.push(copied);
  }

  static #isFunction(value: ts.Expression) {
    return ts.isArrowFunction(value) || ts.isFunctionExpression(value);
  }

  #addLiteral(shape: ObjectShape, literal: ts.ObjectLiteralExpression, prefix = "") {
    for (const property of literal.properties) {
      const name = ts.isSpreadAssignment(property) ? null : ObjectModule.#keyOf(property.name);
      if (name === null) {
        ObjectModule.#cover(shape, prefix);
        continue;
      }
      const key = `${prefix}${name}`;
      const value = ts.isPropertyAssignment(property) ? ObjectModule.#unwrap(property.initializer) : null;
      if (name.includes(".")) ObjectModule.#setMember(shape, key, null);
      else if (value && ts.isObjectLiteralExpression(value) && !prefix) {
        ObjectModule.#setMember(shape, key, null);
        this.#addLiteral(shape, value, `${key}.`);
      } else if (value) ObjectModule.#setMember(shape, key, this.#memberOf(value));
      else if (ts.isShorthandPropertyAssignment(property))
        ObjectModule.#setMember(shape, key, this.#memberOf(property.name));
      else ObjectModule.#setMember(shape, key, null);
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

  #objectAssignOf(node: ts.Expression): ts.Expression[] | null {
    if (this.#objectShadowed || !ts.isCallExpression(node)) return null;
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

  static #bindsObject(sourceFile: ts.SourceFile) {
    const names: (ts.Node | undefined)[] = [];
    for (const statement of sourceFile.statements) {
      if (ts.isImportDeclaration(statement)) {
        const bindings = statement.importClause?.namedBindings;
        names.push(statement.importClause?.name);
        if (bindings && ts.isNamespaceImport(bindings)) names.push(bindings.name);
        else if (bindings) names.push(...bindings.elements.map((element) => element.name));
      } else if (ts.isVariableStatement(statement))
        names.push(...statement.declarationList.declarations.map((declaration) => declaration.name));
      else if (
        ts.isFunctionDeclaration(statement) ||
        ts.isClassDeclaration(statement) ||
        ts.isEnumDeclaration(statement) ||
        ts.isModuleDeclaration(statement) ||
        ts.isImportEqualsDeclaration(statement)
      )
        names.push(statement.name);
    }
    return names.some((name) => name !== undefined && ts.isIdentifier(name) && name.text === "Object");
  }

  static #isTypeOnly(statement: ts.Statement) {
    if (ts.isInterfaceDeclaration(statement) || ts.isTypeAliasDeclaration(statement)) return true;
    if (ObjectModule.#hasModifier(statement, ts.SyntaxKind.DeclareKeyword)) return true;
    if (ts.isEnumDeclaration(statement)) return ObjectModule.#hasModifier(statement, ts.SyntaxKind.ConstKeyword);
    if (ts.isFunctionDeclaration(statement)) return !statement.body;
    return ts.isEmptyStatement(statement);
  }
}
