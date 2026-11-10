import type {
  AkanGraphEdgeKind,
  AkanGraphLocation,
  AkanGraphNode,
  AkanGraphNodeKind,
} from "akanjs/common/akanGraph.ts";
import type { AkanGraphSource } from "./akanGraph";
import { frameworkOwner, frameworkPattern, type GuardResolver, type GuardSite } from "./guardResolver";
import type { AdaptorFact, AkanSpan, Extent, FileFacts, ServiceClassFact } from "./moduleFacts";

export interface GraphSink {
  key: (kind: AkanGraphNodeKind, owner: string | null, scope: string) => string;
  addNode: (
    id: string,
    kind: AkanGraphNodeKind,
    owner: string | null,
    name: string,
    span: AkanSpan | null,
    detail: string[],
  ) => AkanGraphNode;
  addEdge: (
    from: string,
    to: string,
    kind: AkanGraphEdgeKind,
    label: string | null,
    at: AkanGraphLocation | null,
  ) => void;
  digest: (node: AkanGraphNode, text: string | undefined, extent: Extent) => void;
  location: (span: AkanSpan) => AkanGraphLocation;
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

const maxBarrelDepth = 4;

export class AdaptorResolver {
  readonly #source: AkanGraphSource;
  readonly #resolver: GuardResolver;
  readonly #sink: GraphSink;
  readonly #adaptors = new Map<string, DeclaredAdaptor[]>();
  readonly #plugs = new Map<string, DeclaredPlug[]>();
  readonly #serviceFields = new Set<string>();

  constructor(source: AkanGraphSource, resolver: GuardResolver, sink: GraphSink) {
    this.#source = source;
    this.#resolver = resolver;
    this.#sink = sink;
  }

  declare(facts: FileFacts[]) {
    const counts = new Map<string, number>();
    for (const file of facts)
      for (const fact of file.adaptors) {
        const key = this.#sink.key("adaptor", file.owner, fact.name);
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
    const declared = facts.flatMap((file) =>
      file.adaptors.map((fact) => {
        const key = this.#sink.key("adaptor", file.owner, fact.name);
        const id =
          (counts.get(key) ?? 0) > 1
            ? this.#sink.key("adaptor", file.owner, `${this.#resolver.inOwner(file.fileName, file.owner)}#${fact.name}`)
            : key;
        const adaptor = { fact, owner: file.owner, fileName: file.fileName, id };
        this.#adaptors.set(fact.name, [...(this.#adaptors.get(fact.name) ?? []), adaptor]);
        this.#nodeOf(adaptor);
        return { adaptor, file };
      }),
    );
    for (const { adaptor, file } of declared)
      for (const plug of adaptor.fact.plugs)
        this.#sink.addEdge(
          adaptor.id,
          this.#idOf(plug.target, file),
          "plugs",
          plug.name,
          this.#sink.location(plug.span),
        );
    for (const file of facts)
      for (const binding of file.adaptorBindings)
        this.#sink.addEdge(
          this.#idOf(binding.role, file),
          this.#idOf(binding.adaptor, file),
          "binds",
          file.owner,
          this.#sink.location(binding.span),
        );
  }

  addService(refName: string, service: ServiceClassFact, file: FileFacts) {
    for (const plug of service.plugs) {
      const key = `${refName}\n${plug.name}`;
      this.#plugs.set(key, [
        ...(this.#plugs.get(key) ?? []),
        { owner: file.owner, target: this.#idOf(plug.target, file) },
      ]);
    }
    for (const field of service.fields) this.#serviceFields.add(`${file.owner ?? ""}\n${refName}\n${field}`);
  }

