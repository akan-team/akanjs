import { readdir } from "node:fs/promises";
import path from "node:path";
import {
  capitalize,
  databaseStateNames,
  endpointNames,
  formSetterNames,
  modelNames,
  sliceNames,
  stateSetterName,
} from "akanjs/common";
import ts from "typescript";
import { type RuntimeConstantEntry, type RuntimeConstantFact, RuntimeConstantFacts } from "./runtimeConstantFacts";
import {
  type RuntimeFieldFact,
  type RuntimeLayer,
  type RuntimeModuleFact,
  RuntimeModuleFacts,
  type RuntimeSourceFile,
  type RuntimeVerbGuards,
} from "./runtimeModuleFacts";

export const runtimeFamilies = [
  "st.do",
  "st.use",
  "st.slice",
  "fetch",
  "fetch.slice",
  "sig",
  "fetch.serializedSignal",
] as const;
export type RuntimeFamily = (typeof runtimeFamilies)[number];

export interface RuntimeOwner {
  scope: string;
  module: string;
}

export type RuntimeNeed = "store" | "descriptor";

export interface RuntimeNameEntry {
  owners: RuntimeOwner[];
  definedBy: RuntimeOwner[];
  base: RuntimeNeed | null;
  needs: RuntimeNeed;
  uses: RuntimeOwner[];
}

interface RuntimeAddOptions {
  needs?: RuntimeNeed;
  uses?: RuntimeOwner | null;
}

interface EffectiveSignal {
  endpoints: { name: string; verb: string | null; by: RuntimeModuleFact }[];
  slices: { suffix: string; live: boolean; by: RuntimeModuleFact }[] | null;
  guards: RuntimeVerbGuards | null;
}

const modelActionRoles = [
  "createModelInForm",
  "updateModelInForm",
  "checkModelSubmitable",
  "submitModel",
  "createModel",
  "updateModel",
  "removeModel",
  "mergeModel",
  "newModel",
  "editModel",
  "viewModel",
  "setModel",
  "resetModel",
  "invalidateModel",
  "loadModelFormDraft",
  "restoreModelFormDraft",
  "discardModelFormDraft",
  "writeOnModel",
] as const satisfies (keyof ReturnType<typeof modelNames>)[];

export const baseScope = "akanjs";

