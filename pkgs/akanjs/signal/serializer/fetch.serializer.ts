import { type Cls, ENDPOINT_META, PrimitiveRegistry, type PrimitiveScalar, SLICE_META } from "akanjs/base";
import { Logger } from "akanjs/common";
import { ConstantRegistry, type ConstantType } from "akanjs/constant";
import { type FilterArgInfo, getFilterArgInfos, getFilterMeta } from "akanjs/document";
import type { LiveRegistry } from "akanjs/service";
import type {
  ArgInfo,
  EndpointArgProps,
  EndpointCls,
  EndpointInfo,
  SerializedArg,
  SerializedEndpoint,
  SerializedFilter,
  SerializedReturns,
  SerializedSignal,
  SerializedSignalMcp,
  SerializedSlice,
  SliceCls,
  SliceInfo,
} from "akanjs/signal";
import { type GuardCls, refusesAgents } from "../guard";

export class FetchSerializer {
  static logger = new Logger("FetchSerializer");

  static #resolveRefInfo(modelRef: Cls): { refName: string; modelType?: ConstantType } {
    if (PrimitiveRegistry.has(modelRef))
      return { refName: PrimitiveRegistry.getName(modelRef as typeof PrimitiveScalar) };
    const refName = ConstantRegistry.getRefName(modelRef);
    const modelType = (modelRef as Cls<unknown, { modelType?: ConstantType }>).modelType;
    return { refName, modelType };
  }

  static #serializeArg(argInfo: ArgInfo<EndpointArgProps<boolean>>): SerializedArg {
    const { refName, modelType } = FetchSerializer.#resolveRefInfo(argInfo.argRef as Cls);
    return {
      type: argInfo.type,
      refName,
      name: argInfo.name,
      ...(modelType ? { modelType: modelType as SerializedArg["modelType"] } : {}),
      ...(argInfo.arrDepth ? { arrDepth: argInfo.arrDepth } : {}),
      ...(argInfo.option?.nullable ? { nullable: true } : {}),
      ...(argInfo.option?.example != null
        ? {
            example:
              typeof argInfo.option.example === "object" ? argInfo.option.example.toDate() : argInfo.option.example,
          }
        : {}),
      ...(argInfo.enum ? { enum: argInfo.enum.refName } : {}),
    };
  }

  static #serializeReturns(endpointInfo: EndpointInfo): SerializedReturns {
    const { refName, modelType } = FetchSerializer.#resolveRefInfo(endpointInfo.returns.returnRef as Cls);
    return {
      refName,
      ...(modelType ? { modelType: modelType as SerializedReturns["modelType"] } : {}),
      ...(endpointInfo.returns.arrDepth ? { arrDepth: endpointInfo.returns.arrDepth } : {}),
      ...(endpointInfo.signalOption.partial?.length ? { partial: endpointInfo.signalOption.partial as string[] } : {}),
      ...(endpointInfo.signalOption.nullable ? { nullable: true } : {}),
    };
  }

  static #serializeEndpoint(key: string, endpointInfo: EndpointInfo, defaultPrefix?: string): SerializedEndpoint {
    const guards = endpointInfo.signalOption.guards?.map((g) => g.name);
    const { path, name, prefix, globalPrefix } = endpointInfo.signalOption;
    return {
      type: endpointInfo.type,
      args: endpointInfo.args.map(FetchSerializer.#serializeArg),
      returns: FetchSerializer.#serializeReturns(endpointInfo),
      ...(path || name || prefix !== undefined ? { path: endpointInfo.getRoutePath(key, defaultPrefix) } : {}),
      ...(globalPrefix === false ? { globalPrefix } : {}),
      ...(endpointInfo.signalOption.method ? { method: endpointInfo.signalOption.method } : {}),
      ...(endpointInfo.signalOption.fileUpload ? { fileUpload: true } : {}),
      ...(endpointInfo.signalOption.timeout ? { timeout: endpointInfo.signalOption.timeout } : {}),
      ...(guards?.length ? { guards } : {}),
      ...(endpointInfo.signalOption.mcp === false ? { mcp: false as const } : {}),
      ...(refusesAgents(endpointInfo.signalOption.guards) ? { agents: false as const } : {}),
    };
  }

  static #serializeFilterArg(argInfo: FilterArgInfo): SerializedArg {
    const { refName, modelType } = FetchSerializer.#resolveRefInfo(argInfo.argRef as Cls);
    return {
      type: "search",
      refName,
      name: argInfo.name,
      ...(modelType ? { modelType: modelType as SerializedArg["modelType"] } : {}),
      ...(argInfo.arrDepth ? { arrDepth: argInfo.arrDepth } : {}),
      ...(argInfo.nullable ? { nullable: true } : {}),
      ...(argInfo.enum ? { enum: argInfo.enum.refName } : {}),
      ...(argInfo.ref ? { ref: argInfo.ref } : {}),
    };
  }
  // What the root slice takes instead of a raw query, so a client can name a filter and type its args.
  static #serializeFilter(sliceCls: SliceCls): SerializedFilter | undefined {
    const filterMeta = getFilterMeta(sliceCls.srv.db.filter, { allowEmpty: true });
    if (!filterMeta) return undefined;
    const filter = Object.fromEntries(
      Object.entries(filterMeta.query).map(([key, filterInfo]) => [
        key,
        getFilterArgInfos(filterInfo).map(FetchSerializer.#serializeFilterArg),
      ]),
    );
    return { filter, sortKeys: Object.keys(filterMeta.sort), sorts: filterMeta.sort as SerializedFilter["sorts"] };
  }
  static #serializeSlice(sliceInfo: SliceInfo): SerializedSlice {
    const guards = sliceInfo.signalOption.guards?.map((g) => g.name);
    return {
      args: sliceInfo.args.map(FetchSerializer.#serializeArg),
      ...(sliceInfo.signalOption.path ? { path: sliceInfo.signalOption.path } : {}),
      ...(guards?.length ? { guards } : {}),
      ...(sliceInfo.signalOption.mcp === false ? { mcp: false as const } : {}),
      ...(refusesAgents(sliceInfo.signalOption.guards) ? { agents: false as const } : {}),
      ...(sliceInfo.liveOption
        ? {
            live: {
              sort: sliceInfo.liveOption.sort,
              ...(sliceInfo.liveOption.pauseOn.length ? { pauseOn: sliceInfo.liveOption.pauseOn } : {}),
            },
          }
        : {}),
    };
  }

  static serializeDatabaseSignal(sliceCls: SliceCls, endpointCls: EndpointCls): SerializedSignal {
    const sliceMeta = sliceCls[SLICE_META] as { [key: string]: SliceInfo };
    const prefix = sliceCls.srv.cnst?.refName;
    const slice: { [key: string]: SerializedSlice } = {};
    for (const [key, sliceInfo] of Object.entries(sliceMeta)) {
      slice[key] = FetchSerializer.#serializeSlice(sliceInfo);
    }
    const filter = FetchSerializer.#serializeFilter(sliceCls);
    // On the argument itself, so every schema reader (API explorer, OpenAPI, MCP) sees the keys it may pick.
    const queryKeyArg = slice[""]?.args.find((arg) => arg.name === "queryKey");
    if (queryKeyArg && filter) queryKeyArg.oneOf = Object.keys(filter.filter);
    return {
      ...(prefix ? { prefix } : {}),
      ...(Object.keys(slice).length ? { slice } : {}),
      ...(filter ? { filter } : {}),
      ...FetchSerializer.#guardNames("getGuards", sliceCls.getGuards),
      ...FetchSerializer.#guardNames("cruGuards", sliceCls.cruGuards),
      // Emitted only when overriding cru (a distinct array reference); otherwise the client falls back to cruGuards.
      ...FetchSerializer.#guardNames(
        "createGuards",
        sliceCls.createGuards,
        sliceCls.createGuards !== sliceCls.cruGuards,
      ),
      ...FetchSerializer.#guardNames(
        "updateGuards",
        sliceCls.updateGuards,
        sliceCls.updateGuards !== sliceCls.cruGuards,
      ),
      ...FetchSerializer.#guardNames(
        "removeGuards",
        sliceCls.removeGuards,
        sliceCls.removeGuards !== sliceCls.cruGuards,
      ),
      ...FetchSerializer.#serializeSliceMcp(sliceCls),
      ...FetchSerializer.#serializeSliceAgents(sliceCls),
      endpoint: FetchSerializer.#serializeEndpoints(endpointCls),
    };
  }

  static #guardNames<Key extends string>(key: Key, guards: GuardCls[], emit = true) {
    if (!emit || !guards.some((guard) => guard.name !== "None")) return {};
    return { [key]: guards.map((guard) => guard.name) } as { [K in Key]: string[] };
  }

  static #serializeEndpoints(endpointCls: EndpointCls) {
    const endpoint: { [key: string]: SerializedEndpoint } = {};
    const defaultPrefix = endpointCls.srv.cnst?.refName;
    for (const [key, endpointInfo] of Object.entries(endpointCls[ENDPOINT_META] as { [key: string]: EndpointInfo }))
      endpoint[key] = FetchSerializer.#serializeEndpoint(key, endpointInfo, defaultPrefix);
    return endpoint;
  }

  static #serializeSliceAgents(sliceCls: SliceCls): { agents?: SerializedSignalMcp } {
    const agents: SerializedSignalMcp = {
      ...(refusesAgents(sliceCls.getGuards) ? { get: false as const } : {}),
      ...(refusesAgents(sliceCls.createGuards) ? { create: false as const } : {}),
      ...(refusesAgents(sliceCls.updateGuards) ? { update: false as const } : {}),
      ...(refusesAgents(sliceCls.removeGuards) ? { remove: false as const } : {}),
    };
    return Object.keys(agents).length ? { agents } : {};
  }

  static #serializeSliceMcp(sliceCls: SliceCls): { mcp?: SerializedSignalMcp } {
    const mcp = Object.fromEntries(
      Object.entries(sliceCls.mcp ?? {})
        .filter(([, published]) => !published)
        .map(([verb]) => [verb, false]),
    ) as SerializedSignalMcp;
    return Object.keys(mcp).length ? { mcp } : {};
  }

  static serializeServiceSignal(endpointCls: EndpointCls): SerializedSignal {
    return { endpoint: FetchSerializer.#serializeEndpoints(endpointCls) };
  }

  /** A container that has not finished booting answers an empty catalogue rather than throwing. */
  static serializeRegistry(live: LiveRegistry | null | undefined): {
    signal: { [key: string]: SerializedSignal };
  } {
    const serializedSignals: { [key: string]: SerializedSignal } = {};
    if (!live) return { signal: serializedSignals };
    const { endpointCls, sliceCls } = live;
    for (const [baseName, endpoint] of endpointCls.entries()) {
      const cnst = endpoint.srv.cnst;
      if (cnst) {
        const slice = sliceCls.get(baseName);
        if (!slice) throw new Error(`No slice found for service signal "${baseName}"`);
        serializedSignals[baseName] = FetchSerializer.serializeDatabaseSignal(slice, endpoint);
      } else {
        serializedSignals[baseName] = FetchSerializer.serializeServiceSignal(endpoint);
      }
    }
    return { signal: serializedSignals };
  }
}
