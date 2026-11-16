import { createAst, createFactReader } from "@akanjs/language";
import ts from "typescript";

export type RuntimeModuleKind = "database" | "service";

export interface RuntimeSourceFile {
  file: string;
  sourceFile: ts.SourceFile;
}

export interface RuntimeEndpointFact {
  name: string;
  verb: string | null;
  fileUpload: boolean;
}

export interface RuntimeVerbGuards {
  root: string[] | null;
  get: string[];
  create: string[];
  update: string[];
  remove: string[];
}

export interface RuntimeSliceFact {
  guards: RuntimeVerbGuards;
  keys: { name: string; live: boolean }[];
}

export interface RuntimeStoreFact {
  name: string;
  refName: string;
  signal: boolean;
  state: string[];
  derived: string[];
  actions: string[];
  libStores: string[];
}

export interface RuntimeFieldFact {
  name: string;
  type: string | null;
  array: boolean;
}

export interface RuntimeModuleFact {
  scope: string;
  module: string;
  kind: RuntimeModuleKind;
  signal: { endpoints: RuntimeEndpointFact[]; slice: RuntimeSliceFact | null; extendsLib: boolean } | null;
  store: (RuntimeStoreFact & { extendsLib: boolean }) | null;
  model: { fields: RuntimeFieldFact[]; extendsLib: boolean } | null;
}

export interface RuntimeLayer {
  scope: string;
  modules: RuntimeModuleFact[];
  approximations: string[];
}

interface ModuleFiles {
  module: string;
  kind: RuntimeModuleKind;
  signal?: RuntimeSourceFile;
  store?: RuntimeSourceFile;
  constant?: RuntimeSourceFile;
}

export class RuntimeModuleFacts {
  static readonly #ast = createAst(ts);
  static readonly #reader = createFactReader(ts, RuntimeModuleFacts.#ast);
  static readonly #heritageCallees = new Set(["endpoint", "slice", "store", "via"]);

  static moduleFileOf(scope: string, file: string) {
    const match = file
      .slice(scope.length)
      .match(/^\/lib\/(_?)([a-zA-Z0-9]+)\/([a-zA-Z0-9]+)\.(signal|store|constant)\.ts$/);
    if (!match || match[2] !== match[3]) return null;
    const [, underscore, module, , role] = match as unknown as [string, string, string, string, keyof ModuleFiles];
    return { module, kind: (underscore ? "service" : "database") as RuntimeModuleKind, role };
  }

