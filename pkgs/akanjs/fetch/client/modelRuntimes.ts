import { type FetchPolicy, modelNames } from "akanjs/common";
import { ConstantRegistry } from "akanjs/constant";
import type { SliceMeta } from "../fetchType";
import type { FetchHandler } from "./fetchClientTypes";
import { FetchHandle } from "./fetchHandle";

interface ModelRuntimeState {
  references: Map<string, unknown>;
  version: number;
}

//? On globalThis: a server bundle can carry its own copy of this module beside the one that built the fetch client.
const MODEL_RUNTIMES_KEY = Symbol.for("akanjs.fetch.modelRuntimes");
const globalWithModelRuntimes = globalThis as typeof globalThis & { [MODEL_RUNTIMES_KEY]?: ModelRuntimeState };
const state: ModelRuntimeState = globalWithModelRuntimes[MODEL_RUNTIMES_KEY] ?? { references: new Map(), version: 0 };
globalWithModelRuntimes[MODEL_RUNTIMES_KEY] = state;

const stampedAt = new WeakMap<object, number>();

type Handoff = { refName: string; _runtime?: unknown };

//? React's flight client loads a client reference before it delivers the object holding it: the whole mechanism.
export class ModelRuntimes {
  static set(references: { [refName: string]: unknown } | null) {
    state.references = new Map(Object.entries(references ?? {}));
    state.version += 1;
  }

  //? Absent, never `undefined`: the flight payload of a server with no reference stays what it was.
  static of<Value extends Handoff>(handoff: Value): Value {
    const reference = state.references.get(handoff.refName);
    if (reference !== undefined) handoff._runtime = reference;
    else if ("_runtime" in handoff) delete handoff._runtime;
    return handoff;
  }

  //? A client built before the references were set, as the server's is, takes them on its next read.
  static slicesOf(slices: Record<string, SliceMeta>): Record<string, SliceMeta> {
    if (stampedAt.get(slices) === state.version) return slices;
    for (const meta of Object.values(slices)) ModelRuntimes.of(meta);
    stampedAt.set(slices, state.version);
    return slices;
  }

  static modelObjFn(refName: string, modelFnOf: () => FetchHandler): FetchHandler {
    const names = modelNames(refName);
    return (async (id: string, option?: FetchPolicy) => {
      const modelObj = await modelFnOf()(id, { ...option, crystalize: false });
      return ModelRuntimes.of({ refName, [names.modelObj]: modelObj, [names.modelViewAt]: new Date() });
    }) as FetchHandler;
  }

  //* The full model is built lazily — a route handing the payload to `Load.View` never reads it; `ViewAt` stamps once.
  static modelHandleFn(refName: string, payloadKey: string, modelFnOf: () => FetchHandler): FetchHandler {
    const names = modelNames(refName);
    return ((id: string, option?: FetchPolicy) => {
      const cnst = ConstantRegistry.getDatabase(refName);
      const modelRequest = modelFnOf()(id, { ...option, crystalize: false }) as Promise<object>;
      let model: object | undefined;
      let payload: object | undefined;
      const modelOf = (modelObj: object) => (model ??= new cnst.full(modelObj));
      const payloadOf = (modelObj: object) =>
        (payload ??= ModelRuntimes.of({ refName, [names.modelObj]: modelObj, [names.modelViewAt]: new Date() }));
      return FetchHandle.of<Record<string, unknown>, Record<string, Promise<unknown>>>(
        [modelRequest],
        async () => {
          const modelObj = await modelRequest;
          return FetchHandle.lazy({}, { [refName]: () => modelOf(modelObj), [payloadKey]: () => payloadOf(modelObj) });
        },
        {
          [refName]: () => modelRequest.then(modelOf),
          [payloadKey]: () => modelRequest.then(payloadOf),
        },
      );
    }) as FetchHandler;
  }
}
