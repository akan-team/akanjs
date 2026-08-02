import {
  type Cls,
  ENDPOINT_META,
  INTERNAL_META,
  PrimitiveRegistry,
  type PrimitiveScalar,
  SLICE_META,
} from "akanjs/base";
import { capitalize } from "akanjs/common";
import { ConstantRegistry, type ConstantType } from "akanjs/constant";
import type {
  ArgInfo,
  EndpointCls,
  EndpointInfo,
  InternalInfo,
  SerializedArg,
  SerializedEndpoint,
  SerializedReturns,
  SerializedSignal,
  SliceCls,
  SliceInfo,
} from "akanjs/signal";
import { FetchSerializer } from "../../signal/serializer";
import type { DatabaseModule, ServiceModule } from "../akanLib";
import type { DiLifecycle } from "../di/diLifecycle";
import { SignalResolver } from "../resolver";
import type { EndpointNode, InternalNode, RouteRow, SignalData, SignalNode, SliceNode } from "./types";

export interface SignalSerializerContext {
  di: DiLifecycle;
  serverMode: "federation" | "batch" | "all";
  prefix: string;
  websocketPrefix: string;
}

/**
 * Builds the `/_akan/signal` payload from the live DI container.
 *
 * The client-side `getSerializedSignal()` is deliberately *not* used here: its map is seeded with the `base`
 * signal and only completed at build time via `applySignal`, so on a server process it under-reports the API.
 * Declared endpoints come from `FetchSerializer.serializeRegistry(di.live)` (what `/openapi.json` uses), the
 * framework-generated CRUD/slice endpoints come from the slice endpoint class the resolver synthesized, and
 * internals — absent from `SerializedSignal` entirely — are read straight off `INTERNAL_META`.
 */
export class SignalSerializer {
  static serialize({ di, serverMode, prefix, websocketPrefix }: SignalSerializerContext): SignalData {
    const serializedSignals = FetchSerializer.serializeRegistry(di.live).signal;
    const modules = di.modules;
    const signals: Record<string, SignalNode> = {};
    const routes: RouteRow[] = [];
    const guards = new Set<string>();

    const entries: [string, DatabaseModule | ServiceModule][] = [
      ...modules.database.entries(),
      ...modules.service.entries(),
    ];
    for (const [refName, mod] of entries) {
      const declaredCls = mod.signal.endpoint;
      const sliceCls = "slice" in mod.signal ? (mod.signal.slice as SliceCls) : undefined;
      const generatedCls = sliceCls ? di.registry.endpointCls.get(sliceCls.refName) : undefined;
      const serialized: SerializedSignal = serializedSignals[refName] ?? { endpoint: {} };

      const declared = SignalSerializer.#augmentAll(serialized.endpoint, declaredCls);
      const generatedAll = generatedCls
        ? SignalSerializer.#augmentAll(FetchSerializer.serializeServiceSignal(generatedCls).endpoint, generatedCls)
        : {};
      const sliceDerivedKeys = SignalSerializer.#sliceDerivedKeys(refName, sliceCls);
      const generated = {
        crud: SignalSerializer.#pick(generatedAll, (key) => !sliceDerivedKeys.has(key)),
        slice: SignalSerializer.#pick(generatedAll, (key) => sliceDerivedKeys.has(key)),
      };

      signals[refName] = {
        refName,
        kind: sliceCls ? "database" : "service",
        ...(declaredCls.srv.cnst?.refName ? { cnstRefName: declaredCls.srv.cnst.refName } : {}),
        classNames: {
          internal: mod.signal.internal.refName,
          endpoint: declaredCls.refName,
          ...(sliceCls ? { slice: sliceCls.refName } : {}),
          server: mod.signal.server.refName,
        },
        guards: SignalSerializer.#sliceGuards(serialized),
        internal: SignalSerializer.#serializeInternals(mod.signal.internal[INTERNAL_META], serverMode),
        slice: SignalSerializer.#serializeSlices(serialized),
        endpoint: declared,
        generated,
      };

      routes.push(...SignalSerializer.#routeRows(refName, declaredCls, declared, "declared", prefix, websocketPrefix));
      if (generatedCls) {
        routes.push(
          ...SignalSerializer.#routeRows(
            refName,
            generatedCls,
            generatedAll,
            (key) => (sliceDerivedKeys.has(key) ? "slice" : "crud"),
            prefix,
            websocketPrefix,
          ),
        );
      }
    }

    for (const signal of Object.values(signals)) {
      const guarded = [
        ...Object.values(signal.guards),
        ...[signal.endpoint, signal.generated.crud, signal.generated.slice, signal.slice].flatMap((group) =>
          Object.values(group).map((entry) => entry.guards),
        ),
      ];
      for (const names of guarded) {
        for (const name of names ?? []) guards.add(name);
      }
    }

    return {
      prefix,
      websocketPrefix,
      signals,
      routes,
      guards: [...guards].sort(),
      middlewares: [...modules.middleware.keys()].sort(),
    };
  }