  //? An app service spreads its module's lib services (`...user.services`), so it holds the fields they plug.
  pluggedOf(owner: string | null, module: string | null, field: string) {
    const plugs = this.#plugs.get(`${module}\n${field}`) ?? [];
    const own = plugs.filter((plug) => plug.owner === owner);
    if (!own.length && this.#serviceFields.has(`${owner ?? ""}\n${module}\n${field}`)) return [];
    const inherited = own.length ? own : plugs.filter((plug) => this.#resolver.visible(plug.owner, owner));
    return [...new Set(inherited.map(({ target }) => target))];
  }

  #idOf(local: string, file: GuardSite) {
    const [head, member] = local.split(".");
    const imported = file.imports.find((item) => item.name === head);
    const name =
      member ?? (imported && imported.imported !== "default" && imported.imported !== "*" ? imported.imported : head);
    const path = imported ? this.#resolver.pathOfSpecifier(file.fileName, imported.from) : null;
    if (imported && path === null && !frameworkPattern.test(imported.from))
      return this.#packageAdaptorOf(name, imported.from);
    const from = imported ? this.#resolver.ownerOfSpecifier(file.fileName, imported.from) : undefined;
    const declared = this.#adaptors.get(name) ?? [];
    const holder = from === undefined ? file.owner : from;
    const own = this.#adaptorIn(declared, holder, path, file.fileName);
    const found =
      own === undefined && from !== frameworkOwner
        ? declared.find((adaptor) => this.#resolver.visible(adaptor.owner, holder))
        : own;
    if (found) return found.id;
    const reexported =
      own === undefined && from && from !== frameworkOwner ? this.#packageShimOf(from, name, path) : null;
    if (reexported) return this.#packageAdaptorOf(reexported.name, reexported.from);
    const owner = from === frameworkOwner ? null : imported ? (from ?? null) : file.owner;
    const detail = from === frameworkOwner ? [frameworkOwner] : [];
    return this.#sink.addNode(this.#sink.key("adaptor", owner, name), "adaptor", owner, name, null, detail).id;
  }

  //? `null`: the import reaches several same-name adaptors, and TypeScript drops a name two `export *` share.
  #adaptorIn(
    declared: DeclaredAdaptor[],
    owner: string | null,
    path: string | null,
    fileName: string,
    depth = 0,
  ): DeclaredAdaptor | null | undefined {
    const own = declared.filter((adaptor) => adaptor.owner === owner);
    const [first] = own;
    if (!first || own.length < 2) return first;
    if (path === null) return own.find((adaptor) => adaptor.fileName === fileName) ?? first;
    const isAt = (adaptor: DeclaredAdaptor, target: string) =>
      this.#moduleOf(adaptor) === target || this.#moduleOf(adaptor) === `${target}/index`;
    const exact = own.find((adaptor) => isAt(adaptor, path));
    if (exact) return exact;
    const reexport = owner && depth < maxBarrelDepth ? this.#resolver.reexportOf(owner, first.fact.name, path) : null;
    const [named] = reexport?.site.imports ?? [];
    const target =
      reexport && named && this.#isUnder(reexport.site.fileName, path)
        ? this.#resolver.pathOfSpecifier(reexport.site.fileName, named.from)
        : null;
    if (target) return this.#adaptorIn(declared, owner, target, fileName, depth + 1);
    const { paths } = owner ? this.#resolver.starExportsOf(owner, path) : { paths: [] };
    const reached = own.filter((adaptor) => paths.some((reachable) => isAt(adaptor, reachable)));
    if (reached.length) return reached.length === 1 ? reached[0] : null;
    const under = own.filter((adaptor) => this.#moduleOf(adaptor).startsWith(`${path}/`));
    return under.length === 1 ? under[0] : null;
  }

  #moduleOf(adaptor: DeclaredAdaptor) {
    return this.#source.relative(adaptor.fileName).replace(/\.tsx?$/, "");
  }

  #isUnder(fileName: string, path: string) {
    const module = this.#source.relative(fileName).replace(/\.tsx?$/, "");
    return module === path || module.startsWith(`${path}/`);
  }

  #packageAdaptorOf(name: string, specifier: string) {
    if (frameworkPattern.test(specifier))
      return this.#sink.addNode(this.#sink.key("adaptor", null, name), "adaptor", null, name, null, [frameworkOwner])
        .id;
    const pkg = specifier
      .split("/")
      .slice(0, specifier.startsWith("@") ? 2 : 1)
      .join("/");
    return this.#sink.addNode(this.#sink.key("adaptor", pkg, name), "adaptor", null, name, null, [pkg]).id;
  }

  //? A lib reaches a third-party class only through a re-export, so the class is the package's, not the lib's.
  #packageShimOf(owner: string, name: string, near: string | null) {
    const reexport = this.#resolver.reexportOf(owner, name, near);
    const [shim] = reexport?.site.imports ?? [];
    if (reexport && shim && this.#resolver.pathOfSpecifier(reexport.site.fileName, shim.from) === null)
      return { name: reexport.local === "default" ? name : reexport.local, from: shim.from };
    if (reexport || !near) return null;
    const { packages } = this.#resolver.starExportsOf(owner, near);
    const [only] = packages;
    return packages.length === 1 && only && !this.#resolver.declares(owner, name) ? { name, from: only } : null;
  }

  #nodeOf({ fact, owner, fileName, id }: DeclaredAdaptor) {
    const detail = fact.refName ? [fact.refName] : [];
    const node = this.#sink.addNode(id, "adaptor", owner, fact.name, fact.span, detail);
    if (fact.doc && !node.doc) node.doc = fact.doc;
    this.#sink.digest(node, this.#source.readText(fileName), fact.extent);
    return node.id;
  }
}
