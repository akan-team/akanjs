import path from "node:path";
import ts from "typescript";
import { RuntimeLexicalScope } from "./runtimeLexicalScope";
import type { RuntimeFamily, RuntimeNameTable } from "./runtimeNameTable";

export const runtimeUseReasons = [
  "computed-access",
  "cast",
  "passed-on",
  "re-exported",
  "hidden-by-destructuring",
  "unknown-name",
  "whole-runtime-import",
] as const;
export type RuntimeUseReason = (typeof runtimeUseReasons)[number];

export interface RuntimeUseOwner {
  scope: string;
  module: string;
  needs: "store" | "descriptor";
}

export interface RuntimeUseProblem {
  reason: RuntimeUseReason;
  line: number;
  column: number;
  text: string;
  message: string;
}

export type RuntimeUseVerdict =
  | { resolvable: true; owners: RuntimeUseOwner[]; base: boolean; scopes: string[] }
  | ({ resolvable: false; problems: RuntimeUseProblem[] } & RuntimeUseProblem);

export interface RuntimeUseOptions {
  runtimeOf?: (specifier: string, fileName: string) => RuntimeImportTarget | null;
}

export type RuntimeImportKind = "client" | "useClient" | "usePage" | "st" | "sig" | "framework-store";

export interface RuntimeImportTarget {
  scope: string | null;
  kind: RuntimeImportKind;
}

type HandleKind = "st" | "root" | "state" | "fetch" | Exclude<RuntimeFamily, "fetch">;

interface Handle {
  kind: HandleKind;
  scope: string;
}

type Binding =
  | { type: "handle"; handle: Handle }
  | { type: "rootStore"; scope: string }
  | { type: "whole"; scope: string; name: string }
  | { type: "unknown"; scope: string; name: string };

type Step =
  | { leaf: RuntimeFamily; key: string }
  | { handle: Handle }
  | { method: "get" | "set" | "sel" | "ref" | "sub" }
  | { none: true }
  | { unknown: true };

type TableOf = (scope: string) => RuntimeNameTable | null;

const runtimeSpecifierPattern = /\/(?:client|useClient|usePage|st|sig)(?:\.tsx?)?["']|RootStore|["']akanjs\/store["']/;
const runtimePathPattern = /^((?:apps|libs)\/[^/]+)\/(client|lib\/useClient|lib\/usePage|lib\/st|lib\/sig)$/;
const quietExports = new Set(["usePage", "msg", "Err", "cnst"]);
const storeMethods = new Set(["get", "set", "sel", "ref", "sub"]);
const agenticMembers = new Set(["tool", "expose", "useState"]);

export class RuntimeUse {
  readonly #source: ts.SourceFile;
  readonly #fileName: string;
  readonly #tableOf: TableOf;
  readonly #options: RuntimeUseOptions;
  readonly #lexical = new RuntimeLexicalScope();
  readonly #bindings = new Map<ts.Identifier, Binding>();
  readonly #owners = new Map<string, RuntimeUseOwner>();
  readonly #problems: (RuntimeUseProblem & { position: number })[] = [];
  readonly #scopes = new Set<string>();
  #base = false;
  #recording: boolean = false;

  static mayUseRuntime(text: string) {
    return runtimeSpecifierPattern.test(text);
  }