  static layerOf(scope: string, files: RuntimeSourceFile[]): RuntimeLayer {
    const byModule = new Map<string, ModuleFiles>();
    for (const source of files) {
      const found = RuntimeModuleFacts.moduleFileOf(scope, source.file);
      if (!found) continue;
      const entry = byModule.get(found.module) ?? { module: found.module, kind: found.kind };
      Object.assign(entry, { [found.role]: source });
      byModule.set(found.module, entry);
    }
    const approximations: string[] = [];
    const modules = [...byModule.values()]
      .sort((a, b) => (a.module < b.module ? -1 : a.module > b.module ? 1 : 0))
      .map((entry) => RuntimeModuleFacts.#moduleOf(scope, entry, approximations));
    return { scope, modules, approximations };
  }

  static storeOf(source: RuntimeSourceFile, approximations: string[]) {
    const facts = RuntimeModuleFacts.#reader.read(source.sourceFile, null);
    const calls = RuntimeModuleFacts.#heritageCallsIn(source.sourceFile);
    const [fact] = facts.stores;
    const call = fact && calls.get(fact.name);
    if (!fact?.model || !call) return null;
    const [refArg, stateArg, ...rest] = call.arguments;
    const builders = [stateArg, ...rest].filter((arg) => arg && RuntimeModuleFacts.#isFunction(arg));
    const libArgs = rest.filter((arg) => !RuntimeModuleFacts.#isFunction(arg));
    const keysOf = (builder: ts.Expression | undefined) =>
      RuntimeModuleFacts.#objectKeys(source, builder, approximations, "state");
    return {
      name: fact.name,
      refName: fact.model,
      signal: !!refArg && !ts.isStringLiteral(RuntimeModuleFacts.#unwrap(refArg)),
      state: keysOf(builders[0]),
      derived: builders.length > 1 ? keysOf(builders[1]) : [],
      actions: fact.actions.map(({ name }) => name).filter((name) => !name.startsWith("#")),
      libStores: libArgs.flatMap((arg) => (ts.isIdentifier(arg) ? [arg.text] : [])),
      extendsLib: libArgs.some(ts.isSpreadElement),
    };
  }

  static signalOf(source: RuntimeSourceFile, refName: string, approximations: string[]) {
    const facts = RuntimeModuleFacts.#reader.read(source.sourceFile, null);
    const calls = RuntimeModuleFacts.#heritageCallsIn(source.sourceFile);
    const uploads = RuntimeModuleFacts.#fileUploadPositionsIn(source.sourceFile);
    const extendsLib = (name: string) => !!calls.get(name)?.arguments.some(ts.isSpreadElement);
    const endpointClasses = facts.endpoints.filter(({ model }) => model === refName);
    const sliceClass = facts.slices.find(({ model }) => model === refName);
    for (const { name } of [...endpointClasses, ...(sliceClass ? [sliceClass] : [])])
      for (const builder of calls.get(name)?.arguments.filter(RuntimeModuleFacts.#isFunction) ?? [])
        RuntimeModuleFacts.#objectKeys(source, builder, approximations, "signal");
    const endpoints = endpointClasses.flatMap(({ keys }) =>
      keys.map(({ name, verb, extent }) => ({
        name,
        verb,
        fileUpload: uploads.some((position) => position >= extent.start && position < extent.end),
      })),
    );
    const sliceCall = sliceClass && calls.get(sliceClass.name);
    const slice = sliceClass &&
      sliceCall && {
        guards: RuntimeModuleFacts.#verbGuardsOf(source, sliceCall, approximations),
        keys: sliceClass.keys.map(({ name, live }) => ({ name, live })),
      };
    return {
      endpoints,
      slice: slice || null,
      extendsLib: [...endpointClasses, ...(sliceClass ? [sliceClass] : [])].some(({ name }) => extendsLib(name)),
    };
  }

  static #moduleOf(scope: string, files: ModuleFiles, approximations: string[]): RuntimeModuleFact {
    const store = files.store ? RuntimeModuleFacts.storeOf(files.store, approximations) : null;
    return {
      scope,
      module: files.module,
      kind: files.kind,
      signal: files.signal ? RuntimeModuleFacts.signalOf(files.signal, files.module, approximations) : null,
      store,
      model: files.constant ? RuntimeModuleFacts.#modelOf(files.constant, files.module) : null,
    };
  }

  static #modelOf(source: RuntimeSourceFile, refName: string) {
    const facts = RuntimeModuleFacts.#reader.read(source.sourceFile, null);
    const calls = RuntimeModuleFacts.#heritageCallsIn(source.sourceFile);
    const byName = new Map(facts.constants.map((constant) => [constant.name, constant]));
    const model = byName.get(refName.charAt(0).toUpperCase() + refName.slice(1));
    if (!model) return null;
    const fields = new Map<string, RuntimeFieldFact>();
    let extendsLib = false;
    const seen = new Set<string>();
    const visit = (name: string) => {
      const constant = byName.get(name);
      if (!constant || seen.has(name)) return;
      seen.add(name);
      if (calls.get(name)?.arguments.some(ts.isSpreadElement)) extendsLib = true;
      for (const { name: field, type, array } of constant.fields)
        if (!fields.has(field)) fields.set(field, { name: field, type, array });
      for (const parent of constant.parents) visit(parent);
    };
    visit(model.name);
    return { fields: [...fields.values()], extendsLib };
  }

  static #verbGuardsOf(source: RuntimeSourceFile, call: ts.CallExpression, approximations: string[]) {
    const option = call.arguments.map(RuntimeModuleFacts.#unwrap).find(ts.isObjectLiteralExpression);
    const guardsProperty = option?.properties.find(
      (property) => RuntimeModuleFacts.#ast.propertyName(property) === "guards",
    );
    const guards = new Map<string, string[]>();
    const value =
      guardsProperty && ts.isPropertyAssignment(guardsProperty)
        ? RuntimeModuleFacts.#unwrap(guardsProperty.initializer)
        : null;
    if (guardsProperty && !(value && ts.isObjectLiteralExpression(value)))
      approximations.push(`${RuntimeModuleFacts.#where(source, call)}: slice guards are not an object literal`);
    for (const property of value && ts.isObjectLiteralExpression(value) ? value.properties : []) {
      const key = RuntimeModuleFacts.#ast.propertyName(property);
      if (!key || !ts.isPropertyAssignment(property)) {
        approximations.push(`${RuntimeModuleFacts.#where(source, property)}: a slice guard key is not written out`);
        continue;
      }
      guards.set(key, RuntimeModuleFacts.#guardNamesOf(source, property.initializer, approximations));
    }
    const cru = guards.get("cru") ?? [];
    return {
      root: guards.get("root") ?? null,
      get: guards.get("get") ?? [],
      create: guards.get("create") ?? cru,
      update: guards.get("update") ?? cru,
      remove: guards.get("remove") ?? cru,
    } satisfies RuntimeVerbGuards;
  }

  static #guardNamesOf(source: RuntimeSourceFile, expression: ts.Expression, approximations: string[]): string[] {
    const value = RuntimeModuleFacts.#unwrap(expression);
    if (value.kind === ts.SyntaxKind.FalseKeyword || (ts.isIdentifier(value) && value.text === "undefined")) return [];
    if (ts.isArrayLiteralExpression(value))
      return value.elements.flatMap((element) => RuntimeModuleFacts.#guardNamesOf(source, element, approximations));
    const name = RuntimeModuleFacts.#ast.expressionName(value);
    if (name) return [name];
    approximations.push(`${RuntimeModuleFacts.#where(source, value)}: a slice guard is not a name; counted as mounted`);
    return ["?"];
  }

  static #objectKeys(
    source: RuntimeSourceFile,
    builder: ts.Expression | undefined,
    approximations: string[],
    what: string,
  ) {
    const object = builder ? RuntimeModuleFacts.#ast.firstObjectReturnedByArrow(builder) : null;
    if (builder && !object)
      approximations.push(
        `${RuntimeModuleFacts.#where(source, builder)}: the ${what} factory returns no object literal`,
      );
    return (object?.properties ?? []).flatMap((property) => {
      const name = RuntimeModuleFacts.#ast.propertyName(property);
      if (!name)
        approximations.push(`${RuntimeModuleFacts.#where(source, property)}: a ${what} key is spread or computed`);
      return name ? [name] : [];
    });
  }

  static #heritageCallsIn(sourceFile: ts.SourceFile) {
    const calls = new Map<string, ts.CallExpression>();
    for (const statement of sourceFile.statements) {
      if (!ts.isClassDeclaration(statement) || !statement.name) continue;
      const heritage = RuntimeModuleFacts.#ast.heritageCallNamed(statement, RuntimeModuleFacts.#heritageCallees);
      if (heritage) calls.set(statement.name.text, heritage.call);
    }
    return calls;
  }

  static #fileUploadPositionsIn(sourceFile: ts.SourceFile) {
    const positions: number[] = [];
    const visit = (node: ts.Node) => {
      if (
        ts.isPropertyAssignment(node) &&
        RuntimeModuleFacts.#ast.nodeName(node.name) === "fileUpload" &&
        node.initializer.kind === ts.SyntaxKind.TrueKeyword
      )
        positions.push(node.getStart(sourceFile));
      ts.forEachChild(node, visit);
    };
    if (sourceFile.text.includes("fileUpload")) visit(sourceFile);
    return positions;
  }

  static #isFunction(expression: ts.Expression) {
    const value = RuntimeModuleFacts.#unwrap(expression);
    return ts.isArrowFunction(value) || ts.isFunctionExpression(value);
  }

  static #unwrap(expression: ts.Expression): ts.Expression {
    let current = expression;
    while (ts.isParenthesizedExpression(current) || ts.isAsExpression(current) || ts.isSatisfiesExpression(current))
      current = current.expression;
    return current;
  }

  static #where({ file, sourceFile }: RuntimeSourceFile, node: ts.Node) {
    const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
    return `${file}:${line + 1}:${character + 1}`;
  }
}
