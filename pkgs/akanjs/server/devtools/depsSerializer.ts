import { type BaseEnv, INJECT_META } from "akanjs/base";
import { modelNames } from "akanjs/common";
import type { AdaptorCls, InjectInfo, ServiceCls } from "akanjs/service";
import type { DiLifecycle } from "../di/diLifecycle";
import type { DepEdge, DepEdgeKind, DepNode, DepNodeKind, DepsData } from "./types";

export interface DepsSerializerContext {
  di: DiLifecycle;
  env: BaseEnv;
  name: string;
  status: string;
  serverMode: "federation" | "batch" | "all";
  prefix: string;
  websocketPrefix: string;
  openapi: boolean;
}

type InjectableCls = { [INJECT_META]?: Record<string, InjectInfo>; refName: string };

/** Edges mirror `InjectInfo.resolveInjection` field-for-field, so the graph is the one that resolves at boot. */
export class DepsSerializer {
  readonly #context: DepsSerializerContext;
  readonly #nodes = new Map<string, DepNode>();
  readonly #edges: DepEdge[] = [];

  constructor(context: DepsSerializerContext) {
    this.#context = context;
  }

  build(): DepsData {
    const { di, env, name, status, serverMode, prefix, websocketPrefix, openapi } = this.#context;
    this.#collectNodes();
    this.#collectEdges();
    return {
      app: { name, status, serverMode, prefix, websocketPrefix, openapi },
      nodes: [...this.#nodes.values()],
      edges: this.#edges,
      roles: [...di.registry.adaptorRole.entries()]
        .map(([role, impl]) => ({ role: role.refName, impl: impl.refName }))
        .sort((a, b) => a.role.localeCompare(b.role)),
      stages: {
        adaptor: di.hierarchy.adaptorStages.map((stage) => [...stage]),
        service: di.hierarchy.serviceStages.map((stage) => [...stage]),
      },
      env: DepsSerializer.#serializeEnv(env),
      disabledModules: [...di.disabledModules.entries()].map(([refName, reason]) => ({ refName, reason })),
    };
  }

  #collectNodes() {
    const { di } = this.#context;
    const serviceStageOf = DepsSerializer.#stageIndex(di.hierarchy.serviceStages);
    const adaptorStageOf = DepsSerializer.#stageIndex(di.hierarchy.adaptorStages);
    const roleOf = new Map([...di.registry.adaptorRole].map(([role, impl]) => [impl.refName, role.refName] as const));

    di.registry.serviceCls.forEach((cls, refName) => {
      this.#node("service", refName, {
        className: cls.refName,
        serviceType: (cls as ServiceCls).type,
        enabled: (cls as ServiceCls).enabled,
        ...(serviceStageOf.has(refName) ? { stage: serviceStageOf.get(refName) } : {}),
        ...(di.modules.database.has(refName) ? { cnstRefName: refName } : {}),
      });
    });
    di.registry.adaptorCls.forEach((cls, refName) => {
      this.#node("adaptor", refName, {
        className: cls.refName,
        ...(adaptorStageOf.has(refName) ? { stage: adaptorStageOf.get(refName) } : {}),
        ...(roleOf.has(refName) ? { role: roleOf.get(refName) } : {}),
      });
    });
    di.registry.serverSignalCls.forEach((cls, refName) => {
      this.#node("serverSignal", refName, { className: cls.refName });
    });
    di.registry.internalCls.forEach((cls, refName) => {
      this.#node("internal", refName, { className: cls.refName });
    });
    di.registry.endpointCls.forEach((cls, refName) => {
      this.#node("endpoint", refName, { className: cls.refName });
    });
    di.live.sliceCls.forEach((cls, refName) => {
      this.#node("slice", refName, { className: cls.refName });
    });
    // Uses hold live SDK clients that commonly close over credentials — key and class name only.
    di.registry.uses.forEach((value, key) => {
      this.#node("use", key, { className: DepsSerializer.#classNameOf(value) });
    });
    di.modules.middleware.forEach((cls, refName) => {
      this.#node("middleware", refName, { className: cls.refName });
    });
    di.webProxies.forEach((registration) => {
      const proxy = "proxy" in registration ? registration.proxy : registration;
      this.#node("webProxy", proxy.refName, { className: proxy.refName });
    });
    this.#node("env", "env");
  }

  #node(kind: DepNodeKind, refName: string, extra: Omit<DepNode, "id" | "kind" | "refName"> = {}): string {
    const id = `${kind}:${refName}`;
    if (!this.#nodes.has(id)) this.#nodes.set(id, { id, kind, refName, ...extra });
    return id;
  }

  #collectEdges() {
    const { di } = this.#context;
    const sources: [DepNodeKind, Map<string, unknown>][] = [
      ["service", di.registry.serviceCls],
      ["adaptor", di.registry.adaptorCls],
      ["serverSignal", di.registry.serverSignalCls],
      ["internal", di.registry.internalCls],
      ["endpoint", di.registry.endpointCls],
      ["slice", di.live.sliceCls],
    ];
    for (const [kind, classes] of sources)
      for (const [refName, cls] of classes) this.#edgesFrom(this.#node(kind, refName), cls as InjectableCls);
  }

  #edgesFrom(from: string, cls: InjectableCls) {
    const injectMap = cls[INJECT_META] ?? {};
    Object.entries(injectMap).forEach(([prop, injectInfo]) => {
      const edge = this.#resolveEdge(from, prop, injectInfo);
      if (edge) this.#edges.push(edge);
    });
  }

  #resolveEdge(from: string, prop: string, injectInfo: InjectInfo): DepEdge | null {
    const kind = injectInfo.type as DepEdgeKind;
    switch (kind) {
      case "database":
        return { from, to: this.#node("adaptor", modelNames(injectInfo.parentRefName).modelModel), kind, prop };
      case "service":
        return prop.endsWith("Service")
          ? { from, to: this.#node("service", prop.slice(0, -"Service".length)), kind, prop }
          : null;
      case "signal":
        return prop.endsWith("Signal") ? { from, to: this.#node("serverSignal", prop), kind, prop } : null;
      case "use":
        return { from, to: this.#node("use", prop), kind, prop };
      case "plug":
        return this.#plugEdge(from, prop, injectInfo);
      case "env":
        return {
          from,
          to: this.#node("env", "env"),
          kind,
          prop,
          detail: { keys: DepsSerializer.#extractEnvKeys(injectInfo.generateFactory) },
        };
      case "memory":
        return this.#memoryEdge(from, prop, injectInfo);
      default:
        return null;
    }
  }

  #plugEdge(from: string, prop: string, injectInfo: InjectInfo): DepEdge | null {
    const declared = injectInfo.adaptor;
    if (!declared) return null;
    const resolved = this.#context.di.registry.adaptorRole.get(declared) ?? declared;
    return {
      from,
      to: this.#node("adaptor", declared.refName),
      kind: "plug",
      prop,
      ...(resolved.refName !== declared.refName ? { resolvedTo: resolved.refName } : {}),
    };
  }

  #memoryEdge(from: string, prop: string, injectInfo: InjectInfo): DepEdge {
    const cacheCls = this.#resolveCacheAdaptorCls();
    return {
      from,
      to: this.#node("adaptor", cacheCls?.refName ?? "cacheAdaptorRole"),
      kind: "memory",
      prop,
      detail: {
        local: Boolean(injectInfo.local),
        isMap: Boolean(injectInfo.isMap),
        ...(injectInfo.ttl !== undefined ? { ttl: injectInfo.ttl } : {}),
      },
    };
  }

  /** Same lookup order `InjectInfo.resolveInjection` uses for the `memory` inject type. */
  #resolveCacheAdaptorCls(): AdaptorCls | undefined {
    const { registry } = this.#context.di;
    return (
      [...registry.adaptorRole.entries()].find(([role]) => role.refName === "cacheAdaptorRole")?.[1] ??
      registry.adaptorCls.get("solidCache") ??
      registry.adaptorCls.get("redisCache")
    );
  }

  // Scans the factory source instead of invoking it (factories open sockets); over-inclusive, but names only.
  static #extractEnvKeys(fn: (options: never) => unknown): string[] {
    const source = Function.prototype.toString.call(fn);
    const matches = [...source.matchAll(/\.\s*([A-Za-z_$][\w$]*)|\[\s*["'`]([^"'`]+)["'`]\s*\]/g)];
    return [...new Set(matches.map((match) => match[1] ?? match[2]).filter((key): key is string => Boolean(key)))];
  }

  static #serializeEnv(env: BaseEnv): DepsData["env"] {
    const publicEnv: Record<string, string> = {};
    Object.entries(process.env).forEach(([key, value]) => {
      if (key.startsWith("AKAN_PUBLIC_") && value !== undefined) publicEnv[key] = value;
    });
    const keys = new Set([...Object.keys(process.env), ...Object.keys(env)]);
    return { public: publicEnv, keys: [...keys].sort() };
  }

  static #stageIndex(stages: string[][]): Map<string, number> {
    return new Map(stages.flatMap((stage, stageIdx) => stage.map((refName) => [refName, stageIdx] as const)));
  }

  static #classNameOf(value: unknown): string {
    if (value === null || value === undefined) return typeof value;
    if (typeof value === "function") return value.name || "anonymous";
    if (typeof value === "object") return (value.constructor as { name?: string } | undefined)?.name ?? "Object";
    return typeof value;
  }
}
