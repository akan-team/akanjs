import type {
  AkanGraph,
  AkanGraphEdge,
  AkanGraphEdgeKind,
  AkanGraphField,
  AkanGraphLocation,
  AkanGraphNode,
  AkanGraphNodeKind,
} from "akanjs/common/akanGraph.ts";
import type * as TS from "typescript";
import type { Ts } from "./ast";
import {
  type AdaptorFact,
  type AkanFactReader,
  type AkanSpan,
  type ConstantClassFact,
  type Extent,
  type FileFacts,
  type GuardCallFact,
  type GuardFact,
  type GuardFactoryFact,
  guardLabelOf,
  type MemberFact,
  ownerOf,
  testFilePattern,
} from "./moduleFacts";
import type { AkanTarget } from "./nameTable";
import { type RouteFact, RouteFactReader, type RouteGuardCall } from "./routeFacts";

export interface AkanGraphSource {
  ts: Ts;
  facts: FileFacts[];
  files: [fileName: string, words: string][];
  readText: (fileName: string) => string | undefined;
  parse: (fileName: string, text: string) => TS.SourceFile;
  resolve: (fileName: string, identifier: TS.Identifier) => AkanTarget[];
  relative: (fileName: string) => string;
  ownerOf: (fileName: string) => string | null;
  reader: AkanFactReader;
  digests?: boolean;
}

interface Context {
  id: string;
  kind: AkanGraphNodeKind;
  owner: string | null;
  module: string | null;
  extent: Extent;
  pending?: AkanGraphNode;
}

type MemberKind = "method" | "slice" | "endpoint" | "action" | "internal";

type GuardSite = Pick<FileFacts, "fileName" | "owner" | "imports">;

interface GuardPart {
  fileName: string;
  extent: Extent;
}

interface DeclaredAdaptor {
  fact: AdaptorFact;
  owner: string | null;
  fileName: string;
  id: string;
}

interface DeclaredPlug {
  owner: string | null;
  target: string;
}

interface DeclaredGuard {
  name: string;
  owner: string | null;
  span: AkanSpan;
  scope: string | null;
  doc: string | null;
  parts: GuardPart[];
  file: string | null;
  label?: string;
}

interface DeclaredFactory {
  fact: GuardFactoryFact;
  owner: string | null;
  site: GuardSite;
  made: DeclaredGuard[];
  isReal: boolean;
  scope: string | null;
  targets: DeclaredFactory[];
}

interface MapEntry {
  name: string;
  site: GuardSite;
}

type GuardLookup = { guard: DeclaredGuard } | { name: string; from: string | undefined } | { external: true };

interface Reexport {
  name: string;
  from: string | null;
}

interface Declaration {
  source: TS.SourceFile;
  statement: TS.Statement;
  declared: TS.Node;
  extent: Extent;
  name: string;
}

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
const lowerFirst = (text: string) => text.charAt(0).toLowerCase() + text.slice(1);
const memberSourcePattern = /\.(signal|service|store)\.ts$/;
const skippedPattern =
  /(?:\.(?:constant|document|dictionary|test|spec)\.tsx?|\/lib\/(?:cnst|db|dict|sig|srv|st|useClient|useServer)\.ts|\/index\.tsx?|^(?:apps|libs)\/[^/]+\/(?:client|server)\.ts)$/;
const scalarPattern = /\/lib\/__scalar\/([^/]+)\/[^/]+\.constant\.ts$/;
const moduleDirPattern = /\/lib\/([^/]+)\//;
const typeKinds = new Set<AkanGraphNodeKind>(["model", "scalar", "enum"]);
//? UI reaches module data only through these; `option.orgId` in a component is a plain property, not model `org`.
const clientRoots = new Set(["fetch", "st", "sig"]);
const builtinGuards: Partial<Record<string, { scope: string; doc: string }>> = {
  Public: { scope: "account", doc: "Passes every caller, signed in or not." },
  None: { scope: "account", doc: "Refuses every caller." },
};
const frameworkOwner = "akanjs";
const frameworkPattern = /^akanjs(?:\/|$)/;
const aliasPattern = /^@(apps|libs)\/([^/]+)/;
const maxMapDepth = 4;
const starExportPattern = /export\s*\*\s*from\s*["']([^"']+)["']/g;

const declaringPatternOf = (name: string, isAnyBinding: boolean) => {
  const escaped = name.replace(/\$/g, "\\$");
  const braced = "\\{(?:[^}]*?[\\s,])?";
  const leads = [
    "function\\s*\\*?\\s*",
    "(?:const|let|var)\\s+",
    `export\\s*${braced}`,
    ...(isAnyBinding ? ["class\\s+", `(?:const|let|var)\\s*${braced}`] : []),
  ];
  return new RegExp(`(?:${leads.join("|")})${escaped}(?![\\w$])|,\\s*${escaped}\\s*(?::[^=;,]+)?=(?![=>])`);
};

export class GraphBuilder {
  readonly #source: AkanGraphSource;
  readonly #nodes = new Map<string, AkanGraphNode>();
  readonly #edges = new Map<string, AkanGraphEdge>();
  readonly #contexts = new Map<string, Context[]>();
  readonly #members = new Map<string, AkanGraphNode[]>();
  readonly #guards = new Map<string, DeclaredGuard[]>();
  readonly #madeInPlace = new Map<string, DeclaredGuard>();
  readonly #mapEntries = new Map<string, MapEntry[]>();
  readonly #reexports = new Map<string, { local: string; site: GuardSite } | null>();
  readonly #routeFiles = new Map<string, { id: string; alias: string | null }>();
  readonly #declarations = new Map<string, Declaration | null>();
  readonly #starExports = new Map<string, { owners: string[]; isOpaque: boolean }>();
  #ownerFiles: Map<string, [fileName: string, words: string][]> | null = null;
  #modules: Map<string, string[]> | null = null;
  readonly #routes: RouteFactReader;
  readonly #adaptors = new Map<string, DeclaredAdaptor[]>();
  readonly #plugs = new Map<string, DeclaredPlug[]>();
  readonly #serviceFields = new Set<string>();

  constructor(source: AkanGraphSource) {
    this.#source = source;
    this.#routes = new RouteFactReader(source.ts, source.reader, source.parse);
  }

