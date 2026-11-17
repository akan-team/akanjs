import ts from "typescript";
import { RuntimeConstantReads, type RuntimeConstantUse } from "./runtimeConstantReads";
import {
  type RuntimeBinding,
  type RuntimeConstantTarget,
  type RuntimeHandle,
  type RuntimeHandleKind,
  RuntimeImports,
  type RuntimeImportTarget,
  type RuntimeImportUse,
} from "./runtimeImports";
import { RuntimeKeyNames } from "./runtimeKeyNames";
import { RuntimeLexicalScope } from "./runtimeLexicalScope";
import type { RuntimeFamily, RuntimeNameTable, RuntimeNeed, RuntimeOwner } from "./runtimeNameTable";
import { type RuntimeSlice, RuntimeSliceKey } from "./runtimeSliceKey";
import {
  climb,
  climbCasts,
  declaredFunction,
  inlineFunction,
  memberName,
  ownArguments,
  type PositionedProblem,
  problemAt,
  returnsOf,
  sortedProblems,
  staticName,
  uncast,
  unwrap,
} from "./runtimeSyntax";

export type { RuntimeConstantName, RuntimeConstantRead, RuntimeConstantUse } from "./runtimeConstantReads";
export type { RuntimeImportKind, RuntimeImportTarget } from "./runtimeImports";

export const runtimeUseReasons = [
  "computed-access",
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
  needs: RuntimeNeed;
}

export interface RuntimeUseProblem {
  reason: RuntimeUseReason;
  line: number;
  column: number;
  text: string;
  message: string;
}

export type RuntimeUseVerdict = (
  | { resolvable: true; owners: RuntimeUseOwner[]; baseStore: boolean; baseDescriptor: boolean; reads: boolean }
  | ({ resolvable: false; problems: RuntimeUseProblem[] } & RuntimeUseProblem)
) & { constants: RuntimeConstantUse };

export interface RuntimeUseOptions {
  runtimeOf?: (specifier: string, fileName: string) => RuntimeImportTarget | null;
}

type StoreMethod = "get" | "set" | "sel" | "ref" | "sub" | "pick";

type Step =
  | { leaf: RuntimeFamily; key: string; next?: RuntimeHandle }
  | { handle: RuntimeHandle }
  | { method: StoreMethod; own?: boolean }
  | { none: true }
  | { unknown: true }
  | { whole: true };

const stMethods = new Set(["get", "set", "sel", "ref", "sub"]);
const agenticMembers = new Set(["tool", "expose", "useState"]);
const signalData = new Set(["refName", "cnst", "slices", "serializedSignal", "_slice"]);
//? Fetch client members reaching no endpoint; `handler`, `instance`, `clone` and the descriptor maps do pick a name.
const fetchClientMembers = new Set([
  "ws",
  "http",
  "origin",
  "jwt",
  "logger",
  "setJwt",
  "setTimeout",
  "connect",
  "connectOnUse",
  "disconnect",
  "configureWs",
]);
const isPlain = (step: Step) => "none" in step || ("leaf" in step && !step.next);
const isThisParameter = ({ name }: ts.ParameterDeclaration) => ts.isIdentifier(name) && name.text === "this";
const assertKey = 'assert the key as the name it stands for (`key as "name"`)';
const nothingRead: RuntimeUseVerdict = {
  resolvable: true,
  owners: [],
  baseStore: false,
  baseDescriptor: false,
  reads: false,
  constants: { reads: [], imports: [], problems: [] },
};

export class RuntimeUse {
  readonly #source: ts.SourceFile;
  readonly #fileName: string;
  readonly #consumer: RuntimeNameTable | null;
  readonly #options: RuntimeUseOptions;
  readonly #storeFile: boolean;
  readonly #lexical = new RuntimeLexicalScope();
  readonly #keys = new RuntimeKeyNames(this.#lexical);
  readonly #slices: RuntimeSliceKey;
  readonly #bindings = new Map<ts.Identifier, RuntimeBinding>();
  readonly #owners = new Map<string, RuntimeUseOwner>();
  readonly #problems: PositionedProblem[] = [];
  readonly #constants: RuntimeConstantReads;
  #baseStore = false;
  #baseDescriptor = false;
  #reads = false;
  #recording: boolean = false;

