import type {
  AkanGraph,
  AkanGraphEdge,
  AkanGraphEdgeKind,
  AkanGraphField,
  AkanGraphLocation,
  AkanGraphNode,
  AkanGraphNodeKind,
} from "akanjs/common";
import type * as TS from "typescript";
import { AdaptorResolver } from "./adaptorResolver";
import type { Ts } from "./ast";
import { guardLabelOf } from "./guardFacts";
import { type DeclaredGuard, frameworkOwner, GuardResolver, type GuardSite } from "./guardResolver";
import type { AkanFactReader, AkanSpan, ConstantClassFact, Extent, FileFacts, MemberFact } from "./moduleFacts";
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
export class GraphBuilder {
  readonly #source: AkanGraphSource;
  readonly #nodes = new Map<string, AkanGraphNode>();
  readonly #edges = new Map<string, AkanGraphEdge>();
  readonly #contexts = new Map<string, Context[]>();
  readonly #members = new Map<string, AkanGraphNode[]>();
  readonly #routeFiles = new Map<string, { id: string; alias: string | null }>();
  readonly #routes: RouteFactReader;
  readonly #resolver: GuardResolver;
  readonly #adaptors: AdaptorResolver;

  constructor(source: AkanGraphSource) {
    this.#source = source;
    this.#routes = new RouteFactReader(source.ts, source.reader, source.parse);
    this.#resolver = new GuardResolver(source, this.#routes);
    this.#adaptors = new AdaptorResolver(source, this.#resolver, {
      key: (kind, owner, scope) => this.#key(kind, owner, scope),
      addNode: (id, kind, owner, name, span, detail) => this.#addNode(id, kind, owner, null, name, span, detail),
      addEdge: (from, to, kind, label, at) => this.#addEdge(from, to, kind, label, at),
      digest: (node, text, extent) => this.#digest(node, text, extent),
      location: (span) => this.#location(span),
    });
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

    this.#adaptors.declare(facts);
    for (const guard of this.#resolver.declare(facts)) this.#guardNodeOf(guard);

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
        this.#adaptors.addService(refName, service, file);
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
      this.#addGuarded(file);
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
          this.#resolver.visible(type.owner, node.owner),
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

  #addGuarded(file: FileFacts) {
    const { owner } = file;
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
        const node = this.#addMember("endpoint", owner, refName, key, `${refName}.${key.name}`, file.fileName, detail);
        for (const guard of key.guards) this.#guard(node, guard, file);
      }
    }
  }

  //? A slice's class-level guards read `role Guard` (`{ root: Admin, get: Public }`); a key's are bare names.
  #guard(node: AkanGraphNode, guard: string, file: FileFacts) {
    const [, role = null, local = guard] = guard.match(/^([\w$]+) (.+)$/) ?? [];
    if (!local || local === "?") return;
    const id = local.includes("@") ? this.#madeInPlaceIdOf(local, file) : this.#guardIdOf(local, file);
    if (id) this.#addEdge(node.id, id, "guard", role, node.at);
  }

  //? Keyed by the declaring owner through its import, not the bare name: two libs' `Admin` stay two nodes.
  #guardIdOf(local: string, site: GuardSite): string | null {
    const found = this.#resolver.find(local, site);
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
    const made = this.#resolver.madeInPlace(file.fileName, name);
    if (made) return this.#guardNodeOf(made);
    const head = name.slice(name.indexOf(":") + 1, name.indexOf("@")).split(".")[0] ?? name;
    const imported = file.imports.find((item) => item.name === head);
    const from = imported ? this.#resolver.ownerOfSpecifier(file.fileName, imported.from) : file.owner;
    if (from === undefined || from === frameworkOwner) return null;
    const scope = `${this.#resolver.inOwner(file.fileName, file.owner)}#${name}`;
    const label = guardLabelOf(name, file.guardLabels);
    return this.#addNode(this.#key("guard", file.owner, scope), "guard", file.owner, null, name, null, [], label).id;
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
      const id = this.#key("guard", fact.owner, `${this.#resolver.inOwner(fact.fileName, fact.owner)}#${local}`);
      return this.#routeGuardNodeOf(id, fact.owner, local, declared.span, declared.doc, text, declared.extent);
    }
    const [head = local, member] = local.split(".");
    const imported = fact.imports.find((item) => item.name === head);
    if (!imported || (member && imported.imported !== "*")) return null;
    const name = member ?? (imported.imported !== "default" && imported.imported !== "*" ? imported.imported : local);
    const from = this.#resolver.ownerOfSpecifier(fact.fileName, imported.from);
    if (!from || from === frameworkOwner) return null;
    const found = this.#resolver.declarationOf(
      from,
      name,
      this.#resolver.pathOfSpecifier(fact.fileName, imported.from),
    );
    if (!found) return null;
    const { reader } = this.#source;
    const owner = this.#source.ownerOf(found.source.fileName) ?? from;
    return this.#routeGuardNodeOf(
      this.#key("guard", owner, `${this.#resolver.inOwner(found.source.fileName, owner)}#${found.name}`),
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
      (node) => (!refName || node.module === refName) && this.#resolver.visible(node.owner, owner),
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
        ? this.#adaptors.pluggedOf(context.owner, context.module, chain[1])
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