  build(): AkanGraph {
    const { facts } = this.#source;
    const constantsByOwner = new Map<string | null, ConstantClassFact[]>();
    for (const file of facts)
      constantsByOwner.set(file.owner, [...(constantsByOwner.get(file.owner) ?? []), ...file.constants]);
    const scopeOf = (owner: string | null) => [
      ...(constantsByOwner.get(owner) ?? []),
      ...[...constantsByOwner].filter(([key]) => key !== owner && key?.startsWith("libs/")).flatMap(([, list]) => list),
    ];
    const typed: AkanGraphNode[] = [];

    const adaptorCounts = new Map<string, number>();
    for (const file of facts)
      for (const fact of file.adaptors) {
        const key = this.#key("adaptor", file.owner, fact.name);
        adaptorCounts.set(key, (adaptorCounts.get(key) ?? 0) + 1);
      }
    const declaredAdaptors = facts.flatMap((file) =>
      file.adaptors.map((fact) => {
        const key = this.#key("adaptor", file.owner, fact.name);
        const id =
          (adaptorCounts.get(key) ?? 0) > 1
            ? this.#key("adaptor", file.owner, `${this.#ownPathOf(file)}#${fact.name}`)
            : key;
        const declared = { fact, owner: file.owner, fileName: file.fileName, id };
        this.#adaptors.set(fact.name, [...(this.#adaptors.get(fact.name) ?? []), declared]);
        this.#adaptorNodeOf(declared);
        return { declared, file };
      }),
    );
    for (const { declared, file } of declaredAdaptors)
      for (const plug of declared.fact.plugs)
        this.#addEdge(declared.id, this.#adaptorIdOf(plug.target, file), "plugs", plug.name, this.#location(plug.span));
    for (const file of facts)
      for (const binding of file.adaptorBindings)
        this.#addEdge(
          this.#adaptorIdOf(binding.role, file),
          this.#adaptorIdOf(binding.adaptor, file),
          "binds",
          file.owner,
          this.#location(binding.span),
        );

    this.#declareGuards(facts);

    for (const file of facts) {
      const { owner } = file;
      const scalar = this.#source.relative(file.fileName).match(scalarPattern)?.[1];
      const scalarClass = scalar ? file.constants.find((constant) => constant.name === capitalize(scalar)) : undefined;
      if (scalar && scalarClass) {
        const id = this.#key("scalar", owner, scalar);
        const node = this.#addNode(id, "scalar", owner, scalar, scalarClass.name, scalarClass.span);
        node.fields = this.#fieldsOf(scalarClass, scopeOf(owner));
        typed.push(node);
      }
      for (const item of file.enums) {
        const id = this.#key("enum", owner, item.name);
        this.#addNode(id, "enum", owner, this.#moduleDirOf(file.fileName), item.name, item.span).values = item.values;
      }
    }