  static targetOf(specifier: string, fileName: string) {
    return RuntimeImports.targetOf(specifier, fileName);
  }

  static analyze(
    input: { fileName: string; text: string; sourceFile?: ts.SourceFile },
    consumer: RuntimeNameTable | null,
    options: RuntimeUseOptions = {},
  ): RuntimeUseVerdict {
    const storeFile = input.fileName.endsWith(".store.ts");
    const runtime = !!options.runtimeOf || storeFile || RuntimeImports.mayUseRuntime(input.text, input.fileName);
    if (!runtime && !RuntimeImports.mayUseConstants(input.text, input.fileName)) return nothingRead;
    const source =
      input.sourceFile ??
      ts.createSourceFile(input.fileName, input.text, ts.ScriptTarget.Latest, true, RuntimeUse.#kindOf(input.fileName));
    const verdict = new RuntimeUse(source, input.fileName, consumer, options, storeFile).#run();
    return runtime ? verdict : { ...nothingRead, constants: verdict.constants };
  }

  private constructor(
    source: ts.SourceFile,
    fileName: string,
    consumer: RuntimeNameTable | null,
    options: RuntimeUseOptions,
    storeFile: boolean,
  ) {
    this.#source = source;
    this.#fileName = fileName;
    this.#consumer = consumer;
    this.#options = options;
    this.#storeFile = storeFile;
    this.#slices = new RuntimeSliceKey(this.#lexical, source);
    this.#constants = new RuntimeConstantReads(source, fileName, consumer, () => this.#recording);
  }

  #run(): RuntimeUseVerdict {
    this.#readImports();
    for (let size = -1; size !== this.#bindings.size; ) {
      size = this.#bindings.size;
      this.#visit(this.#source);
    }
    this.#recording = true;
    this.#visit(this.#source);
    const problems = sortedProblems(this.#problems);
    const constants = this.#constants.use;
    const [first] = problems;
    if (first) return { resolvable: false, ...first, problems, constants };
    const owners = [...this.#owners.values()].sort((a, b) =>
      `${a.scope}/${a.module}` < `${b.scope}/${b.module}` ? -1 : 1,
    );
    return {
      resolvable: true,
      owners,
      baseStore: this.#baseStore,
      baseDescriptor: this.#baseDescriptor,
      reads: this.#reads,
      constants,
    };
  }

  #targetOf(specifier: string) {
    return this.#options.runtimeOf?.(specifier, this.#fileName) ?? RuntimeImports.targetOf(specifier, this.#fileName);
  }

  #readImports() {
    this.#recording = true;
    for (const statement of this.#source.statements) {
      if (ts.isImportDeclaration(statement)) this.#readImport(statement);
      else if (ts.isExportDeclaration(statement)) this.#readReexport(statement);
      else if (ts.isImportEqualsDeclaration(statement) && !statement.isTypeOnly) {
        const reference = statement.moduleReference;
        const specifier = ts.isExternalModuleReference(reference) ? reference.expression : null;
        if (specifier && ts.isStringLiteralLike(specifier) && this.#targetOf(specifier.text))
          this.#problem("whole-runtime-import", statement, "the import loads the runtime module whole");
      }
    }
    this.#recording = false;
  }

