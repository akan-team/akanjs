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
  type AkanFactReader,
  type AkanSpan,
  type ConstantClassFact,
  type Extent,
  type FileFacts,
  type GuardFactoryFact,
  type MemberFact,
  ownerOf,
  testFilePattern,
} from "./moduleFacts";
import type { AkanTarget } from "./nameTable";

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

type MemberKind = "method" | "slice" | "endpoint" | "action";

type GuardSite = Pick<FileFacts, "fileName" | "owner" | "imports">;

interface GuardPart {
  fileName: string;
  extent: Extent;
}

interface DeclaredGuard {
  name: string;
  owner: string | null;
  span: AkanSpan;
  scope: string | null;
  doc: string | null;
  parts: GuardPart[];
}

interface DeclaredFactory {
  fact: GuardFactoryFact;
  owner: string | null;
  fileName: string;
  made: DeclaredGuard[];
}

interface MapEntry {
  name: string;
  site: GuardSite;
}

type GuardLookup = { guard: DeclaredGuard } | { name: string; from: string | undefined };

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

export class GraphBuilder {
  readonly #source: AkanGraphSource;
  readonly #nodes = new Map<string, AkanGraphNode>();
  readonly #edges = new Map<string, AkanGraphEdge>();
  readonly #contexts = new Map<string, Context[]>();
  readonly #members = new Map<string, AkanGraphNode[]>();
  readonly #guards = new Map<string, DeclaredGuard[]>();
  readonly #mapEntries = new Map<string, MapEntry[]>();

