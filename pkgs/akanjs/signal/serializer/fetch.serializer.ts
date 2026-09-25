import { type Cls, ENDPOINT_META, PrimitiveRegistry, type PrimitiveScalar, SLICE_META } from "akanjs/base";
import { Logger } from "akanjs/common";
import { ConstantRegistry, type ConstantType } from "akanjs/constant";
import type { LiveRegistry } from "akanjs/service";
import type {
  ArgInfo,
  EndpointArgProps,
  EndpointCls,
  EndpointInfo,
  SerializedArg,
  SerializedEndpoint,
  SerializedReturns,
  SerializedSignal,
  SerializedSlice,
  SliceCls,
  SliceInfo,
} from "akanjs/signal";

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

  static #serializeEndpoint(endpointInfo: EndpointInfo): SerializedEndpoint {
    const guards = endpointInfo.signalOption.guards?.map((g) => g.name);
    return {
      type: endpointInfo.type,
      args: endpointInfo.args.map(FetchSerializer.#serializeArg),
      returns: FetchSerializer.#serializeReturns(endpointInfo),
      ...(endpointInfo.signalOption.path ? { path: endpointInfo.signalOption.path } : {}),
      ...(endpointInfo.signalOption.fileUpload ? { fileUpload: true } : {}),
      ...(guards?.length ? { guards } : {}),
    };
  }

  static #serializeSlice(sliceInfo: SliceInfo): SerializedSlice {
    const guards = sliceInfo.signalOption.guards?.map((g) => g.name);
    return {
      args: sliceInfo.args.map(FetchSerializer.#serializeArg),
      ...(sliceInfo.signalOption.path ? { path: sliceInfo.signalOption.path } : {}),
      ...(guards?.length ? { guards } : {}),
    };
  }

  static serializeDatabaseSignal(sliceCls: SliceCls, endpointCls: EndpointCls): SerializedSignal {
    const sliceMeta = sliceCls[SLICE_META] as { [key: string]: SliceInfo };
    const endpointMeta = endpointCls[ENDPOINT_META] as { [key: string]: EndpointInfo };
    const prefix = sliceCls.srv.cnst?.refName;
    const slice: { [key: string]: SerializedSlice } = {};
    for (const [key, sliceInfo] of Object.entries(sliceMeta)) {
      slice[key] = FetchSerializer.#serializeSlice(sliceInfo);
    }
    const endpoint: { [key: string]: SerializedEndpoint } = {};
    for (const [key, endpointInfo] of Object.entries(endpointMeta)) {
      endpoint[key] = FetchSerializer.#serializeEndpoint(endpointInfo);
    }
    return {
      ...(prefix ? { prefix } : {}),
      ...(Object.keys(slice).length ? { slice } : {}),
      ...(sliceCls.getGuards.filter((g) => g.name !== "None").length
        ? { getGuards: sliceCls.getGuards.map((g) => g.name) }
        : {}),
      ...(sliceCls.cruGuards.filter((g) => g.name !== "None").length
        ? { cruGuards: sliceCls.cruGuards.map((g) => g.name) }
        : {}),
      // create/update/remove are only emitted when they override cru (distinct array reference);
      // otherwise the client falls back to cruGuards, keeping payloads unchanged for cru-only slices.
      ...(sliceCls.createGuards !== sliceCls.cruGuards && sliceCls.createGuards.filter((g) => g.name !== "None").length
        ? { createGuards: sliceCls.createGuards.map((g) => g.name) }
        : {}),
      ...(sliceCls.updateGuards !== sliceCls.cruGuards && sliceCls.updateGuards.filter((g) => g.name !== "None").length
        ? { updateGuards: sliceCls.updateGuards.map((g) => g.name) }
        : {}),
      ...(sliceCls.removeGuards !== sliceCls.cruGuards && sliceCls.removeGuards.filter((g) => g.name !== "None").length
        ? { removeGuards: sliceCls.removeGuards.map((g) => g.name) }
        : {}),
      endpoint,
    };
  }

  static serializeServiceSignal(endpointCls: EndpointCls): SerializedSignal {
    const endpointMeta = endpointCls[ENDPOINT_META] as { [key: string]: EndpointInfo };
    const endpoint: { [key: string]: SerializedEndpoint } = {};
    for (const [key, endpointInfo] of Object.entries(endpointMeta)) {
      endpoint[key] = FetchSerializer.#serializeEndpoint(endpointInfo);
    }
    return { endpoint };
  }

  static serializeRegistry({ endpointCls, sliceCls }: LiveRegistry): { signal: { [key: string]: SerializedSignal } } {
    const serializedSignals: { [key: string]: SerializedSignal } = {};
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