  #readImport(statement: ts.ImportDeclaration) {
    if (!ts.isStringLiteral(statement.moduleSpecifier)) return;
    if (!statement.importClause?.isTypeOnly) this.#constants.imported(statement.moduleSpecifier.text);
    const constant = RuntimeImports.constantTargetOf(statement.moduleSpecifier.text, this.#fileName);
    if (constant) return this.#readConstantImport(statement, constant);
    const target = this.#targetOf(statement.moduleSpecifier.text);
    const clause = statement.importClause;
    if (!target || (!clause && target.kind.startsWith("framework-"))) return;
    if (!clause?.isTypeOnly && !target.kind.startsWith("framework-") && !this.#loads(target, statement)) return;
    const named = clause?.namedBindings && ts.isNamedImports(clause.namedBindings) ? clause.namedBindings.elements : [];
    const values = clause?.isTypeOnly ? [] : named.filter((element) => !element.isTypeOnly);
    const namespace = clause?.namedBindings && ts.isNamespaceImport(clause.namedBindings) ? clause.namedBindings : null;
    const wholeImport = !clause || (!clause.isTypeOnly && !clause.name && !namespace && !values.length);
    if (wholeImport && !target.kind.startsWith("framework-"))
      return this.#problem("whole-runtime-import", statement, `the import runs ${target.scope}'s client runtime whole`);
    for (const name of clause?.isTypeOnly ? [] : [clause?.name, namespace?.name])
      if (name) this.#use(name, RuntimeImports.namespaceUse(target.kind, name.text));
    for (const element of named) {
      const imported = (element.propertyName ?? element.name).text;
      const typeOnly = !!clause?.isTypeOnly || element.isTypeOnly;
      if (target.kind === "client" && target.scope && imported === "cnst") {
        if (!typeOnly) this.#bindings.set(element.name, { type: "cnst", scope: target.scope });
      } else this.#use(element, RuntimeImports.useOf(target, imported, typeOnly));
    }
  }

  #readConstantImport(statement: ts.ImportDeclaration, { scope, kind }: RuntimeConstantTarget) {
    const clause = statement.importClause;
    if (clause?.isTypeOnly) return;
    const bindings = clause?.namedBindings;
    if (kind === "cnst" && !clause?.name && bindings && ts.isNamespaceImport(bindings)) {
      this.#bindings.set(bindings.name, { type: "cnst", scope });
      return;
    }
    const named =
      kind === "barrel" && !clause?.name && bindings && ts.isNamedImports(bindings) ? bindings.elements : null;
    if (!named)
      return this.#constants.problem("whole-runtime-import", statement, `the import takes ${scope}'s constants whole`);
    for (const element of named)
      if (!element.isTypeOnly && (element.propertyName ?? element.name).text === "cnst")
        this.#bindings.set(element.name, { type: "cnst", scope });
  }