export class RuntimeNameTable {
  readonly #entries = new Map<RuntimeFamily, Map<string, RuntimeNameEntry>>(
    runtimeFamilies.map((family) => [family, new Map()]),
  );
  readonly #dependencies = new Map<string, RuntimeOwner[]>();
  readonly #constants = new Map<string, Map<string, RuntimeConstantEntry | null>>();
  readonly #file: { refName: string; owner: RuntimeOwner | null } | null;
  readonly scope: string;
  readonly layers: RuntimeLayer[];
  readonly approximations: string[];

  static async read(workspaceRoot: string, scope: string) {
    const scopes = await RuntimeNameTable.#scopesOf(workspaceRoot, scope);
    return scopes ? RuntimeNameTable.readScopes(workspaceRoot, scopes) : null;
  }

  //? `scopes` in load order, each lib before the scope mounting it: what `akan sync` knows before `lib/st.ts` exists.
  static async readScopes(workspaceRoot: string, scopes: string[]) {
    const layers = await Promise.all(
      scopes.map((layerScope) => RuntimeNameTable.#readLayer(workspaceRoot, layerScope)),
    );
    return RuntimeNameTable.fromLayers(layers, await RuntimeNameTable.readBase(workspaceRoot));
  }

  static async readBase(workspaceRoot: string): Promise<RuntimeLayer> {
    const akanjsRoot = path.dirname(Bun.resolveSync("akanjs/package.json", workspaceRoot));
    const sourceOf = async (file: string) => RuntimeNameTable.#parse(file, path.join(akanjsRoot, file));
    const [store, baseSignal, agentSignal] = await Promise.all(
      ["store/baseSt.ts", "signal/base.signal.ts", "signal/agent.signal.ts"].map(sourceOf),
    );
    const approximations: string[] = [];
    const baseStore = RuntimeModuleFacts.storeOf(store, approximations);
    const signalOf = (source: RuntimeSourceFile, refName: string) =>
      RuntimeModuleFacts.signalOf(source, refName, approximations);
    return {
      scope: baseScope,
      modules: [
        {
          scope: baseScope,
          module: "agent",
          kind: "service",
          signal: signalOf(agentSignal, "agent"),
          store: null,
          model: null,
        },
        {
          scope: baseScope,
          module: "base",
          kind: "service",
          signal: signalOf(baseSignal, "base"),
          store: baseStore,
          model: null,
        },
      ],
      approximations,
    };
  }

  static fromLayers(layers: RuntimeLayer[], base: RuntimeLayer) {
    return new RuntimeNameTable(layers, base);
  }

  private constructor(layers: RuntimeLayer[], base: RuntimeLayer) {
    this.scope = layers.at(-1)?.scope ?? baseScope;
    this.layers = layers;
    this.approximations = [...base.approximations, ...layers.flatMap((layer) => layer.approximations)];
    const ordered = [base, ...layers];
    const fileRefName = RuntimeNameTable.#fileUploadRefNameOf(ordered);
    this.#file = fileRefName
      ? { refName: fileRefName, owner: RuntimeNameTable.#outermostOf(ordered, fileRefName, "signal") }
      : null;
    ordered.forEach((layer, index) => {
      for (const module of layer.modules) this.#addModule(ordered, index, module);
    });
    for (const layer of layers) this.#constants.set(layer.scope, RuntimeNameTable.#constantNamesOf(layer, layers));
  }

  constantOf(scope: string, name: string): RuntimeConstantEntry | null {
    return this.#constants.get(scope)?.get(name) ?? null;
  }

  constantsOf(scope: string): RuntimeConstantFact[] {
    return this.layers.find((layer) => layer.scope === scope)?.constants ?? [];
  }

  static #constantNamesOf(layer: RuntimeLayer, layers: RuntimeLayer[]) {
    const names = new Map<string, RuntimeConstantEntry | null>();
    //? `export *` of two constant files naming one value exports neither, so the name is left unanswered.
    for (const fact of layer.constants ?? [])
      for (const name of fact.exports) names.set(name, names.has(name) ? null : { type: "export", fact });
    for (const fact of layer.constants ?? []) names.set(fact.module, { type: "model", fact });
    for (const lib of layer.constantLibs ?? [])
      if (layers.some(({ scope }) => scope === `libs/${lib}`))
        names.set(lib, { type: "namespace", scope: `libs/${lib}` });
    return names;
  }

  get modules() {
    return this.layers.flatMap((layer) => layer.modules);
  }

  lookup(family: RuntimeFamily, key: string): RuntimeNameEntry | null {
    return this.#entries.get(family)?.get(key) ?? null;
  }

  keysOf(family: RuntimeFamily) {
    return [...(this.#entries.get(family)?.keys() ?? [])].sort();
  }

  //? `store()` picks upload setters from the file module's descriptor when the class is defined, so it loads first.
  dependenciesOf(scope: string, module: string): RuntimeOwner[] {
    return this.#dependencies.get(`${scope}/${module}`) ?? [];
  }

  #addModule(ordered: RuntimeLayer[], index: number, module: RuntimeModuleFact) {
    const definer = RuntimeNameTable.#definerOf(module);
    if (module.signal)
      this.#add(
        "fetch.serializedSignal",
        module.module,
        definer,
        RuntimeNameTable.#outermostOf(ordered, module.module, "signal"),
      );
    if (module.store) this.#addStore(ordered, index, module);
    if (module.signal && index === RuntimeNameTable.#outermostIndexOf(ordered, module.module, "signal"))
      this.#addSignal(ordered, index, module);
  }

  #addStore(ordered: RuntimeLayer[], index: number, module: RuntimeModuleFact) {
    const store = module.store;
    if (!store) return;
    const definer = RuntimeNameTable.#definerOf(module);
    const owner = RuntimeNameTable.#headOf(ordered, index, module.module, "store");
    const state = this.#storeState(ordered, index, module);
    const derived = new Set(store.derived);
    const setters = state.filter((key) => !derived.has(key)).map(stateSetterName);
    for (const key of state) this.#add("st.use", key, definer, owner);
    for (const key of [...setters, ...store.actions]) this.#add("st.do", key, definer, owner);
    if (!store.signal) return;
    const { actions, uploads } = this.#generatedActions(ordered, index, module);
    const uses = this.#fileOwnerFor(module);
    if (uploads.length && uses) this.#dependencies.set(`${module.scope}/${module.module}`, [uses]);
    if (!module.signal) return;
    for (const key of actions) this.#add("st.do", key, definer, owner);
    for (const key of uploads) this.#add("st.do", key, definer, owner, { uses });
    //? The root store keeps one slice map per model, the outermost store's.
    if (index !== RuntimeNameTable.#outermostIndexOf(ordered, module.module, "store")) return;
    for (const { suffix, by } of RuntimeNameTable.#effectiveSignalOf(ordered, index, module.module).slices ?? [])
      this.#add("st.slice", sliceNames(module.module, suffix).slice, RuntimeNameTable.#definerOf(by), owner);
  }

  #addSignal(ordered: RuntimeLayer[], index: number, module: RuntimeModuleFact) {
    const owner = RuntimeNameTable.#outermostOf(ordered, module.module, "signal");
    const definer = RuntimeNameTable.#definerOf(module);
    const effective = RuntimeNameTable.#effectiveSignalOf(ordered, index, module.module);
    for (const { name, verb, by } of effective.endpoints) {
      const endpointDefiner = RuntimeNameTable.#definerOf(by);
      const plain = { needs: "descriptor" } as const;
      this.#add("fetch", verb === "pubsub" ? endpointNames(name).subscribe : name, endpointDefiner, owner, plain);
      if (verb === "message") this.#add("fetch", endpointNames(name).listen, endpointDefiner, owner, plain);
    }
    if (!effective.slices || !effective.guards) return;
    if (module.kind === "database") this.#add("sig", module.module, definer, owner);
    const names = modelNames(module.module);
    const mounted = (verb: keyof RuntimeVerbGuards) => !!effective.guards?.[verb]?.some((guard) => guard !== "None");
    const write = mounted("create") || mounted("update") || mounted("remove");
    const requests = [
      ...(mounted("get") ? [names.model, names.lightModel] : []),
      ...(mounted("create") ? [names.createModel] : []),
      ...(mounted("update") ? [names.updateModel, names.mergeModel] : []),
      ...(mounted("remove") ? [names.removeModel] : []),
    ];
    const handles = [
      ...(mounted("get") ? [names.viewModel, names.getModelView] : []),
      ...(mounted("get") && write ? [names.editModel, names.getModelEdit] : []),
    ];
    for (const key of requests) this.#add("fetch", key, definer, owner, { needs: "descriptor" });
    for (const key of handles) this.#add("fetch", key, definer, owner);
    const uses = this.#fileOwnerFor(module);
    this.#add("fetch", names.addModelFiles, definer, owner, { needs: "descriptor", uses });
    for (const { suffix, live, by } of effective.slices) {
      const sliceDefiner = RuntimeNameTable.#definerOf(by);
      const { slice, endpoint } = sliceNames(module.module, suffix);
      for (const key of [endpoint.list, endpoint.insight, endpoint.init, endpoint.getInit])
        this.#add("fetch", key, sliceDefiner, owner);
      if (live) this.#add("fetch", endpoint.subscribeLive, sliceDefiner, owner);
      this.#add("fetch.slice", slice, sliceDefiner, owner);
    }
  }

  #storeState(ordered: RuntimeLayer[], index: number, module: RuntimeModuleFact) {
    const store = module.store;
    if (!store) return [];
    const generated: string[] = [];
    if (store.signal && module.signal) {
      const { defaultModel: _, ...database } = databaseStateNames(module.module);
      generated.push(...Object.values(database));
      for (const { suffix } of RuntimeNameTable.#effectiveSignalOf(ordered, index, module.module).slices ?? [])
        generated.push(...Object.values(sliceNames(module.module, suffix).state));
    }
    return [...store.state, ...generated, ...store.derived];
  }

  #fileOwnerFor(module: RuntimeModuleFact) {
    const owner = this.#file?.owner;
    return owner && owner.module !== module.module ? owner : null;
  }

  #generatedActions(ordered: RuntimeLayer[], index: number, module: RuntimeModuleFact) {
    const fileRefName = this.#file?.refName;
    const names = modelNames(module.module);
    const className = capitalize(module.module);
    const fileTypes = fileRefName
      ? new Set(
          ["", "Light"].flatMap((prefix) =>
            ["", "Input", "Object", "Insight"].map((suffix) => `${prefix}${capitalize(fileRefName)}${suffix}`),
          ),
        )
      : new Set<string>();
    const fields = RuntimeNameTable.#fieldsOf(ordered, module.module);
    const setters = fields.flatMap(({ name, array }) => {
      const field = formSetterNames(className, name);
      return [
        field.setFieldOnModel,
        ...(array ? [field.addFieldOnModel, field.subFieldOnModel, field.addOrSubFieldOnModel] : []),
      ];
    });
    const uploads = fields
      .filter(({ type }) => type && fileTypes.has(type))
      .map(({ name }) => formSetterNames(className, name).uploadFieldOnModel);
    const sliceActions = (RuntimeNameTable.#effectiveSignalOf(ordered, index, module.module).slices ?? []).flatMap(
      ({ suffix }) => Object.values(sliceNames(module.module, suffix).action),
    );
    return { actions: [...setters, ...modelActionRoles.map((role) => names[role]), ...sliceActions], uploads };
  }

  #add(
    family: RuntimeFamily,
    key: string,
    definedBy: RuntimeOwner | null,
    owner: RuntimeOwner | null,
    { needs = "store", uses = null }: RuntimeAddOptions = {},
  ) {
    const entries = this.#entries.get(family);
    if (!entries) return;
    const entry = entries.get(key) ?? { owners: [], definedBy: [], base: null, needs, uses: [] };
    if (!definedBy) entry.base = family.startsWith("st.") ? "store" : "descriptor";
    if (needs === "store") entry.needs = "store";
    const has = (list: RuntimeOwner[], target: RuntimeOwner) =>
      list.some(({ scope, module }) => scope === target.scope && module === target.module);
    if (definedBy && !has(entry.definedBy, definedBy)) entry.definedBy.push(definedBy);
    if (owner && !has(entry.owners, owner)) entry.owners.push(owner);
    if (uses && !has(entry.uses, uses)) entry.uses.push(uses);
    entries.set(key, entry);
  }

  //? A module's whole model reaches every layer: an app's fields land on the lib's full model class too.
  static #fieldsOf(ordered: RuntimeLayer[], refName: string) {
    const baseFields = ["id", "createdAt", "updatedAt", "removedAt"].map(
      (name): RuntimeFieldFact => ({
        name,
        type: null,
        array: false,
      }),
    );
    const fields = new Map(baseFields.map((field) => [field.name, field]));
    for (const layer of ordered)
      for (const module of layer.modules)
        if (module.module === refName)
          for (const field of module.model?.fields ?? []) if (!fields.has(field.name)) fields.set(field.name, field);
    return [...fields.values()];
  }

  //? The first `fileUpload: true` endpoint in load order wins, as `resolveFileUploadCapability` picks it at runtime.
  static #fileUploadRefNameOf(ordered: RuntimeLayer[]) {
    for (const layer of ordered)
      for (const kind of ["database", "service"] as const)
        for (const module of layer.modules)
          if (module.kind === kind && module.signal?.endpoints.some(({ fileUpload }) => fileUpload))
            return module.module;
    return null;
  }

  static #effectiveSignalOf(ordered: RuntimeLayer[], index: number, refName: string): EffectiveSignal {
    const endpoints: EffectiveSignal["endpoints"] = [];
    const slices: NonNullable<EffectiveSignal["slices"]> = [];
    let guards: RuntimeVerbGuards | null = null;
    let hasSlice = false;
    for (let at = index; at >= 0; at--) {
      const module = ordered[at]?.modules.find((candidate) => candidate.module === refName && candidate.signal);
      if (!module?.signal) continue;
      const own = at === index;
      for (const { name, verb } of module.signal.endpoints)
        if (!endpoints.some((endpoint) => endpoint.name === name)) endpoints.push({ name, verb, by: module });
      if (module.signal.slice) {
        hasSlice = true;
        if (own) guards = module.signal.slice.guards;
        if (own && module.signal.slice.guards.root !== null && !slices.some(({ suffix }) => suffix === ""))
          slices.push({ suffix: "", live: false, by: module });
        for (const { name, live } of module.signal.slice.keys)
          if (!slices.some(({ suffix }) => suffix === name)) slices.push({ suffix: name, live, by: module });
      }
      if (!module.signal.extendsLib) break;
    }
    return { endpoints, slices: hasSlice ? slices : null, guards };
  }

  static #outermostIndexOf(ordered: RuntimeLayer[], refName: string, kind: "store" | "signal") {
    return ordered.findLastIndex((layer) => layer.modules.some((module) => module.module === refName && module[kind]));
  }

  static #outermostOf(ordered: RuntimeLayer[], refName: string, kind: "store" | "signal") {
    const module = ordered[RuntimeNameTable.#outermostIndexOf(ordered, refName, kind)]?.modules.find(
      (candidate) => candidate.module === refName && candidate[kind],
    );
    return module ? RuntimeNameTable.#definerOf(module) : null;
  }

  //? An outer module that spreads its lib's declarations loads them, so it answers for the lib's names too.
  static #headOf(ordered: RuntimeLayer[], index: number, refName: string, kind: "store" | "signal") {
    let head = ordered[index]?.modules.find((module) => module.module === refName && module[kind]);
    for (let at = index + 1; at < ordered.length && head; at++) {
      const outer = ordered[at]?.modules.find((module) => module.module === refName && module[kind]);
      if (!outer) continue;
      if (!(kind === "store" ? outer.store?.extendsLib : outer.signal?.extendsLib)) break;
      head = outer;
    }
    return head ? RuntimeNameTable.#definerOf(head) : null;
  }

  static #definerOf(module: RuntimeModuleFact): RuntimeOwner | null {
    return module.scope === baseScope ? null : { scope: module.scope, module: module.module };
  }

  static async #scopesOf(workspaceRoot: string, scope: string, seen = new Set<string>()): Promise<string[] | null> {
    if (seen.has(scope)) return [];
    seen.add(scope);
    const storeFile = Bun.file(path.join(workspaceRoot, scope, "lib/st.ts"));
    if (!(await storeFile.exists())) return null;
    const libs = [...(await storeFile.text()).matchAll(/from\s+["']@libs\/([^/"']+)\/client["']/g)].map(
      ([, lib]) => lib,
    );
    const ordered: string[] = [];
    for (const lib of libs.filter((lib): lib is string => !!lib)) {
      const inner = await RuntimeNameTable.#scopesOf(workspaceRoot, `libs/${lib}`, seen);
      if (!inner) return null;
      ordered.push(...inner);
    }
    return [...ordered, scope];
  }

  static async #readLayer(workspaceRoot: string, scope: string) {
    const libDir = path.join(workspaceRoot, scope, "lib");
    const dirs = (await readdir(libDir, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith("__"))
      .map((entry) => entry.name)
      .sort();
    const files = await Promise.all(
      dirs.flatMap((dir) =>
        ["signal", "store", "constant"].map(async (role) => {
          const file = `${scope}/lib/${dir}/${dir.replace(/^_/, "")}.${role}.ts`;
          const absolute = path.join(workspaceRoot, file);
          return (await Bun.file(absolute).exists()) ? RuntimeNameTable.#parse(file, absolute) : null;
        }),
      ),
    );
    const scalarDir = path.join(libDir, "__scalar");
    const scalars = await Promise.all(
      (await readdir(scalarDir, { withFileTypes: true }).catch(() => []))
        .filter((entry) => entry.isDirectory())
        .map(async ({ name }) => {
          const file = `${scope}/lib/__scalar/${name}/${name}.constant.ts`;
          const absolute = path.join(workspaceRoot, file);
          return (await Bun.file(absolute).exists()) ? RuntimeNameTable.#parse(file, absolute) : null;
        }),
    );
    const read = files.filter((file): file is RuntimeSourceFile => !!file);
    const constants = [...read, ...scalars.filter((file): file is RuntimeSourceFile => !!file)]
      .map((source) => RuntimeConstantFacts.of(source))
      .filter((fact): fact is RuntimeConstantFact => !!fact)
      .sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : 0));
    const cnstFile = Bun.file(path.join(libDir, "cnst.ts"));
    const constantLibs = (await cnstFile.exists())
      ? [...(await cnstFile.text()).matchAll(/export\s*\{\s*cnst\s+as\s+(\w+)\s*\}\s*from\s*["']@libs\/(\w+)["']/g)]
          .filter(([, name, lib]) => name === lib)
          .map(([, name]) => name as string)
      : [];
    return { ...RuntimeModuleFacts.layerOf(scope, read), constants, constantLibs };
  }

  static async #parse(file: string, absolute: string): Promise<RuntimeSourceFile> {
    const text = await Bun.file(absolute).text();
    return { file, sourceFile: ts.createSourceFile(absolute, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS) };
  }
}