  //? `fileName` is relative to the workspace root, as `apps/<app>/ui/Card.tsx`: it decides the file's own scope.
  static analyze(
    input: { fileName: string; text: string; sourceFile?: ts.SourceFile },
    tableOf: TableOf,
    options: RuntimeUseOptions = {},
  ): RuntimeUseVerdict {
    if (!RuntimeUse.mayUseRuntime(input.text)) return { resolvable: true, owners: [], base: false, scopes: [] };
    const source =
      input.sourceFile ??
      ts.createSourceFile(input.fileName, input.text, ts.ScriptTarget.Latest, true, RuntimeUse.#kindOf(input.fileName));
    return new RuntimeUse(source, input.fileName, tableOf, options).#run();
  }

  static targetOf(specifier: string, fileName: string): RuntimeImportTarget | null {
    const fileScope = fileName.match(/^((?:apps|libs)\/[^/]+)\//)?.[1] ?? null;
    if (specifier === "akanjs/store") return { scope: fileScope, kind: "framework-store" };
    const aliased = specifier.match(/^@(apps|libs)\/(.+)$/);
    const resolved = aliased
      ? `${aliased[1]}/${aliased[2]}`
      : specifier.startsWith(".")
        ? path.posix.normalize(path.posix.join(path.posix.dirname(fileName), specifier))
        : null;
    const match = resolved
      ?.replace(/\.(?:tsx?|jsx?)$/, "")
      .replace(/\/index$/, "")
      .match(runtimePathPattern);
    if (!match?.[1] || !match[2]) return null;
    return { scope: match[1], kind: match[2].replace(/^lib\//, "") as RuntimeImportKind };
  }

  private constructor(source: ts.SourceFile, fileName: string, tableOf: TableOf, options: RuntimeUseOptions) {
    this.#source = source;
    this.#fileName = fileName;
    this.#tableOf = tableOf;
    this.#options = options;
  }

  #run(): RuntimeUseVerdict {
    this.#readImports();
    if (!this.#bindings.size && !this.#problems.length && !/\bimport\s*\(/.test(this.#source.text))
      return { resolvable: true, owners: [], base: false, scopes: [] };
    //? A use may sit above the alias it reads, inside a function declared first: walk until no new alias appears.
    for (let round = 0, size = -1; round < 4 && size !== this.#bindings.size; round++) {
      size = this.#bindings.size;
      this.#visit(this.#source);
    }
    this.#recording = true;
    this.#visit(this.#source);
    const problems = this.#problems
      .sort((a, b) => a.position - b.position)
      .map(({ position: _, ...problem }) => problem);
    const [first] = problems;
    if (first) return { resolvable: false, ...first, problems };
    const owners = [...this.#owners.values()].sort((a, b) =>
      `${a.scope}/${a.module}` < `${b.scope}/${b.module}` ? -1 : 1,
    );
    return { resolvable: true, owners, base: this.#base, scopes: [...this.#scopes].sort() };
  }

  #targetOf(specifier: string) {
    return this.#options.runtimeOf?.(specifier, this.#fileName) ?? RuntimeUse.targetOf(specifier, this.#fileName);
  }

  #readImports() {
    this.#recording = true;
    for (const statement of this.#source.statements) {
      if (ts.isImportDeclaration(statement)) this.#readImport(statement);
      else if (ts.isExportDeclaration(statement)) this.#readReexport(statement);
    }
    this.#recording = false;
  }

  #readImport(statement: ts.ImportDeclaration) {
    if (!ts.isStringLiteral(statement.moduleSpecifier)) return;
    const target = this.#targetOf(statement.moduleSpecifier.text);
    if (!target) return;
    const clause = statement.importClause;
    if (!target.scope) return this.#problem("whole-runtime-import", statement, "this file belongs to no app or lib");
    const scope = target.scope;
    if (!clause) return this.#problem("whole-runtime-import", statement, `the import runs ${scope}'s client runtime`);
    const typeOnly = clause.isTypeOnly;
    if (clause.name && !typeOnly) this.#bindings.set(clause.name, { type: "whole", scope, name: clause.name.text });
    const bindings = clause.namedBindings;
    if (bindings && ts.isNamespaceImport(bindings)) {
      if (!typeOnly) this.#bindings.set(bindings.name, { type: "whole", scope, name: bindings.name.text });
      return;
    }
    for (const element of bindings?.elements ?? []) {
      const imported = (element.propertyName ?? element.name).text;
      const binding = RuntimeUse.#bindingOf(target, scope, imported, typeOnly || element.isTypeOnly);
      if (binding) this.#bindings.set(element.name, binding);
    }
  }

  static #bindingOf(target: RuntimeImportTarget, scope: string, imported: string, typeOnly: boolean): Binding | null {
    if (imported === "RootStore" && target.kind !== "framework-store") return { type: "rootStore", scope };
    if (typeOnly) return null;
    if (target.kind === "framework-store")
      return imported === "st" ? { type: "handle", handle: { kind: "st", scope } } : null;
    if (target.kind === "sig") return { type: "whole", scope, name: imported };
    if (imported === "st" && (target.kind === "client" || target.kind === "st"))
      return { type: "handle", handle: { kind: "st", scope } };
    if (target.kind === "st") return { type: "whole", scope, name: imported };
    if (imported === "fetch" || imported === "sig") return { type: "handle", handle: { kind: imported, scope } };
    if (imported === "runtime") return { type: "unknown", scope, name: imported };
    if (imported === "store") return { type: "whole", scope, name: imported };
    return null;
  }

  #readReexport(statement: ts.ExportDeclaration) {
    if (statement.isTypeOnly) return;
    const specifier = statement.moduleSpecifier;
    if (!specifier || !ts.isStringLiteral(specifier)) return;
    const target = this.#targetOf(specifier.text);
    if (!target) return;
    const clause = statement.exportClause;
    const names = clause && ts.isNamedExports(clause) ? clause.elements.map((element) => element) : null;
    const handed = names
      ? names.filter((element) => {
          const imported = (element.propertyName ?? element.name).text;
          return !element.isTypeOnly && !quietExports.has(imported) && /^[a-z]/.test(imported);
        })
      : [statement];
    for (const node of handed) this.#problem("re-exported", node, "other files read the runtime through this one");
  }