  constructor(source: AkanGraphSource) {
    this.#source = source;
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
          slice.guards,
        );
        for (const guard of slice.guards) this.#guard(fallback, guard, file);
        for (const key of slice.keys) {
          const detail = [...key.guards, ...(key.live ? ["live"] : [])];
          const node = this.#addMember("slice", owner, refName, key, `${refName}.${key.name}`, file.fileName, detail);
          for (const guard of key.guards) this.#guard(node, guard, file);
        }
      }
      for (const endpoint of file.endpoints) {
        const refName = endpoint.model;
        if (!refName) continue;
        for (const key of endpoint.keys) {
          const detail = [...(key.verb ? [key.verb] : []), ...key.guards];
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
    const [role, local] = guard.includes(" ") ? guard.split(" ") : [null, guard];
    if (!local || local === "?") return;
    this.#addEdge(node.id, this.#guardIdOf(local, file), "guard", role, node.at);
  }

  #declareGuards(facts: FileFacts[]) {
    const factories = new Map<string, DeclaredFactory[]>();
    for (const file of facts)
      for (const fact of file.guardFactories) {
        const factory = { fact, owner: file.owner, fileName: file.fileName, made: [] };
        factories.set(fact.name, [...(factories.get(fact.name) ?? []), factory]);
      }
    const sameFile = (factory: DeclaredFactory, name: string | null) =>
      name ? factories.get(name)?.find((other) => other.fileName === factory.fileName) : undefined;
    const declare = (guard: DeclaredGuard, factory: DeclaredFactory | undefined) => {
      this.#guards.set(guard.name, [...(this.#guards.get(guard.name) ?? []), guard]);
      factory?.made.push(guard);
    };
    const madeBy = (factory: DeclaredFactory | undefined, fileName: string, extent: Extent) => {
      const parts: GuardPart[] = [{ fileName, extent }];
      const seen = new Set<DeclaredFactory>();
      for (let current = factory; current && !seen.has(current); current = sameFile(current, current.fact.via)) {
        seen.add(current);
        parts.push({ fileName: current.fileName, extent: current.fact.extent });
      }
      return parts;
    };
    for (const file of facts) {
      const { owner, fileName } = file;
      for (const { name, span, extent, scope, doc, factory: callee } of file.guards) {
        const factory = callee ? factories.get(callee)?.find((other) => other.fileName === fileName) : undefined;
        declare({ name, owner, span, scope, doc, parts: madeBy(factory, fileName, extent) }, factory);
      }
      for (const { name, span, extent, doc, callee } of file.guardCalls) {
        const imported = file.imports.find((item) => item.name === callee);
        if (!imported) continue;
        const from = this.#ownerOfSpecifier(fileName, imported.from);
        const candidates =
          factories.get(imported.imported === "default" || imported.imported === "*" ? callee : imported.imported) ??
          [];
        const factory =
          candidates.find((other) => other.owner === from) ?? this.#soleVisible(candidates, from ?? owner);
        if (factory)
          declare(
            { name, owner, span, scope: factory.fact.scope, doc, parts: madeBy(factory, fileName, extent) },
            factory,
          );
      }
    }
    for (const list of factories.values())
      for (const { fact, made } of list)
        if (made.every((guard) => !guard.doc)) for (const guard of made) guard.doc = fact.doc;
    for (const list of this.#guards.values()) for (const guard of list) this.#guardNodeOf(guard);
  }

  //? Keyed by the declaring owner through its import, not the bare name: two libs' `Admin` stay two nodes.
  #guardIdOf(local: string, site: GuardSite): string {
    const found = this.#findGuard(local, site, 0);
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

  #findGuard(local: string, site: GuardSite, depth: number): GuardLookup {
    const [head = local, member] = local.split(".");
    const imported = site.imports.find((item) => item.name === head);
    const from = imported ? this.#ownerOfSpecifier(site.fileName, imported.from) : undefined;
    const holder = imported ? from : site.owner;
    if (
      member &&
      imported?.imported !== "*" &&
      holder !== undefined &&
      holder !== frameworkOwner &&
      depth < maxMapDepth
    ) {
      const objectName = imported && imported.imported !== "default" ? imported.imported : head;
      for (const entry of this.#mapEntriesOf(objectName, member, imported ? null : site.fileName, holder)) {
        const found = this.#findGuard(entry.name, entry.site, depth + 1);
        if ("guard" in found) return found;
      }
    }
    const name =
      member ?? (imported && imported.imported !== "default" && imported.imported !== "*" ? imported.imported : head);
    const declared = this.#guards.get(name) ?? [];
    const guard =
      from === undefined
        ? (declared.find((other) => other.owner === site.owner) ??
          declared.find((other) => this.#visible(other.owner, site.owner)))
        : (declared.find((other) => other.owner === from) ??
          (from === frameworkOwner ? undefined : this.#soleVisible(declared, from)));
    return guard ? { guard } : { name, from };
  }

  #mapEntriesOf(objectName: string, member: string, fileName: string | null, owner: string | null) {
    const key = `${objectName}\n${member}\n${fileName ?? ""}\n${owner ?? ""}`;
    const cached = this.#mapEntries.get(key);
    if (cached) return cached;
    const { ts, reader } = this.#source;
    const entries: MapEntry[] = [];
    const fileNames = [
      ...(fileName ? [fileName] : []),
      ...this.#source.files
        .filter(
          ([other, words]) =>
            other !== fileName &&
            owner !== null &&
            !testFilePattern.test(other) &&
            words.includes(`\n${objectName}\n`) &&
            words.includes(`\n${member}\n`) &&
            this.#source.ownerOf(other) === owner,
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

  #guardNodeOf({ name, owner, span, scope, doc, parts }: DeclaredGuard) {
    const node = this.#addNode(this.#key("guard", owner, name), "guard", owner, null, name, span, scope ? [scope] : []);
    if (doc && !node.doc) node.doc = doc;
    const digest = node.digest
      ? null
      : this.#hashOf(
          ...parts.map(({ fileName, extent }): [string | undefined, Extent] => [
            this.#source.readText(fileName),
            extent,
          ]),
        );
    if (digest) node.digest = digest;
    return node.id;
  }

  #ownerOfSpecifier(fileName: string, specifier: string) {
    if (frameworkPattern.test(specifier)) return frameworkOwner;
    const alias = specifier.match(aliasPattern);
    if (alias) return `${alias[1]}/${alias[2]}`;
    if (!specifier.startsWith(".")) return undefined;
    const segments = this.#source.relative(fileName).split("/").slice(0, -1);
    for (const segment of specifier.split("/"))
      if (segment === "..") segments.pop();
      else if (segment !== ".") segments.push(segment);
    return ownerOf(segments.join("/")) ?? undefined;
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

  //? Re-exports are not followed, so of two libs declaring a name neither is known to be the one re-exported.
  #soleVisible<Declared extends { owner: string | null }>(declared: Declared[], from: string | null) {
    const visible = declared.filter((other) => this.#visible(other.owner, from));
    return visible.length === 1 ? visible[0] : undefined;
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
    const resolved = this.#source
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
    const id = `component:${relative}#${name}`;
    const context: Context = {
      id,
      kind: "component",
      owner,
      module: null,
      extent: { start: top.getStart(source), end: top.getEnd() },
    };
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