  // * ==================== Endpoints ==================== * //

  /**
   * `FetchSerializer` never populates `prefix`/`globalPrefix` (they are server-routing concerns), so a
   * `{ globalPrefix: false }` endpoint is unreconstructable from the client payload alone. Read them off
   * `ENDPOINT_META` instead of widening what ships to every client bundle.
   */
  static #augmentAll(
    endpoints: Record<string, SerializedEndpoint>,
    endpointCls: EndpointCls,
  ): Record<string, EndpointNode> {
    const meta = SignalSerializer.#endpointMeta(endpointCls);
    return Object.fromEntries(
      Object.entries(endpoints).map(([key, endpoint]) => [key, SignalSerializer.#augment(endpoint, meta[key])]),
    );
  }

  static #augment(endpoint: SerializedEndpoint, info: EndpointInfo | undefined): EndpointNode {
    const option = info?.signalOption;
    return {
      ...endpoint,
      ...(option?.prefix !== undefined ? { prefix: option.prefix } : {}),
      ...(option?.globalPrefix !== undefined ? { globalPrefix: option.globalPrefix } : {}),
      ...(option?.cache !== undefined ? { cache: option.cache } : {}),
      ...(option?.timeout !== undefined ? { timeout: option.timeout } : {}),
    };
  }

  static #pick(
    endpoints: Record<string, EndpointNode>,
    predicate: (key: string) => boolean,
  ): Record<string, EndpointNode> {
    return Object.fromEntries(Object.entries(endpoints).filter(([key]) => predicate(key)));
  }

  /** The list/insight pair the resolver synthesizes per slice key — everything else on that class is CRUD. */
  static #sliceDerivedKeys(refName: string, sliceCls: SliceCls | undefined): Set<string> {
    const sliceMeta = (sliceCls?.[SLICE_META] ?? {}) as Record<string, SliceInfo>;
    return new Set(
      Object.keys(sliceMeta).flatMap((key) => [
        `${refName}List${capitalize(key)}`,
        `${refName}Insight${capitalize(key)}`,
      ]),
    );
  }

  static #serializeSlices(serialized: SerializedSignal): Record<string, SliceNode> {
    return Object.fromEntries(
      Object.entries(serialized.slice ?? {}).map(([key, slice]) => [
        key,
        {
          args: slice.args,
          ...(slice.path ? { path: slice.path } : {}),
          ...(slice.guards ? { guards: slice.guards } : {}),
        },
      ]),
    );
  }

  static #sliceGuards(serialized: SerializedSignal): SignalNode["guards"] {
    return {
      ...(serialized.getGuards ? { get: serialized.getGuards } : {}),
      ...(serialized.cruGuards ? { cru: serialized.cruGuards } : {}),
      ...(serialized.createGuards ? { create: serialized.createGuards } : {}),
      ...(serialized.updateGuards ? { update: serialized.updateGuards } : {}),
      ...(serialized.removeGuards ? { remove: serialized.removeGuards } : {}),
    };
  }

  // * ==================== Routes ==================== * //

  static #routeRows(
    signal: string,
    endpointCls: EndpointCls,
    nodes: Record<string, EndpointNode>,
    source: RouteRow["source"] | ((key: string) => RouteRow["source"]),
    prefix: string,
    websocketPrefix: string,
  ): RouteRow[] {
    const meta = SignalSerializer.#endpointMeta(endpointCls);
    const defaultPrefix = endpointCls.srv.cnst?.refName;
    return Object.entries(nodes).flatMap(([key, node]) => {
      const info = meta[key];
      if (!info) return [];
      const transport = node.type === "query" || node.type === "mutation" ? "http" : "ws";
      return [
        {
          signal,
          key,
          source: typeof source === "function" ? source(key) : source,
          type: node.type,
          transport,
          method: node.type === "query" ? "GET" : node.type === "mutation" ? "POST" : null,
          path:
            transport === "ws"
              ? SignalSerializer.#joinPath(prefix, websocketPrefix)
              : SignalSerializer.#httpPath(key, info, defaultPrefix, prefix),
          guards: node.guards ?? [],
          ...(node.cache !== undefined ? { cache: node.cache } : {}),
          ...(node.timeout !== undefined ? { timeout: node.timeout } : {}),
          ...(node.fileUpload ? { fileUpload: true } : {}),
        } satisfies RouteRow,
      ];
    });
  }

  /** Mirrors `SignalResolver.resolveEndpoint` + `ApiRouter.applyGlobalPrefix` so paths match the real route table. */
  static #httpPath(key: string, info: EndpointInfo, defaultPrefix: string | undefined, apiPrefix: string): string {
    const servicePrefix = SignalSerializer.#resolveServicePrefix(info.signalOption.prefix, defaultPrefix);
    const localPath = `${servicePrefix}${info.getPath(key)}`;
    if (info.signalOption.globalPrefix === false) return SignalSerializer.#normalizePath(localPath);
    return SignalSerializer.#joinPath(apiPrefix, localPath);
  }

  static #resolveServicePrefix(prefix: false | string | undefined, defaultPrefix?: string): string {
    if (prefix === false || prefix === "") return "";
    const resolved = prefix ?? defaultPrefix;
    if (!resolved) return "";
    const trimmed = resolved.trim().replace(/^\/+|\/+$/g, "");
    return trimmed ? `/${trimmed}` : "";
  }

  static #joinPath(prefix: string, path: string): string {
    const normalizedPrefix = SignalSerializer.#normalizePath(prefix).replace(/\/$/, "");
    const normalizedPath = SignalSerializer.#normalizePath(path);
    if (normalizedPrefix === "/") return normalizedPath;
    if (normalizedPath === "/") return normalizedPrefix;
    return `${normalizedPrefix}${normalizedPath}`;
  }

  static #normalizePath(path: string): string {
    const trimmed = path.trim();
    if (!trimmed || trimmed === "/") return "/";
    return `/${trimmed.replace(/^\/+|\/+$/g, "")}`;
  }

  // * ==================== Internals ==================== * //

  static #serializeInternals(
    internalMeta: Record<string, InternalInfo>,
    serverMode: "federation" | "batch" | "all",
  ): Record<string, InternalNode> {
    return Object.fromEntries(
      Object.entries(internalMeta ?? {}).map(([key, info]) => [
        key,
        SignalSerializer.#serializeInternal(key, info, serverMode),
      ]),
    );
  }

  static #serializeInternal(key: string, info: InternalInfo, serverMode: "federation" | "batch" | "all"): InternalNode {
    const option = info.signalOption;
    // `resolveField` internals are field resolvers, never scheduled — reporting them as "disabled" would read
    // as a misconfiguration rather than the design.
    const schedulable = info.type !== "resolveField";
    const skip = schedulable ? SignalResolver.getScheduleSkipReason(info, serverMode) : null;
    return {
      key,
      type: info.type,
      enabled: Boolean(option.enabled),
      ...(option.lock !== undefined ? { lock: option.lock } : {}),
      ...(option.serverMode ? { serverMode: option.serverMode } : {}),
      ...(option.operationMode ? { operationMode: [...option.operationMode] } : {}),
      ...SignalSerializer.#schedule(info),
      args: info.args.map((arg) => SignalSerializer.#serializeArg(arg)),
      internalArgs: info.internalArgs.map((internalArg) => internalArg.argRef.name),
      returns: SignalSerializer.#serializeReturns(info),
      scheduledHere: schedulable && !skip,
      ...(schedulable
        ? skip
          ? { skipReason: skip.reason }
          : {}
        : { skipReason: "resolveField internals resolve a field on demand and are never scheduled" }),
    };
  }

  static #schedule(info: InternalInfo): Pick<InternalNode, "schedule"> {
    const { scheduleCron, scheduleTime } = info.signalOption;
    if (info.type === "cron") return scheduleCron ? { schedule: { cron: scheduleCron } } : {};
    if (info.type === "interval" || info.type === "timeout")
      return scheduleTime !== undefined ? { schedule: { everyMs: scheduleTime } } : {};
    return {};
  }

  // * ==================== Args ==================== * //

  static #serializeArg(argInfo: ArgInfo<{ nullable?: boolean }>): SerializedArg {
    const { refName, modelType } = SignalSerializer.#resolveRefInfo(argInfo.argRef as Cls);
    return {
      type: argInfo.type,
      refName,
      name: argInfo.name,
      ...(modelType ? { modelType: modelType as SerializedArg["modelType"] } : {}),
      ...(argInfo.arrDepth ? { arrDepth: argInfo.arrDepth } : {}),
      ...(argInfo.option?.nullable ? { nullable: true } : {}),
      ...(argInfo.enum ? { enum: argInfo.enum.refName } : {}),
    };
  }

  static #serializeReturns(info: InternalInfo): SerializedReturns {
    const { refName, modelType } = SignalSerializer.#resolveRefInfo(info.returns.returnRef as Cls);
    return {
      refName,
      ...(modelType ? { modelType: modelType as SerializedReturns["modelType"] } : {}),
      ...(info.returns.arrDepth ? { arrDepth: info.returns.arrDepth } : {}),
      ...(info.signalOption.nullable ? { nullable: true } : {}),
    };
  }

  static #resolveRefInfo(modelRef: Cls): { refName: string; modelType?: ConstantType } {
    if (PrimitiveRegistry.has(modelRef))
      return { refName: PrimitiveRegistry.getName(modelRef as typeof PrimitiveScalar) };
    const refName = ConstantRegistry.getRefName(modelRef, { allowEmpty: true });
    if (!refName) return { refName: modelRef.name || "Unknown" };
    return { refName, modelType: (modelRef as Cls<unknown, { modelType?: ConstantType }>).modelType };
  }

  static #endpointMeta(endpointCls: EndpointCls): Record<string, EndpointInfo> {
    return (endpointCls[ENDPOINT_META] ?? {}) as Record<string, EndpointInfo>;
  }
}