  #localExport(statement: ts.ExportDeclaration) {
    const clause = statement.exportClause;
    if (statement.isTypeOnly || statement.moduleSpecifier || !clause || !ts.isNamedExports(clause)) return;
    for (const element of clause.elements) {
      const local = element.propertyName ?? element.name;
      const declaration = ts.isIdentifier(local) && !element.isTypeOnly ? this.#lexical.resolve(local) : null;
      const binding = declaration && this.#bindings.get(declaration);
      if (binding && binding.type !== "rootStore")
        this.#problem("re-exported", element, "other files read the runtime through this one");
    }
  }

  #visit(node: ts.Node) {
    if (ts.isExportDeclaration(node)) return this.#localExport(node);
    if (ts.isImportDeclaration(node)) return;
    if (ts.isHeritageClause(node) && node.token === ts.SyntaxKind.ImplementsKeyword) return;
    if ((ts.isAsExpression(node) || ts.isTypeAssertionExpression(node)) && this.#castsToRootStore(node.type)) {
      this.#visit(node.expression);
      this.#follow(node, { kind: "root", scope: this.#castScope(node.type) });
      return;
    }
    if (ts.isTypeNode(node) && !ts.isExpressionWithTypeArguments(node)) return;
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) this.#dynamicImport(node);
    if (ts.isIdentifier(node) && RuntimeLexicalScope.isReference(node)) this.#reference(node);
    ts.forEachChild(node, (child) => this.#visit(child));
  }

  #dynamicImport(node: ts.CallExpression) {
    const [specifier] = node.arguments;
    const target = specifier && ts.isStringLiteralLike(specifier) ? this.#targetOf(specifier.text) : null;
    if (target)
      this.#problem("whole-runtime-import", node, `the import loads ${target.scope ?? "a"} client runtime whole`);
  }

  #reference(identifier: ts.Identifier) {
    const declaration = this.#lexical.resolve(identifier);
    const binding = declaration && this.#bindings.get(declaration);
    if (!binding) return;
    if (binding.type === "handle") {
      this.#scopes.add(binding.handle.scope);
      return this.#follow(identifier, binding.handle);
    }
    if (binding.type === "rootStore" || binding.type === "whole")
      return this.#problem(
        "whole-runtime-import",
        identifier,
        `${binding.type === "rootStore" ? "RootStore" : binding.name} holds ${binding.scope}'s whole client runtime`,
      );
    this.#problem("unknown-name", identifier, `${binding.name} reaches past the names a module answers`);
  }

  #castsToRootStore(type: ts.TypeNode) {
    if (!ts.isTypeReferenceNode(type) || !ts.isIdentifier(type.typeName)) return false;
    const declaration = this.#lexical.resolve(type.typeName);
    return !!declaration && this.#bindings.get(declaration)?.type === "rootStore";
  }

  #castScope(type: ts.TypeNode) {
    const name = ts.isTypeReferenceNode(type) && ts.isIdentifier(type.typeName) ? type.typeName : null;
    const declaration = name && this.#lexical.resolve(name);
    const binding = declaration && this.#bindings.get(declaration);
    return binding?.type === "rootStore" ? binding.scope : "";
  }

  #follow(node: ts.Expression, handle: Handle): void {
    const { current, parent } = RuntimeUse.#climb(node);
    if (ts.isPropertyAccessExpression(parent) && parent.expression === current)
      this.#apply(parent, handle, RuntimeUse.#step(handle, parent.name.text));
    else if (ts.isElementAccessExpression(parent) && parent.expression === current) {
      const key = parent.argumentExpression;
      if (ts.isStringLiteralLike(key) || ts.isNumericLiteral(key))
        this.#apply(parent, handle, RuntimeUse.#step(handle, key.text));
      else this.#problem("computed-access", parent, "the name is picked at run time");
    } else if (ts.isCallExpression(parent) && parent.expression === current) {
      if (handle.kind !== "fetch") this.#problem("unknown-name", parent, "the runtime object itself is called");
    } else if (
      (ts.isAsExpression(parent) || ts.isTypeAssertionExpression(parent) || ts.isSatisfiesExpression(parent)) &&
      parent.expression === current
    )
      this.#problem("cast", parent, "the names read through the cast are not checked against the runtime");
    else if (ts.isVariableDeclaration(parent) && parent.initializer === current) this.#declare(parent, handle);
    else if (ts.isExportAssignment(parent))
      this.#problem("re-exported", parent, "other files read the runtime through this one");
    else this.#problem("passed-on", current, "the names read from it where it goes are not visible here");
  }

  #apply(node: ts.Expression, handle: Handle, step: Step): void {
    if ("leaf" in step) this.#record(handle.scope, step.leaf, step.key, node);
    else if ("handle" in step) this.#follow(node, step.handle);
    else if ("method" in step) this.#callMethod(node, step.method, handle.scope);
    else if ("unknown" in step) this.#problem("unknown-name", node, "the store has no such member");
  }

  static #step(handle: Handle, name: string): Step {
    const to = (kind: HandleKind): Step => ({ handle: { kind, scope: handle.scope } });
    switch (handle.kind) {
      case "st":
        if (name === "do" || name === "use" || name === "slice") return to(`st.${name}`);
        if (storeMethods.has(name)) return { method: name as "get" };
        return agenticMembers.has(name) ? { none: true } : { unknown: true };
      case "root":
        if (name === "get" || name === "set") return { method: name };
        return name === "slice" ? to("st.slice") : { leaf: "st.do", key: name };
      case "state":
        return { leaf: "st.use", key: name };
      case "fetch":
        if (name === "slice" || name === "serializedSignal") return to(`fetch.${name}`);
        return { leaf: "fetch", key: name };
      default:
        return { leaf: handle.kind, key: name };
    }
  }

  #callMethod(node: ts.Expression, method: "get" | "set" | "sel" | "ref" | "sub", scope: string): void {
    const { current, parent } = RuntimeUse.#climb(node);
    if (!ts.isCallExpression(parent) || parent.expression !== current) {
      this.#problem("passed-on", node, "the store method is taken off the store");
      return;
    }
    const state: Handle = { kind: "state", scope };
    const [first, second] = parent.arguments;
    if (method === "get") this.#follow(parent, state);
    else if (method === "set") {
      if (first) this.#written(first, scope);
    } else {
      const selector = first && RuntimeUse.#inlineFunction(first);
      if (first && !selector) this.#problem("passed-on", first, "the selector is not written inline");
      if (!selector) return;
      this.#bindParameter(selector.parameters[0], state);
      if (method === "sub" && !second) this.#bindParameter(selector.parameters[1], state);
    }
  }

  #written(argument: ts.Expression, scope: string): void {
    const value = RuntimeUse.#unwrap(argument);
    const updater = RuntimeUse.#inlineFunction(value);
    if (updater) {
      this.#bindParameter(updater.parameters[0], { kind: "state", scope });
      const returned = ts.isBlock(updater.body) ? RuntimeUse.#returnsOf(updater.body) : [updater.body as ts.Expression];
      for (const expression of returned) this.#written(expression, scope);
    } else if (ts.isConditionalExpression(value)) {
      this.#written(value.whenTrue, scope);
      this.#written(value.whenFalse, scope);
    } else if (ts.isBinaryExpression(value) && value.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken)
      this.#written(value.right, scope);
    else if (!ts.isObjectLiteralExpression(value))
      this.#problem("computed-access", argument, "the state keys it writes are not written out");
    else
      for (const property of value.properties) {
        if (ts.isSpreadAssignment(property)) {
          this.#written(property.expression, scope);
          continue;
        }
        const name = property.name && RuntimeUse.#staticName(property.name);
        if (name === null) this.#problem("computed-access", property, "the state key is computed");
        else this.#record(scope, "st.use", name, property);
      }
  }

  #declare(declaration: ts.VariableDeclaration, handle: Handle) {
    const list = declaration.parent;
    const statement = list.parent;
    const exported =
      ts.isVariableStatement(statement) &&
      !!statement.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword);
    if (exported) return this.#problem("re-exported", declaration, "other files read the runtime through this one");
    if (!ts.isVariableDeclarationList(list) || !(list.flags & ts.NodeFlags.Const))
      return this.#problem("passed-on", declaration, "a reassignable variable may hold anything later");
    this.#bindName(declaration.name, handle);
  }

  #bindParameter(parameter: ts.ParameterDeclaration | undefined, handle: Handle) {
    if (!parameter) return;
    if (parameter.dotDotDotToken)
      return this.#problem("hidden-by-destructuring", parameter, "a rest parameter hides which names it reads");
    this.#bindName(parameter.name, handle);
  }

  #bindName(name: ts.BindingName, handle: Handle) {
    if (ts.isIdentifier(name)) {
      this.#bindings.set(name, { type: "handle", handle });
      return;
    }
    if (ts.isArrayBindingPattern(name))
      return this.#problem("hidden-by-destructuring", name, "array destructuring hides which names it reads");
    for (const element of name.elements) {
      const key = element.propertyName ?? element.name;
      const keyName = ts.isIdentifier(key) ? key.text : RuntimeUse.#staticName(key);
      if (element.dotDotDotToken || keyName === null) {
        this.#problem("hidden-by-destructuring", element, "a rest or computed key hides which names it reads");
        continue;
      }
      const step = RuntimeUse.#step(handle, keyName);
      if ("leaf" in step) this.#record(handle.scope, step.leaf, step.key, element);
      else if ("handle" in step) this.#bindName(element.name, step.handle);
      else if ("method" in step) this.#problem("passed-on", element, "the store method is taken off the store");
      else if ("unknown" in step) this.#problem("unknown-name", element, "the store has no such member");
    }
  }

  #record(scope: string, family: RuntimeFamily, key: string, node: ts.Node) {
    if (!this.#recording) return;
    const table = this.#tableOf(scope);
    if (!table)
      return this.#problem(
        "whole-runtime-import",
        node,
        `${scope || "this file"} has no generated client runtime to read`,
      );
    const entry = table.lookup(family, key);
    if (!entry)
      return this.#problem("unknown-name", node, `${family}.${key} is not a name ${scope}'s client runtime answers`);
    if (entry.base) this.#base = true;
    const needs = family.startsWith("st.") ? "store" : "descriptor";
    for (const owner of entry.owners) {
      const id = `${owner.scope}/${owner.module}`;
      const known = this.#owners.get(id);
      if (!known || (known.needs === "descriptor" && needs === "store")) this.#owners.set(id, { ...owner, needs });
    }
  }

  #problem(reason: RuntimeUseReason, node: ts.Node, why: string) {
    if (!this.#recording) return;
    const position = node.getStart(this.#source);
    if (this.#problems.some((problem) => problem.position === position && problem.reason === reason)) return;
    const { line, character } = this.#source.getLineAndCharacterOfPosition(position);
    const raw = node.getText(this.#source).replace(/\s+/g, " ");
    const text = raw.length > 80 ? `${raw.slice(0, 77)}...` : raw;
    this.#problems.push({
      reason,
      line: line + 1,
      column: character + 1,
      text,
      message: `\`${text}\`: ${why}`,
      position,
    });
  }

  static #climb(node: ts.Expression) {
    let current: ts.Expression = node;
    let parent = current.parent;
    while ((ts.isParenthesizedExpression(parent) || ts.isNonNullExpression(parent)) && parent.expression === current) {
      current = parent;
      parent = current.parent;
    }
    return { current, parent };
  }

  static #unwrap(expression: ts.Expression): ts.Expression {
    let current = expression;
    while (ts.isParenthesizedExpression(current)) current = current.expression;
    return current;
  }

  static #inlineFunction(expression: ts.Expression) {
    const value = RuntimeUse.#unwrap(expression);
    return ts.isArrowFunction(value) || ts.isFunctionExpression(value) ? value : null;
  }

  static #returnsOf(body: ts.Block) {
    const returned: ts.Expression[] = [];
    const visit = (node: ts.Node) => {
      if (ts.isFunctionLike(node)) return;
      if (ts.isReturnStatement(node) && node.expression) returned.push(node.expression);
      ts.forEachChild(node, visit);
    };
    ts.forEachChild(body, visit);
    return returned;
  }

  static #staticName(name: ts.PropertyName | ts.BindingName) {
    if (ts.isIdentifier(name) || ts.isPrivateIdentifier(name)) return name.text;
    if (ts.isStringLiteralLike(name) || ts.isNumericLiteral(name)) return name.text;
    if (ts.isComputedPropertyName(name) && ts.isStringLiteralLike(name.expression)) return name.expression.text;
    return null;
  }

  static #kindOf(fileName: string) {
    return fileName.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  }
}