    for (const file of facts) {
      const { owner } = file;
      for (const service of file.services) {
        const refName = service.model;
        if (!refName) continue;
        const modelId = this.#key("model", owner, refName);
        const modelClass = constantsByOwner.get(owner)?.find((constant) => constant.name === capitalize(refName));
        if (modelClass && !this.#nodes.has(modelId)) {
          const node = this.#addNode(modelId, "model", owner, refName, modelClass.name, modelClass.span);
          node.fields = this.#fieldsOf(modelClass, scopeOf(owner));
          typed.push(node);
        }
        for (const method of service.methods)
          this.#addMember("method", owner, refName, method, `${service.name}.${method.name}`, file.fileName);
        for (const plug of service.plugs) {
          const key = `${refName}\n${plug.name}`;
          this.#plugs.set(key, [
            ...(this.#plugs.get(key) ?? []),
            { owner, target: this.#adaptorIdOf(plug.target, file) },
          ]);
        }
        for (const field of service.fields) this.#serviceFields.add(`${owner ?? ""}\n${refName}\n${field}`);
      }
      for (const filter of file.filters) {
        if (!filter.name.endsWith("Filter")) continue;
        const refName = lowerFirst(filter.name.slice(0, -"Filter".length));
        this.#addNode(this.#key("query", owner, refName), "query", owner, refName, "", filter.span);
        for (const query of filter.queries)
          this.#digest(
            this.#addNode(
              this.#key("query", owner, refName, query.name),
              "query",
              owner,
              refName,
              query.name,
              query.span,
            ),
            this.#source.readText(file.fileName),
            query.extent,
          );
      }
      for (const slice of file.slices) {
        const refName = slice.model;
        if (!refName) continue;
        const fallback = this.#addNode(
          this.#key("slice", owner, refName),
          "slice",
          owner,
          refName,
          "",
          slice.span,
          slice.guards.map((guard) => guardLabelOf(guard, file.guardLabels)),
        );
        for (const guard of slice.guards) this.#guard(fallback, guard, file);
        for (const key of slice.keys) {
          const detail = [
            ...key.guards.map((guard) => guardLabelOf(guard, file.guardLabels)),
            ...(key.live ? ["live"] : []),
          ];
          const node = this.#addMember("slice", owner, refName, key, `${refName}.${key.name}`, file.fileName, detail);
          for (const guard of key.guards) this.#guard(node, guard, file);
        }
      }
      for (const endpoint of file.endpoints) {
        const refName = endpoint.model;
        if (!refName) continue;
        for (const key of endpoint.keys) {
          const detail = [
            ...(key.verb ? [key.verb] : []),
            ...key.guards.map((guard) => guardLabelOf(guard, file.guardLabels)),
          ];
          const node = this.#addMember(
            "endpoint",
            owner,
            refName,
            key,
            `${refName}.${key.name}`,
            file.fileName,
            detail,
          );
          for (const guard of key.guards) this.#guard(node, guard, file);
        }
      }
      for (const internal of file.internals)
        for (const key of internal.keys)
          if (internal.model && key.type !== "resolveField")
            this.#addMember(
              "internal",
              owner,
              internal.model,
              key,
              `${internal.name}.${key.name}`,
              file.fileName,
              [key.type, key.schedule, ...key.modes].filter((item) => item !== null),
            );
      for (const store of file.stores)
        if (store.model)
          for (const action of store.actions)
            this.#addMember("action", owner, store.model, action, `${store.name}.${action.name}`, file.fileName);
    }

    const types = new Map<string, AkanGraphNode[]>();
    for (const node of this.#nodes.values())
      if (typeKinds.has(node.kind)) types.set(node.label, [...(types.get(node.label) ?? []), node]);
    for (const node of typed)
      for (const field of node.fields ?? []) {
        const candidates = (field.type ? (types.get(field.type) ?? []) : []).filter((type) =>
          this.#visible(type.owner, node.owner),
        );
        field.ref = (candidates.find((type) => type.owner === node.owner) ?? candidates[0])?.id ?? null;
        if (field.ref) this.#addEdge(node.id, field.ref, "field", `${field.name}${field.array ? "[]" : ""}`, field.at);
      }

    this.#addRoutes();
    for (const [fileName, words] of this.#source.files) this.#walk(fileName, words);

    return {
      version: 1,
      nodes: [...this.#nodes.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)),
      edges: [...this.#edges.values()],
    };
  }

  #key(kind: AkanGraphNodeKind, owner: string | null, scope: string, name = "") {
    return `${kind}:${owner ?? ""}:${scope}${name ? `.${name}` : ""}`;
  }

  #location(span: AkanSpan): AkanGraphLocation {
    return { file: this.#source.relative(span.fileName), line: span.line + 1, column: span.character + 1 };
  }

  #addNode(
    id: string,
    kind: AkanGraphNodeKind,
    owner: string | null,
    module: string | null,
    name: string,
    span: AkanSpan | null,
    detail: string[] = [],
    label = (kind === "query" || kind === "slice") && module ? `${module}${name ? `.${name}` : " (default)"}` : name,
  ) {
    const existing = this.#nodes.get(id);
    if (existing) return existing;
    const node: AkanGraphNode = {
      id,
      kind,
      name,
      label,
      owner,
      module,
      detail,
      at: span ? this.#location(span) : null,
    };
    this.#nodes.set(id, node);
    return node;
  }

  #addMember(
    kind: MemberKind,
    owner: string | null,
    refName: string,
    member: MemberFact,
    label: string,
    fileName: string,
    detail: string[] = [],
  ) {
    const id = this.#key(kind, owner, refName, member.name);
    const node = this.#addNode(id, kind, owner, refName, member.name, member.span, detail, label);
    this.#digest(node, this.#source.readText(fileName), member.extent);
    this.#contexts.set(fileName, [
      ...(this.#contexts.get(fileName) ?? []),
      { id, kind, owner, module: refName, extent: member.extent },
    ]);
    const byName = `${kind}:${member.name}`;
    this.#members.set(byName, [...(this.#members.get(byName) ?? []), node]);
    return node;
  }

  //? FNV-1a over the body text only, so moving a member leaves it unchanged; a 32-bit collision at worst leaves one
  //? change unmarked in a Change Map. `\r` is skipped: git with core.autocrlf checks CRLF out over an LF blob.
  #hashOf(...parts: [text: string | undefined, extent: Extent][]) {
    if (!this.#source.digests) return null;
    let hash = 0x811c9dc5;
    for (const [text, { start, end }] of parts) {
      if (text === undefined) return null;
      for (let idx = start; idx < end; idx++) {
        const code = text.charCodeAt(idx);
        if (code !== 13) hash = Math.imul(hash ^ code, 0x01000193);
      }
    }
    return (hash >>> 0).toString(16).padStart(8, "0");
  }

  #digest(node: AkanGraphNode, text: string | undefined, extent: Extent) {
    const digest = node.digest ? null : this.#hashOf([text, extent]);
    if (digest) node.digest = digest;
  }

  #addEdge(from: string, to: string, kind: AkanGraphEdgeKind, label: string | null, at: AkanGraphLocation | null) {
    if (from === to) return;
    const key = `${from}\n${to}\n${kind}\n${label ?? ""}`;
    const existing = this.#edges.get(key);
    if (existing) existing.count += 1;
    else this.#edges.set(key, { from, to, kind, label, count: 1, at });
  }

  //? A slice's class-level guards read `role Guard` (`{ root: Admin, get: Public }`); a key's are bare names.
  #guard(node: AkanGraphNode, guard: string, file: FileFacts) {
    const [, role = null, local = guard] = guard.match(/^([\w$]+) (.+)$/) ?? [];
    if (!local || local === "?") return;
    const id = local.includes("@") ? this.#madeInPlaceIdOf(local, file) : this.#guardIdOf(local, file);
    if (id) this.#addEdge(node.id, id, "guard", role, node.at);
  }

  #declareGuards(facts: FileFacts[]) {
    const factories = new Map<string, DeclaredFactory[]>();
    const declaredFactories: DeclaredFactory[] = [];
    for (const file of facts)
      for (const fact of file.guardFactories) {
        const factory = {
          fact,
          owner: file.owner,
          site: file,
          made: [],
          isReal: fact.direct,
          scope: fact.scope,
          targets: [],
        };
        factories.set(fact.name, [...(factories.get(fact.name) ?? []), factory]);
        declaredFactories.push(factory);
      }
    for (const factory of declaredFactories)
      factory.targets = factory.fact.via
        .map((callee) => this.#factoryAt(factories, callee, factory.site))
        .filter((target) => target !== undefined);
    for (let isGrowing = true; isGrowing; ) {
      isGrowing = false;
      for (const factory of declaredFactories) {
        const target = factory.targets.find((other) => other.isReal);
        if (factory.isReal || !target) continue;
        factory.isReal = true;
        factory.scope ??= target.scope;
        isGrowing = true;
      }
    }
    const partsOf = (factory: DeclaredFactory, seen = new Set<DeclaredFactory>()): GuardPart[] => {
      if (seen.has(factory)) return [];
      seen.add(factory);
      return [
        { fileName: factory.site.fileName, extent: factory.fact.extent },
        ...factory.targets.filter((target) => target.isReal).flatMap((target) => partsOf(target, seen)),
      ];
    };
    const declare = (file: FileFacts, made: GuardFact | GuardCallFact, scope: string | null, parts: GuardPart[]) => {
      const { name, span, extent, doc } = made;
      const label = file.guardLabels[name];
      const own = { fileName: file.fileName, extent };
      const guard = { name, owner: file.owner, span, scope, doc, parts: [own, ...parts], file: null, label };
      if (name.includes("@")) this.#madeInPlace.set(`${file.fileName}\n${name}`, guard);
      else this.#guards.set(name, [...(this.#guards.get(name) ?? []), guard]);
      return guard;
    };
    const extending: [FileFacts, GuardCallFact][] = [];
    for (const file of facts) {
      for (const made of file.guards) {
        const factory = made.factory
          ? factories.get(made.factory)?.find((other) => other.site.fileName === file.fileName)
          : undefined;
        if (!made.factory) declare(file, made, made.scope, []);
        else if (factory?.isReal) factory.made.push(declare(file, made, factory.scope, partsOf(factory)));
      }
      for (const made of file.guardCalls) {
        if (made.kind === "extends") {
          extending.push([file, made]);
          continue;
        }
        const factory = this.#factoryAt(factories, made.callee, file);
        if (factory?.isReal) factory.made.push(declare(file, made, factory.scope, partsOf(factory)));
      }
    }
    for (let isGrowing = true; isGrowing; ) {
      isGrowing = false;
      for (const [idx, entry] of extending.entries()) {
        const [file, made] = entry;
        const found = this.#findGuard(made.callee, file, 0, true);
        if (!("guard" in found)) continue;
        declare(file, made, made.scope ?? found.guard.scope, found.guard.parts);
        extending.splice(idx, 1);
        isGrowing = true;
        break;
      }
    }
    for (const { fact, made, isReal } of declaredFactories)
      if (isReal && made.every((guard) => !guard.doc)) for (const guard of made) guard.doc = fact.doc;
    for (const list of this.#guards.values())
      for (const guard of list)
        if (list.some((other) => other !== guard && other.owner === guard.owner))
          guard.file = this.#inOwner(guard.span.fileName, guard.owner);
    for (const guard of this.#madeInPlace.values()) guard.file = this.#inOwner(guard.span.fileName, guard.owner);
    for (const list of this.#guards.values()) for (const guard of list) this.#guardNodeOf(guard);
    for (const guard of this.#madeInPlace.values()) this.#guardNodeOf(guard);
  }

  #factoryAt(
    factories: Map<string, DeclaredFactory[]>,
    callee: string,
    site: GuardSite,
    depth = 0,
  ): DeclaredFactory | undefined {
    const [head = callee, member] = callee.split(".");
    const imported = site.imports.find((item) => item.name === head);
    if (!imported)
      return member ? undefined : factories.get(callee)?.find((other) => other.site.fileName === site.fileName);
    if (member && imported.imported !== "*") return undefined;
    const from = this.#ownerOfSpecifier(site.fileName, imported.from);
    if (from === undefined || from === frameworkOwner) return undefined;
    const name = member ?? (imported.imported === "default" || imported.imported === "*" ? head : imported.imported);
    const candidates = factories.get(name) ?? [];
    const near = this.#pathOfSpecifier(site.fileName, imported.from);
    const own = this.#nearest(
      candidates.filter((other) => other.owner === from),
      ({ site }) => site.fileName,
      near,
    );
    if (own) return own;
    const reexport = from && depth < maxMapDepth ? this.#reexportOf(from, name, near) : null;
    if (reexport) return this.#factoryAt(factories, reexport.local, reexport.site, depth + 1);
    return from && near ? this.#throughStar(candidates, from, name, near) : undefined;
  }

  #nearest<Item>(items: Item[], fileOf: (item: Item) => string, near: string | null) {
    const isNear = (fileName: string) => {
      const relative = this.#source.relative(fileName);
      return !!near && (relative.startsWith(`${near}/`) || relative.replace(/\.tsx?$/, "") === near);
    };
    return items.find((item) => isNear(fileOf(item))) ?? items[0];
  }

  #inOwner(fileName: string, owner: string | null) {
    const relative = this.#source.relative(fileName);
    return owner && relative.startsWith(`${owner}/`) ? relative.slice(owner.length + 1) : relative;
  }

  //? Keyed by the declaring owner through its import, not the bare name: two libs' `Admin` stay two nodes.
  #guardIdOf(local: string, site: GuardSite): string | null {
    const found = this.#findGuard(local, site, 0);
    if ("external" in found) return null;
    if ("guard" in found) return this.#guardNodeOf(found.guard);
    const { name, from } = found;
    const isFramework = from === frameworkOwner || (from === undefined && !!builtinGuards[name]);
    const builtin = isFramework ? builtinGuards[name] : undefined;
    const owner = isFramework ? null : (from ?? null);
    const detail = [...(builtin ? [builtin.scope] : []), ...(isFramework ? [frameworkOwner] : [])];
    const node = this.#addNode(this.#key("guard", owner, name), "guard", owner, null, name, null, detail);
    if (builtin) node.doc = builtin.doc;
    return node.id;
  }

  #madeInPlaceIdOf(name: string, file: FileFacts) {
    const made = this.#madeInPlace.get(`${file.fileName}\n${name}`);
    if (made) return this.#guardNodeOf(made);
    const head = name.slice(0, name.indexOf("@")).split(".")[0] ?? name;
    const imported = file.imports.find((item) => item.name === head);
    const from = imported ? this.#ownerOfSpecifier(file.fileName, imported.from) : file.owner;
    if (from === undefined || from === frameworkOwner) return null;
    const scope = `${this.#inOwner(file.fileName, file.owner)}#${name}`;
    const label = guardLabelOf(name, file.guardLabels);
    return this.#addNode(this.#key("guard", file.owner, scope), "guard", file.owner, null, name, null, [], label).id;
  }

  #findGuard(local: string, site: GuardSite, depth: number, isBase = false): GuardLookup {
    const segments = local.split(".");
    const head = segments[0] ?? local;
    const imported = site.imports.find((item) => item.name === head);
    const from = imported ? this.#ownerOfSpecifier(site.fileName, imported.from) : undefined;
    if (imported && from === undefined) return { external: true };
    const near = imported
      ? this.#pathOfSpecifier(site.fileName, imported.from)
      : this.#source.relative(site.fileName).replace(/\.tsx?$/, "");
    const named = imported && imported.imported !== "default" && imported.imported !== "*" ? imported.imported : null;
    const path = imported?.imported === "*" ? segments.slice(1) : [named ?? head, ...segments.slice(1)];
    const holder = imported ? (from ?? null) : site.owner;
    const [objectName, member] = path;
    if (path.length === 2 && objectName && member && holder !== frameworkOwner && depth < maxMapDepth) {
      const made = this.#nearest(
        (this.#guards.get(`${objectName}.${member}`) ?? []).filter((guard) => guard.owner === holder),
        ({ span }) => span.fileName,
        near,
      );
      if (made) return { guard: made };
      for (const entry of this.#mapEntriesOf(objectName, member, imported ? null : site.fileName, holder)) {
        const found = this.#findGuard(entry.name, entry.site, depth + 1, isBase);
        if ("guard" in found) return found;
      }
    }
    const name = path[path.length - 1] ?? head;
    if (from === frameworkOwner) return { name, from };
    const declared = this.#guards.get(name) ?? [];
    const own = this.#nearest(
      declared.filter((other) => other.owner === (imported ? from : site.owner)),
      ({ span }) => span.fileName,
      near,
    );
    if (own) return { guard: own };
    if (!imported) {
      const visible = isBase ? undefined : declared.find((other) => this.#visible(other.owner, site.owner));
      return visible ? { guard: visible } : { name, from };
    }
    const reexport = from && depth < maxMapDepth ? this.#reexportOf(from, name, near) : null;
    if (reexport) return this.#findGuard(reexport.local, reexport.site, depth + 1, isBase);
    const reached = from && near ? this.#throughStar(declared, from, name, near) : undefined;
    return reached ? { guard: reached } : { name, from };
  }

  #reexportOf(owner: string, name: string, near: string | null) {
    const key = `${owner}\n${name}\n${near ?? ""}`;
    const cached = this.#reexports.get(key);
    if (cached !== undefined) return cached;
    let found: { local: string; site: GuardSite } | null = null;
    const exporting = new RegExp(`export\\s*\\{(?:[^}]*?[\\s,])?${name.replace(/\$/g, "\\$")}(?![\\w$])`);
    for (const fileName of this.#filesOf(owner, name, near)) {
      const text = this.#source.readText(fileName);
      if (text === undefined || !exporting.test(text)) continue;
      const reexport = this.#reexportIn(this.#source.parse(fileName, text), name);
      if (!reexport) continue;
      const site = { fileName, owner, imports: [] };
      found = reexport.from
        ? {
            local: reexport.name,
            site: { ...site, imports: [{ ...reexport, imported: reexport.name, from: reexport.from }] },
          }
        : { local: reexport.name, site };
      break;
    }
    this.#reexports.set(key, found);
    return found;
  }

  #reexportIn(source: TS.SourceFile, name: string): Reexport | null {
    const { ts, reader } = this.#source;
    for (const statement of source.statements) {
      if (!ts.isExportDeclaration(statement) || statement.isTypeOnly) continue;
      const { exportClause, moduleSpecifier } = statement;
      if (!exportClause || !ts.isNamedExports(exportClause)) continue;
      const element = exportClause.elements.find((item) => !item.isTypeOnly && item.name.text === name);
      if (!element) continue;
      const original = (element.propertyName ?? element.name).text;
      if (moduleSpecifier && ts.isStringLiteral(moduleSpecifier)) return { name: original, from: moduleSpecifier.text };
      const imported = reader.importsIn(source).find((item) => item.name === original);
      if (!imported) return { name: original, from: null };
      return imported.imported === "default" || imported.imported === "*"
        ? null
        : { name: imported.imported, from: imported.from };
    }
    return null;
  }

  //? The import path is searched first, so `isAdmin` from `@libs/shared/webkit` is not another folder's `isAdmin`.
  #filesOf(owner: string, name: string, near: string | null) {
    const isNear = (fileName: string) => {
      const relative = this.#source.relative(fileName);
      return !!near && (relative.startsWith(`${near}/`) || relative.replace(/\.tsx?$/, "") === near);
    };
    const candidates = this.#filesIn(owner)
      .filter(([, words]) => words.includes(`\n${name}\n`))
      .map(([fileName]) => fileName);
    return [...candidates.filter(isNear), ...candidates.filter((other) => !isNear(other))];
  }

  #mapEntriesOf(objectName: string, member: string, fileName: string | null, owner: string | null) {
    const key = `${objectName}\n${member}\n${fileName ?? ""}\n${owner ?? ""}`;
    const cached = this.#mapEntries.get(key);
    if (cached) return cached;
    const { ts, reader } = this.#source;
    const entries: MapEntry[] = [];
    const fileNames = [
      ...(fileName ? [fileName] : []),
      ...(owner === null ? [] : this.#filesIn(owner))
        .filter(
          ([other, words]) =>
            other !== fileName && words.includes(`\n${objectName}\n`) && words.includes(`\n${member}\n`),
        )
        .map(([other]) => other),
    ];
    for (const holder of fileNames) {
      const text = this.#source.readText(holder);
      if (text === undefined) continue;
      const source = this.#source.parse(holder, text);
      const site = { fileName: holder, owner: this.#source.ownerOf(holder), imports: reader.importsIn(source) };
      for (const statement of source.statements) {
        if (!ts.isVariableStatement(statement)) continue;
        const map = statement.declarationList.declarations.find(
          (declaration) => ts.isIdentifier(declaration.name) && declaration.name.text === objectName,
        )?.initializer;
        const object = map && reader.unwrap(map);
        if (!object || !ts.isObjectLiteralExpression(object)) continue;
        for (const property of object.properties) {
          if (ts.isShorthandPropertyAssignment(property) && property.name.text === member)
            entries.push({ name: member, site });
          if (
            !ts.isPropertyAssignment(property) ||
            !(ts.isIdentifier(property.name) || ts.isStringLiteral(property.name)) ||
            property.name.text !== member
          )
            continue;
          const value = reader.unwrap(property.initializer);
          if (ts.isIdentifier(value)) entries.push({ name: value.text, site });
          else if (ts.isPropertyAccessExpression(value) && ts.isIdentifier(value.expression))
            entries.push({ name: `${value.expression.text}.${value.name.text}`, site });
        }
      }
    }
    this.#mapEntries.set(key, entries);
    return entries;
  }

  //? Every page names `usePage`, which the generated client hands out undeclared, so a text prefilter skips the parse.
  #declarationOf(owner: string, name: string, near: string | null, depth = 0): Declaration | null {
    const key = `${owner}\n${name}\n${near ?? ""}`;
    const cached = this.#declarations.get(key);
    if (cached !== undefined) return cached;
    this.#declarations.set(key, null);
    const declaring = declaringPatternOf(name, false);
    let found: Declaration | null = null;
    for (const fileName of this.#filesOf(owner, name, near)) {
      const text = this.#source.readText(fileName);
      if (text === undefined || !declaring.test(text)) continue;
      const source = this.#source.parse(fileName, text);
      const declared = this.#routes.declarationIn(source, name);
      if (declared) {
        found = { source, ...declared, name };
        break;
      }
      const reexport = this.#reexportIn(source, name);
      if (!reexport) continue;
      if (!reexport.from) {
        const local = this.#routes.declarationIn(source, reexport.name);
        found = local ? { source, ...local, name: reexport.name } : null;
        break;
      }
      const next = this.#ownerOfSpecifier(fileName, reexport.from);
      if (next && next !== frameworkOwner && depth < maxMapDepth)
        found = this.#declarationOf(next, reexport.name, this.#pathOfSpecifier(fileName, reexport.from), depth + 1);
      break;
    }
    this.#declarations.set(key, found);
    return found;
  }

  #addRoutes() {
    const routes: { fact: RouteFact; node: AkanGraphNode }[] = [];
    const layouts = new Map<string, AkanGraphNode>();
    for (const [fileName, words] of this.#source.files) {
      const relative = this.#source.relative(fileName);
      const info = RouteFactReader.fileOf(relative);
      const text = info ? this.#source.readText(fileName) : undefined;
      const fact = info && text !== undefined ? this.#routes.read(fileName, info, text, words) : null;
      if (!fact || text === undefined) continue;
      const span = {
        fileName,
        start: 0,
        end: 0,
        line: fact.line,
        character: fact.character,
        endLine: 0,
        endCharacter: 0,
      };
      const dir = `/${fact.dir.join("/")}`;
      const guard = fact.guard ? ["guard"] : [];
      const node =
        fact.kind === "layout"
          ? this.#addNode(
              this.#key("layout", fact.owner, dir),
              "layout",
              fact.owner,
              null,
              dir,
              span,
              [...(fact.isRoot ? ["root"] : []), ...guard],
              `${dir === "/" ? "" : dir}/_layout`,
            )
          : this.#addNode(
              this.#key("route", fact.owner, fact.pattern),
              "route",
              fact.owner,
              null,
              fact.pattern,
              span,
              guard,
            );
      this.#digest(node, text, { start: 0, end: text.length });
      this.#routeFiles.set(relative, { id: node.id, alias: fact.alias });
      if (fact.kind === "layout") layouts.set(`${fact.owner}\n${dir}`, node);
      routes.push({ fact, node });
      for (const call of fact.guard?.calls ?? []) {
        const id = this.#routeGuardIdOf(call, fact, text);
        if (id && fact.guard) this.#addEdge(node.id, id, "guard", null, this.#location(fact.guard.span));
      }
    }
    const parentOf = ({ owner, dir, kind }: RouteFact) => {
      for (let depth = kind === "layout" ? dir.length - 1 : dir.length; depth >= 0; depth--) {
        const layout = layouts.get(`${owner}\n/${dir.slice(0, depth).join("/")}`);
        if (layout) return layout;
      }
      return null;
    };
    for (const { fact, node } of routes) {
      const parent = parentOf(fact);
      if (parent) this.#addEdge(parent.id, node.id, "wraps", null, node.at);
    }
  }

  //? A guard function is keyed by the file that declares it, so two pages' own `isOwn` stay two nodes.
  #routeGuardIdOf({ name: local, local: declared }: RouteGuardCall, fact: RouteFact, text: string) {
    if (declared) {
      const id = this.#key("guard", fact.owner, `${this.#inOwner(fact.fileName, fact.owner)}#${local}`);
      return this.#routeGuardNodeOf(id, fact.owner, local, declared.span, declared.doc, text, declared.extent);
    }
    const [head = local, member] = local.split(".");
    const imported = fact.imports.find((item) => item.name === head);
    if (!imported || (member && imported.imported !== "*")) return null;
    const name = member ?? (imported.imported !== "default" && imported.imported !== "*" ? imported.imported : local);
    const from = this.#ownerOfSpecifier(fact.fileName, imported.from);
    if (!from || from === frameworkOwner) return null;
    const found = this.#declarationOf(from, name, this.#pathOfSpecifier(fact.fileName, imported.from));
    if (!found) return null;
    const { reader } = this.#source;
    const owner = this.#source.ownerOf(found.source.fileName) ?? from;
    return this.#routeGuardNodeOf(
      this.#key("guard", owner, `${this.#inOwner(found.source.fileName, owner)}#${found.name}`),
      owner,
      found.name,
      reader.spanOf(found.source, found.declared),
      reader.docOf(found.source, found.statement),
      found.source.text,
      found.extent,
    );
  }

  #routeGuardNodeOf(
    id: string,
    owner: string,
    name: string,
    span: AkanSpan,
    doc: string | null,
    text: string,
    extent: Extent,
  ) {
    const isNew = !this.#nodes.has(id);
    const node = this.#addNode(id, "guard", owner, null, name, span, ["route"]);
    if (isNew && doc) node.doc = doc;
    this.#digest(node, text, extent);
    return node.id;
  }

  #adaptorIdOf(local: string, file: GuardSite) {
    const [head, member] = local.split(".");
    const imported = file.imports.find((item) => item.name === head);
    const name =
      member ?? (imported && imported.imported !== "default" && imported.imported !== "*" ? imported.imported : head);
    const path = imported ? this.#pathOfSpecifier(file.fileName, imported.from) : null;
    if (imported && path === null && !frameworkPattern.test(imported.from))
      return this.#packageAdaptorOf(name, imported.from);
    const from = imported ? this.#ownerOfSpecifier(file.fileName, imported.from) : undefined;
    const declared = this.#adaptors.get(name) ?? [];
    const found =
      from === undefined
        ? (this.#adaptorIn(declared, file.owner, path, file.fileName) ??
          declared.find((adaptor) => this.#visible(adaptor.owner, file.owner)))
        : (this.#adaptorIn(declared, from, path, file.fileName) ??
          (from === frameworkOwner ? undefined : declared.find((adaptor) => this.#visible(adaptor.owner, from))));
    if (found) return found.id;
    const reexported = from && from !== frameworkOwner ? this.#packageShimOf(from, name, path) : null;
    if (reexported) return this.#packageAdaptorOf(reexported.name, reexported.from);
    const owner = from === frameworkOwner ? null : imported ? (from ?? null) : file.owner;
    const detail = from === frameworkOwner ? [frameworkOwner] : [];
    return this.#addNode(this.#key("adaptor", owner, name), "adaptor", owner, null, name, null, detail).id;
  }

  #adaptorIn(declared: DeclaredAdaptor[], owner: string | null, path: string | null, fileName: string) {
    const own = declared.filter((adaptor) => adaptor.owner === owner);
    if (own.length < 2) return own.at(0);
    const pathOf = (adaptor: DeclaredAdaptor) => this.#source.relative(adaptor.fileName).replace(/\.tsx?$/, "");
    const named =
      path === null
        ? own.find((adaptor) => adaptor.fileName === fileName)
        : (own.find((adaptor) => pathOf(adaptor) === path || pathOf(adaptor) === `${path}/index`) ??
          own.find((adaptor) => pathOf(adaptor).startsWith(`${path}/`)));
    return named ?? own.at(0);
  }

  #ownPathOf({ owner, fileName }: { owner: string | null; fileName: string }) {
    const relative = this.#source.relative(fileName);
    return owner ? relative.slice(owner.length + 1) : relative;
  }

  //? An app service spreads its module's lib services (`...user.services`), so it holds the fields they plug.
  #pluggedOf({ owner, module }: Context, field: string) {
    const plugs = this.#plugs.get(`${module}\n${field}`) ?? [];
    const own = plugs.filter((plug) => plug.owner === owner);
    if (!own.length && this.#serviceFields.has(`${owner ?? ""}\n${module}\n${field}`)) return [];
    const inherited = own.length ? own : plugs.filter((plug) => this.#visible(plug.owner, owner));
    return [...new Set(inherited.map(({ target }) => target))];
  }

  #packageAdaptorOf(name: string, specifier: string) {
    if (frameworkPattern.test(specifier))
      return this.#addNode(this.#key("adaptor", null, name), "adaptor", null, null, name, null, [frameworkOwner]).id;
    const pkg = specifier
      .split("/")
      .slice(0, specifier.startsWith("@") ? 2 : 1)
      .join("/");
    return this.#addNode(this.#key("adaptor", pkg, name), "adaptor", null, null, name, null, [pkg]).id;
  }

  //? A lib reaches a third-party class only through a re-export, so the class is the package's, not the lib's.
  #packageShimOf(owner: string, name: string, near: string | null) {
    const reexport = this.#reexportOf(owner, name, near);
    const [shim] = reexport?.site.imports ?? [];
    if (reexport && shim && this.#pathOfSpecifier(reexport.site.fileName, shim.from) === null)
      return { name: reexport.local === "default" ? name : reexport.local, from: shim.from };
    if (reexport || !near) return null;
    const packages = new Set<string>();
    for (const [fileName, words] of this.#filesIn(owner)) {
      const relative = this.#source.relative(fileName);
      const isNear = relative.startsWith(`${near}/`) || relative.replace(/\.tsx?$/, "") === near;
      if (!isNear || !words.includes("\nexport\n")) continue;
      for (const [, specifier = ""] of this.#source.readText(fileName)?.matchAll(starExportPattern) ?? [])
        if (this.#pathOfSpecifier(fileName, specifier) === null) packages.add(specifier);
    }
    const [only] = packages;
    return packages.size === 1 && only && !this.#declares(owner, name) ? { name, from: only } : null;
  }

  #adaptorNodeOf({ fact, owner, fileName, id }: DeclaredAdaptor) {
    const detail = fact.refName ? [fact.refName] : [];
    const node = this.#addNode(id, "adaptor", owner, null, fact.name, fact.span, detail);
    if (fact.doc && !node.doc) node.doc = fact.doc;
    this.#digest(node, this.#source.readText(fileName), fact.extent);
    return node.id;
  }

  #guardNodeOf({ name, owner, span, scope, doc, parts, file, label }: DeclaredGuard) {
    const id = this.#key("guard", owner, file ? `${file}#${name}` : name);
    const node = this.#addNode(id, "guard", owner, null, name, span, scope ? [scope] : [], label ?? name);
    if (doc && !node.doc) node.doc = doc;
    if (node.digest) return node.id;
    const digest = this.#hashOf(
      ...parts.map(({ fileName, extent }): [string | undefined, Extent] => [this.#source.readText(fileName), extent]),
    );
    if (!digest) return node.id;
    node.digest = digest;
    const sources = [...new Set(parts.map(({ fileName }) => this.#source.relative(fileName)))].filter(
      (source) => source !== node.at?.file,
    );
    if (sources.length) node.sources = sources;
    return node.id;
  }

  #ownerOfSpecifier(fileName: string, specifier: string) {
    if (frameworkPattern.test(specifier)) return frameworkOwner;
    const path = this.#pathOfSpecifier(fileName, specifier);
    return path === null ? undefined : (ownerOf(path) ?? undefined);
  }

  #pathOfSpecifier(fileName: string, specifier: string) {
    const alias = specifier.match(aliasPattern);
    if (alias) return `${alias[1]}/${alias[2]}${specifier.slice(alias[0].length)}`;
    if (!specifier.startsWith(".")) return null;
    const segments = this.#source.relative(fileName).split("/").slice(0, -1);
    for (const segment of specifier.split("/"))
      if (segment === "..") segments.pop();
      else if (segment !== ".") segments.push(segment);
    return segments.join("/");
  }

  //? `lib/_<service>/` holds the `<service>` module, as its methods and actions already read; `__scalar` stays whole.
  #moduleDirOf(fileName: string) {
    const dir = this.#source.relative(fileName).match(moduleDirPattern)?.[1] ?? null;
    return dir?.startsWith("_") && !dir.startsWith("__") ? dir.slice(1) : dir;
  }

  #fieldsOf(constant: ConstantClassFact, scope: ConstantClassFact[]): AkanGraphField[] {
    const fields = new Map<string, AkanGraphField>();
    const seen = new Set<ConstantClassFact>();
    const visit = (current: ConstantClassFact) => {
      if (seen.has(current)) return;
      seen.add(current);
      for (const parent of current.parents) {
        const parentClass =
          scope.find((other) => other.name === parent && other.span.fileName === current.span.fileName) ??
          scope.find((other) => other.name === parent);
        if (parentClass) visit(parentClass);
      }
      for (const field of current.fields) {
        if (fields.has(field.name)) continue;
        const digest = this.#hashOf([this.#source.readText(field.span.fileName), field.extent]);
        fields.set(field.name, {
          name: field.name,
          type: field.type,
          array: field.array,
          optional: field.optional,
          ref: null,
          declaredIn: current.name,
          at: this.#location(field.span),
          ...(digest ? { digest } : {}),
        });
      }
    };
    visit(constant);
    return [...fields.values()];
  }

  #visible(target: string | null, from: string | null) {
    return !from || !target || target === from || target.startsWith("libs/");
  }

  //? `export *` is the one re-export not followed by name, and one from a package may bring the name itself.
  #throughStar<Declared extends { owner: string | null }>(
    declared: Declared[],
    owner: string,
    name: string,
    near: string,
  ) {
    if (!declared.length) return undefined;
    const { owners, isOpaque } = this.#starExportsOf(owner, near);
    const reached = declared.filter((other) => other.owner !== null && owners.includes(other.owner));
    return reached.length === 1 && !isOpaque && !this.#declares(owner, name) ? reached[0] : undefined;
  }

  #filesIn(owner: string) {
    if (!this.#ownerFiles) {
      this.#ownerFiles = new Map();
      for (const entry of this.#source.files) {
        const fileOwner = testFilePattern.test(entry[0]) ? null : this.#source.ownerOf(entry[0]);
        const files = fileOwner === null ? null : this.#ownerFiles.get(fileOwner);
        if (files) files.push(entry);
        else if (fileOwner !== null) this.#ownerFiles.set(fileOwner, [entry]);
      }
    }
    return this.#ownerFiles.get(owner) ?? [];
  }

  #starExportsOf(owner: string, near: string) {
    const cached = this.#starExports.get(near);
    if (cached) return cached;
    const found = { owners: [] as string[], isOpaque: false };
    this.#starExports.set(near, found);
    const paths = [near];
    for (let idx = 0; idx < paths.length && !found.isOpaque; idx++)
      for (const fileName of this.#modulesAt(paths[idx] ?? "")) {
        for (const [, specifier = ""] of this.#source.readText(fileName)?.matchAll(starExportPattern) ?? []) {
          const target = this.#ownerOfSpecifier(fileName, specifier);
          const path = this.#pathOfSpecifier(fileName, specifier);
          if (target === undefined || target === frameworkOwner || path === null) found.isOpaque = true;
          else if (!paths.includes(path)) paths.push(path);
          if (target && target !== frameworkOwner && target !== owner && !found.owners.includes(target))
            found.owners.push(target);
        }
      }
    return found;
  }

  #modulesAt(path: string) {
    if (!this.#modules) {
      this.#modules = new Map();
      for (const [fileName] of this.#source.files) {
        const module = this.#source.relative(fileName).replace(/\.tsx?$/, "");
        for (const key of module.endsWith("/index") ? [module, module.slice(0, -6)] : [module])
          this.#modules.set(key, [...(this.#modules.get(key) ?? []), fileName]);
      }
    }
    return this.#modules.get(path) ?? [];
  }

  #declares(owner: string, name: string) {
    const declaring = declaringPatternOf(name, true);
    return this.#filesOf(owner, name, null).some((fileName) => declaring.test(this.#source.readText(fileName) ?? ""));
  }

  #targetNodeOf({ family, owner, refName, sourceKey }: AkanTarget) {
    const isDefault = /^[A-Z]/.test(sourceKey);
    const id =
      family === "slice" || family === "query"
        ? this.#key(family, owner, refName, isDefault ? "" : sourceKey)
        : family === "model" || family === "formSetter"
          ? this.#key("model", owner, refName)
          : family === "endpoint"
            ? this.#key("endpoint", owner, refName, sourceKey)
            : null;
    return id && this.#nodes.has(id) ? id : null;
  }

  #membersNamed(kind: MemberKind, name: string, owner: string | null, refName?: string | null) {
    const nodes = (this.#members.get(`${kind}:${name}`) ?? []).filter(
      (node) => (!refName || node.module === refName) && this.#visible(node.owner, owner),
    );
    const own = nodes.filter((node) => node.owner === owner);
    return (own.length ? own : nodes).map((node) => node.id);
  }

  #plainTargetsOf(chain: string[] | null, name: string, context: Context, owner: string | null) {
    const [head, second] = chain ?? [];
    if (chain?.length === 1 && head === "fetch") return this.#membersNamed("endpoint", name, owner);
    if (chain?.length === 2 && head === "st" && second === "do") return this.#membersNamed("action", name, owner);
    if (chain?.length === 1 && head === "this" && (context.kind === "method" || context.kind === "action"))
      return this.#membersNamed(context.kind, name, context.owner, context.module).filter((id) =>
        id.startsWith(`${context.kind}:${context.owner ?? ""}:`),
      );
    if (chain?.length === 2 && head === "this" && second && /.Service$/.test(second))
      return this.#membersNamed("method", name, owner, second.slice(0, -"Service".length));
    return [];
  }

  #walk(fileName: string, words: string) {
    const relative = this.#source.relative(fileName);
    const contexts = this.#contexts.get(fileName);
    const isComponentFile =
      !memberSourcePattern.test(fileName) &&
      !skippedPattern.test(relative) &&
      (words.includes("\nfetch\n") || words.includes("\nst\n"));
    if (!contexts && !isComponentFile) return;
    const text = this.#source.readText(fileName);
    if (text === undefined) return;
    const { ts } = this.#source;
    const owner = this.#source.ownerOf(fileName);
    const source = this.#source.parse(fileName, text);
    const visit = (node: TS.Node) => {
      if (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.name)) {
        const start = node.name.getStart(source);
        const chain = this.#chainOf(node.expression);
        const context = contexts
          ? contexts.find(({ extent }) => extent.start <= start && start < extent.end)
          : chain && clientRoots.has(chain[0])
            ? this.#componentOf(source, node)
            : undefined;
        if (context) this.#link(fileName, source, node.name, chain, context, owner);
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }

  #link(
    fileName: string,
    source: TS.SourceFile,
    identifier: TS.Identifier,
    chain: string[] | null,
    context: Context,
    owner: string | null,
  ) {
    const plugged =
      chain?.length === 2 && chain[0] === "this" && context.kind === "method" && this.#isServiceThis(identifier)
        ? this.#pluggedOf(context, chain[1])
        : [];
    const resolved = plugged.length
      ? plugged
      : this.#source
          .resolve(fileName, identifier)
          .map((target) => this.#targetNodeOf(target))
          .filter((id) => id !== null);
    const targets = resolved.length ? resolved : this.#plainTargetsOf(chain, identifier.text, context, owner);
    if (!targets.length) return;
    if (context.pending && !this.#nodes.has(context.id)) {
      this.#nodes.set(context.id, context.pending);
      this.#digest(context.pending, source.text, context.extent);
    }
    //? An app module that shares a lib module's name extends it, so the app's own node stands for the merged module.
    const own = targets.filter((id) => this.#nodes.get(id)?.owner === owner);
    const kind: AkanGraphEdgeKind =
      context.kind === "component" ? "uses" : chain?.[0] === "fetch" ? "fetches" : "calls";
    const position = source.getLineAndCharacterOfPosition(identifier.getStart(source));
    const at = { file: this.#source.relative(fileName), line: position.line + 1, column: position.character + 1 };
    for (const target of new Set(own.length ? own : targets))
      this.#addEdge(context.id, target, kind, identifier.text, at);
  }

  //? `this` inside a function expression or a nested class is another object, not the service that plugs the field.
  #isServiceThis(identifier: TS.Node) {
    const { ts } = this.#source;
    for (let current = identifier.parent; !ts.isSourceFile(current); current = current.parent) {
      if (ts.isMethodDeclaration(current) || ts.isAccessor(current) || ts.isConstructorDeclaration(current))
        return ts.isClassDeclaration(current.parent) && ts.isSourceFile(current.parent.parent);
      if (ts.isFunctionExpression(current) || ts.isFunctionDeclaration(current) || ts.isClassLike(current))
        return false;
    }
    return false;
  }

  #chainOf(expression: TS.Expression): string[] | null {
    const { ts } = this.#source;
    if (ts.isNonNullExpression(expression) || ts.isParenthesizedExpression(expression))
      return this.#chainOf(expression.expression);
    if (ts.isIdentifier(expression)) return [expression.text];
    if (expression.kind === ts.SyntaxKind.ThisKeyword) return ["this"];
    if (!ts.isPropertyAccessExpression(expression)) return null;
    const head = this.#chainOf(expression.expression);
    return head ? [...head, expression.name.text] : null;
  }

  #componentOf(source: TS.SourceFile, node: TS.Node): Context {
    const { ts } = this.#source;
    let top: TS.Node = node;
    while (top.parent && !ts.isSourceFile(top.parent)) top = top.parent;
    const declared = ts.isVariableStatement(top)
      ? top.declarationList.declarations[0]?.name
      : ts.isFunctionDeclaration(top) || ts.isClassDeclaration(top)
        ? top.name
        : undefined;
    const isDefaultExport =
      ts.canHaveModifiers(top) && !!ts.getModifiers(top)?.some(({ kind }) => kind === ts.SyntaxKind.DefaultKeyword);
    const name = declared && ts.isIdentifier(declared) && !isDefaultExport ? declared.text : "default";
    const relative = this.#source.relative(source.fileName);
    const owner = this.#source.ownerOf(source.fileName);
    const extent = { start: top.getStart(source), end: top.getEnd() };
    const routeFile = this.#routeFiles.get(relative);
    const routeId = routeFile && (name === "default" || name === routeFile.alias) ? routeFile.id : undefined;
    if (routeId) return { id: routeId, kind: "component", owner, module: null, extent };
    const id = `component:${relative}#${name}`;
    const context: Context = { id, kind: "component", owner, module: null, extent };
    if (this.#nodes.has(id)) return context;
    const pagePrefix = owner ? `${owner}/page/` : null;
    const route =
      pagePrefix && relative.startsWith(pagePrefix) ? relative.slice(pagePrefix.length).replace(/\.tsx?$/, "") : null;
    const base = relative.slice(relative.lastIndexOf("/") + 1).replace(/\.tsx?$/, "");
    const label = route
      ? `${route}${name === "default" ? "" : `#${name}`}`
      : name === "default"
        ? base
        : `${base}.${name}`;
    const position = source.getLineAndCharacterOfPosition((declared ?? top).getStart(source));
    context.pending = {
      id,
      kind: "component",
      name,
      label,
      owner,
      module: this.#moduleDirOf(source.fileName),
      detail: route ? ["page"] : [],
      at: { file: relative, line: position.line + 1, column: position.character + 1 },
    };
    return context;
  }
}