  #use(node: ts.ImportSpecifier | ts.Identifier, use: RuntimeImportUse) {
    if (!use) return;
    if ("binding" in use) this.#bindings.set(ts.isIdentifier(node) ? node : node.name, use.binding);
    else this.#problem(use.reason, node, use.why);
  }

  #loads(target: RuntimeImportTarget, statement: ts.ImportDeclaration) {
    const consumer = this.#consumer;
    const loaded = !!consumer?.layers.some((layer) => layer.scope === target.scope);
    if (!loaded) {
      const why = !target.scope
        ? "this file belongs to no app or lib"
        : consumer
          ? `${consumer.scope} does not load ${target.scope}'s client runtime`
          : "there is no generated client runtime to read names from";
      this.#problem("whole-runtime-import", statement.moduleSpecifier, why);
    }
    return loaded;
  }

  #readReexport(statement: ts.ExportDeclaration) {
    const specifier = statement.moduleSpecifier;
    if (statement.isTypeOnly || !specifier || !ts.isStringLiteral(specifier)) return;
    this.#constants.imported(specifier.text);
    const target = this.#targetOf(specifier.text);
    if (!target) return;
    const clause = statement.exportClause;
    const why = "other files read the runtime through this one";
    if (!clause || ts.isNamespaceExport(clause)) return this.#problem("re-exported", statement, why);
    for (const element of clause.elements) {
      const imported = (element.propertyName ?? element.name).text;
      if (!element.isTypeOnly && target.kind === "client" && imported === "cnst")
        this.#constants.problem("re-exported", element, why);
      else if (!element.isTypeOnly && RuntimeImports.useOf(target, imported, false))
        this.#problem("re-exported", element, why);
    }
  }

  #localExport(statement: ts.ExportDeclaration) {
    const clause = statement.exportClause;
    if (statement.isTypeOnly || statement.moduleSpecifier || !clause || !ts.isNamedExports(clause)) return;
    for (const element of clause.elements) {
      const local = element.propertyName ?? element.name;
      const declaration = ts.isIdentifier(local) && !element.isTypeOnly ? this.#lexical.resolve(local) : null;
      const binding = declaration && this.#bindings.get(declaration);
      if (binding?.type === "cnst")
        this.#constants.problem("re-exported", element, "other files read the constants here");
      else if (binding && binding.type !== "storeFactory")
        this.#problem("re-exported", element, "other files read the runtime through this one");
    }
  }

  #visit(node: ts.Node) {
    if (ts.isExportDeclaration(node)) return this.#localExport(node);
    if (ts.isImportDeclaration(node) || ts.isImportEqualsDeclaration(node)) return;
    if (ts.isHeritageClause(node) && node.token === ts.SyntaxKind.ImplementsKeyword) return;
    if ((ts.isAsExpression(node) || ts.isTypeAssertionExpression(node)) && this.#isRootStoreType(node.type)) {
      const inner = RuntimeUse.#castInner(node.expression);
      if (inner.kind !== ts.SyntaxKind.ThisKeyword) this.#visit(node.expression);
      this.#followRead(node, { kind: "root" });
      return;
    }
    if (ts.isTypeNode(node) && !ts.isExpressionWithTypeArguments(node)) return;
    if (node.kind === ts.SyntaxKind.ThisKeyword || node.kind === ts.SyntaxKind.SuperKeyword)
      this.#storeSelf(node as ts.Expression);
    else if (this.#isLoader(node)) this.#loader(node as ts.Expression);
    else if (ts.isIdentifier(node) && RuntimeLexicalScope.isReference(node)) this.#reference(node);
    else if (ts.isStringLiteralLike(node)) this.#literalArgument(node);
    else if (ts.isObjectLiteralExpression(node)) this.#writtenSlice(node);
    ts.forEachChild(node, (child) => this.#visit(child));
  }

  #reference(identifier: ts.Identifier) {
    const declaration = this.#lexical.resolve(identifier);
    const binding = declaration && this.#bindings.get(declaration);
    if (!binding || binding.type === "storeFactory" || binding.type === "rootStore") return;
    if (binding.type === "cnst") return this.#constants.follow(identifier, binding.scope);
    if (binding.type === "whole")
      return this.#problem("whole-runtime-import", identifier, `${binding.name} hands out the whole client runtime`);
    this.#followRead(identifier, binding.handle);
  }

  #followRead(node: ts.Expression, handle: RuntimeHandle) {
    if (this.#recording) this.#reads = true;
    this.#follow(node, handle);
  }

  #storeSelf(node: ts.Expression) {
    const owner = RuntimeLexicalScope.thisOwnerOf(node);
    if (node.kind === ts.SyntaxKind.SuperKeyword && ts.isCallExpression(node.parent) && node.parent.expression === node)
      return;
    if (owner?.kind === "class" && this.#isStoreClass(owner.node)) {
      if (owner.isStatic)
        return this.#problem("unknown-name", node, "a static member's `this` is the store class, not a module name");
      const members = node.kind === ts.SyntaxKind.ThisKeyword ? RuntimeUse.#membersOf(owner.node) : new Set<string>();
      return this.#followRead(node, { kind: "self", members });
    }
    const [first] = owner?.kind === "function" ? owner.node.parameters : [];
    const typedThis = first && ts.isIdentifier(first.name) && first.name.text === "this" && first.type;
    if (typedThis && this.#isRootStoreType(typedThis)) return this.#followRead(node, { kind: "root" });
    if (this.#storeFile && owner)
      this.#problem(
        "passed-on",
        node,
        "outside a store class member `this` may be the store, and its reads are not followed",
      );
  }

  #isStoreClass(node: ts.ClassLikeDeclaration) {
    if (this.#storeFile) return true;
    const heritage = node.heritageClauses?.find((clause) => clause.token === ts.SyntaxKind.ExtendsKeyword)?.types[0];
    const base = heritage && unwrap(heritage.expression);
    return !!base && ts.isCallExpression(base) && this.#isStoreFactory(base.expression);
  }

  #isStoreFactory(expression: ts.Expression) {
    const callee = unwrap(expression);
    const declaration = ts.isIdentifier(callee) ? this.#lexical.resolve(callee) : null;
    return !!declaration && this.#bindings.get(declaration)?.type === "storeFactory";
  }

  #isRootStoreType(type: ts.TypeNode) {
    if (!ts.isTypeReferenceNode(type) || !ts.isIdentifier(type.typeName) || type.typeArguments) return false;
    const declaration = this.#lexical.resolve(type.typeName);
    return !!declaration && this.#bindings.get(declaration)?.type === "rootStore";
  }

  #isLoader(node: ts.Node) {
    if (node.kind === ts.SyntaxKind.ImportKeyword) return true;
    const free = (expression: ts.Expression) => ts.isIdentifier(expression) && !this.#lexical.resolve(expression);
    if (ts.isIdentifier(node)) return node.text === "require" && RuntimeLexicalScope.isReference(node) && free(node);
    const member =
      ts.isPropertyAccessExpression(node) ||
      (ts.isElementAccessExpression(node) && ts.isStringLiteralLike(node.argumentExpression));
    if (!member || memberName(node) !== "require") return false;
    return ts.isMetaProperty(node.expression) || free(node.expression);
  }

  #loader(node: ts.Expression) {
    const { current, parent } = climb(node);
    const called = ts.isCallExpression(parent) && parent.expression === current;
    const [specifier] = called ? parent.arguments : [];
    if (!called) this.#problem("whole-runtime-import", node, "a module loader taken as a value may load any module");
    else if (!specifier || !ts.isStringLiteralLike(specifier))
      this.#problem("whole-runtime-import", parent, "the module it loads is picked at run time");
    else if (this.#targetOf(specifier.text))
      this.#problem("whole-runtime-import", parent, "the import loads the runtime module whole");
  }

  #literalArgument(literal: ts.StringLiteralLike) {
    const parent = literal.parent;
    if (!(ts.isCallExpression(parent) || ts.isNewExpression(parent)) || !parent.arguments?.includes(literal)) return;
    if (!this.#isLoader(unwrap(parent.expression)) && this.#targetOf(literal.text))
      this.#problem("whole-runtime-import", literal, "the runtime module is handed to code that may load it whole");
  }

  #follow(node: ts.Expression, handle: RuntimeHandle) {
    const { current, parent } = climbCasts(node);
    if (ts.isPropertyAccessExpression(parent) && parent.expression === current)
      return this.#apply(parent, this.#step(handle, parent.name.text));
    if (ts.isElementAccessExpression(parent) && parent.expression === current) return this.#keyed(parent, handle);
    if (ts.isCallExpression(parent) && parent.expression === current) {
      if (handle.kind === "getter") this.#follow(parent, { kind: "state" });
      else if (handle.kind !== "fetch") this.#problem("unknown-name", parent, "the runtime object itself is called");
      return;
    }
    const storeOfSignal = handle.kind === "signal" && ts.isCallExpression(parent) && parent.arguments[0] === current;
    if (storeOfSignal && this.#isStoreFactory(parent.expression)) return;
    if (ts.isVariableDeclaration(parent) && parent.initializer === current) return this.#declare(parent, handle);
    if (ts.isExportAssignment(parent))
      return this.#problem("re-exported", parent, "other files read the runtime through this one");
    if (handle.kind === "state" && this.#handed(current, parent)) return;
    const answer = handle.kind === "fetch" ? "name the endpoint here and pass that" : "read the names here";
    this.#problem("passed-on", current, `the names read from it where it goes are not visible here; ${answer}`);
  }

  #keyed(node: ts.ElementAccessExpression, handle: RuntimeHandle) {
    const names = this.#keys.namesOf(node.argumentExpression);
    const steps = names && this.#stepsOf(handle, names);
    if (steps) for (const step of steps) this.#apply(node, step);
    else if (names) this.#problem("computed-access", node, "the names asserted for the key are read in different ways");
    else if (!this.#sliceBuilt(node, handle)) {
      const fromSlice = /sliceName|refName/.test(node.argumentExpression.getText(this.#source));
      const other = fromSlice ? "take the slice as a `SliceMeta` parameter" : "name the endpoint";
      const answer = fromSlice || handle.kind === "fetch" ? `${other}, or ${assertKey}` : assertKey;
      this.#problem("computed-access", node, `the name is picked at run time; ${answer}`);
    }
  }

  #stepsOf(handle: RuntimeHandle, names: string[]) {
    const steps = names.map((name) => this.#step(handle, name));
    return steps.length === 1 || steps.every(isPlain) ? steps : null;
  }

  #sliceBuilt(node: ts.ElementAccessExpression, handle: RuntimeHandle) {
    const pieces = this.#slices.piecesOf(node.argumentExpression);
    const table = this.#consumer;
    if (!pieces || !table) return false;
    if (!this.#recording) return true;
    const reads: { leaf: RuntimeFamily; key: string; loads: RuntimeSlice["loads"] }[] = [];
    for (const slice of RuntimeSliceKey.slicesOf(table)) {
      const name = RuntimeSliceKey.nameOf(pieces, slice);
      const step = name === null ? null : this.#step(handle, name);
      if (!step || !isPlain(step)) return false;
      if ("leaf" in step && table.lookup(step.leaf, step.key)) reads.push({ ...step, loads: slice.loads });
    }
    for (const { leaf, key, loads } of reads) this.#record(leaf, key, node, loads);
    return reads.length > 0;
  }

  //? A slice written out carries no reference to its model, so the file writing it loads the model as if it named it.
  #writtenSlice(literal: ts.ObjectLiteralExpression) {
    const named = (key: string) => literal.properties.find(({ name }) => !!name && staticName(name) === key);
    const sliceName = named("sliceName");
    if (!sliceName || !named("refName")) return;
    if (this.#recording) this.#reads = true;
    const value = ts.isPropertyAssignment(sliceName)
      ? sliceName.initializer
      : ts.isShorthandPropertyAssignment(sliceName)
        ? sliceName.name
        : null;
    if (value && this.#slices.copiesSliceName(value)) return;
    const names = ts.isPropertyAssignment(sliceName) ? this.#keys.namesOf(sliceName.initializer) : null;
    if (names) for (const name of names) this.#record("fetch.slice", name, sliceName);
    else this.#problem("computed-access", sliceName, "a slice written by hand names its model at run time");
  }

  #handed(argument: ts.Expression, call: ts.Node) {
    if (!ts.isCallExpression(call)) return false;
    const index = call.arguments.indexOf(argument);
    const callee = index < 0 ? null : declaredFunction(call.expression, this.#lexical);
    const parameter = callee?.parameters.filter((parameter) => !isThisParameter(parameter))[index];
    if (!callee?.body || !parameter || parameter.dotDotDotToken) return false;
    if (call.arguments.slice(0, index).some(ts.isSpreadElement)) return false;
    if (!ts.isArrowFunction(callee) && ownArguments(callee.body)) return false;
    this.#bindName(parameter.name, { kind: "state" });
    return true;
  }

  #apply(node: ts.Expression, step: Step) {
    if ("leaf" in step) {
      this.#record(step.leaf, step.key, node);
      if (step.next) this.#follow(node, step.next);
    } else if ("handle" in step) this.#follow(node, step.handle);
    else if ("method" in step) this.#callMethod(node, step.method, step.own);
    else if ("unknown" in step) this.#problem("unknown-name", node, "the runtime has no such member");
    else if ("whole" in step) this.#problem("whole-runtime-import", node, "it hands out the whole client runtime");
  }

  #step(handle: RuntimeHandle, name: string): Step {
    const to = (kind: RuntimeHandleKind): Step => ({ handle: { kind } });
    switch (handle.kind) {
      case "st":
        if (name === "do" || name === "use" || name === "slice") return to(`st.${name}`);
        if (stMethods.has(name)) return { method: name as StoreMethod };
        return agenticMembers.has(name) ? { none: true } : { unknown: true };
      case "root":
      case "self":
        if (name === "get" || name === "set" || name === "pick") return { method: name, own: handle.kind === "self" };
        if (name === "slice") return to("st.slice");
        if (handle.members?.has(name) && !this.#consumer?.lookup("st.do", name)) return { none: true };
        return { leaf: "st.do", key: name };
      case "state":
        return { leaf: "st.use", key: name };
      case "getter":
        return { unknown: true };
      case "fetch":
        if (name === "slice" || name === "serializedSignal") return to(`fetch.${name}`);
        if (fetchClientMembers.has(name) && !this.#consumer?.lookup("fetch", name)) return { none: true };
        return { leaf: "fetch", key: name };
      case "sig":
        return { leaf: "sig", key: name, next: { kind: "signal" } };
      case "signal":
        if (name === "fetch") return to("fetch");
        return signalData.has(name) ? { none: true } : { unknown: true };
      case "akanjs/store":
        if (name === "st") return to("st");
        return RuntimeImports.frameworkWholeNames.has(name) ? { whole: true } : { none: true };
      case "akanjs/client":
        return name === "fetch" || name === "sig" ? to(name) : { none: true };
      default:
        return { leaf: handle.kind, key: name };
    }
  }

  #callMethod(node: ts.Expression, method: StoreMethod, own = false) {
    const { current, parent } = climbCasts(node);
    if (method === "get" && ts.isVariableDeclaration(parent) && parent.initializer === current)
      return this.#declare(parent, { kind: "getter" });
    if (!ts.isCallExpression(parent) || parent.expression !== current)
      return this.#problem("passed-on", node, "the store method is taken off the store");
    const spread = parent.arguments.find(ts.isSpreadElement);
    if (spread) return this.#problem("computed-access", spread, "a spread hides which argument lands where");
    const [first, second] = parent.arguments;
    if (method === "get") return this.#follow(parent, { kind: "state" });
    if (method === "pick")
      for (const key of parent.arguments) {
        const names = this.#keys.namesOf(key);
        if (names) for (const name of names) this.#record("st.use", name, key);
        else this.#problem("computed-access", key, `the state key is picked at run time; ${assertKey}`);
      }
    else if (method === "set") {
      if (first) this.#written(first, own);
    } else {
      const selector = first && inlineFunction(first);
      if (first && !selector) this.#problem("passed-on", first, "the selector is not written inline");
      if (selector) this.#bindCallback(selector, method === "sub" && !second ? 2 : 1);
    }
  }

  #bindCallback(callback: ts.ArrowFunction | ts.FunctionExpression, count: number) {
    if (ts.isFunctionExpression(callback)) {
      const own = ownArguments(callback.body);
      if (own) this.#problem("hidden-by-destructuring", own, "`arguments` hides which names it reads");
    }
    const parameters = callback.parameters.filter((parameter) => !isThisParameter(parameter));
    for (const parameter of parameters.slice(0, count)) this.#bindParameter(parameter, { kind: "state" });
  }

  //? `own`: a store's uncast `this.set` looks up no module for keys a spread copies; a bare value may be an updater.
  #written(argument: ts.Expression, own = false, spread = false) {
    const value = uncast(argument);
    const updater = inlineFunction(value);
    if (updater) {
      this.#bindCallback(updater, 1);
      const returned = ts.isBlock(updater.body) ? returnsOf(updater.body) : [updater.body as ts.Expression];
      for (const expression of returned) this.#written(expression, own);
    } else if (ts.isConditionalExpression(value)) {
      this.#written(value.whenTrue, own, spread);
      this.#written(value.whenFalse, own, spread);
    } else if (ts.isBinaryExpression(value) && value.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken)
      this.#written(value.right, own, spread);
    else if (!ts.isObjectLiteralExpression(value)) {
      if (!own || !spread) this.#problem("computed-access", argument, "the state keys it writes are not written out");
    } else
      for (const property of value.properties) {
        if (ts.isSpreadAssignment(property)) {
          this.#written(property.expression, own, true);
          continue;
        }
        const names = property.name && this.#keys.ofProperty(property.name);
        if (names) for (const name of names) this.#record("st.use", name, property);
        else this.#problem("computed-access", property, `the state key is computed; ${assertKey}`);
      }
  }

  #declare(declaration: ts.VariableDeclaration, handle: RuntimeHandle) {
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

  #bindParameter(parameter: ts.ParameterDeclaration | undefined, handle: RuntimeHandle) {
    if (!parameter) return;
    if (parameter.dotDotDotToken)
      return this.#problem("hidden-by-destructuring", parameter, "a rest parameter hides which names it reads");
    this.#bindName(parameter.name, handle);
  }

  #bindName(name: ts.BindingName, handle: RuntimeHandle) {
    if (ts.isIdentifier(name)) {
      this.#bindings.set(name, { type: "handle", handle });
      return;
    }
    if (ts.isArrayBindingPattern(name))
      return this.#problem("hidden-by-destructuring", name, "array destructuring hides which names it reads");
    for (const element of name.elements) {
      const names = element.dotDotDotToken ? null : this.#keys.ofProperty(element.propertyName ?? element.name);
      const steps = names && this.#stepsOf(handle, names);
      const why = names
        ? "the names asserted for the key are read in different ways"
        : `a rest or computed key hides which names it reads; ${assertKey}`;
      if (!steps) this.#problem("hidden-by-destructuring", element, why);
      for (const step of steps ?? []) this.#bindStep(element, step);
    }
  }

  #bindStep(element: ts.BindingElement, step: Step) {
    if ("leaf" in step) {
      this.#record(step.leaf, step.key, element);
      if (step.next) this.#bindName(element.name, step.next);
    } else if ("handle" in step) this.#bindName(element.name, step.handle);
    else if ("method" in step) this.#problem("passed-on", element, "the store method is taken off the store");
    else if ("unknown" in step) this.#problem("unknown-name", element, "the runtime has no such member");
    else if ("whole" in step) this.#problem("whole-runtime-import", element, "it hands out the whole client runtime");
  }

  #record(family: RuntimeFamily, key: string, node: ts.Node, loaded?: RuntimeSlice["loads"]) {
    if (!this.#recording) return;
    const table = this.#consumer;
    if (!table)
      return this.#problem("whole-runtime-import", node, "there is no generated client runtime to read names from");
    const entry = table.lookup(family, key);
    if (!entry)
      return this.#problem(
        "unknown-name",
        node,
        `${family}.${key} is not a name ${table.scope}'s client runtime answers`,
      );
    if (entry.base === "store") this.#baseStore = true;
    if (entry.base === "descriptor") this.#baseDescriptor = true;
    for (const owner of entry.owners) if (!loaded?.(owner, entry.needs)) this.#need(owner, entry.needs);
    for (const owner of entry.uses) this.#need(owner, "descriptor");
  }

  #need(owner: RuntimeOwner, needs: RuntimeNeed) {
    const id = `${owner.scope}/${owner.module}`;
    const known = this.#owners.get(id);
    if (!known || (known.needs === "descriptor" && needs === "store")) this.#owners.set(id, { ...owner, needs });
  }

  #problem(reason: RuntimeUseReason, node: ts.Node, why: string) {
    if (!this.#recording) return;
    const problem = problemAt(this.#source, reason, node, why);
    if (this.#problems.some(({ position }) => position === problem.position && problem.reason === reason)) return;
    this.#problems.push(problem);
  }

  static #membersOf(node: ts.ClassLikeDeclaration) {
    const members = new Set<string>();
    for (const member of node.members) {
      const name = member.name && staticName(member.name);
      const isStatic = !!(ts.getCombinedModifierFlags(member) & ts.ModifierFlags.Static);
      if (name !== null && name !== undefined && !isStatic) members.add(name);
    }
    return members;
  }

  static #castInner(expression: ts.Expression): ts.Expression {
    const value = unwrap(expression);
    if (
      (ts.isAsExpression(value) || ts.isTypeAssertionExpression(value)) &&
      value.type.kind === ts.SyntaxKind.UnknownKeyword
    )
      return unwrap(value.expression);
    return value;
  }

  static #kindOf(fileName: string) {
    return fileName.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  }
}
