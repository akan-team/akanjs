import { type FetchPolicy, modelNames } from "akanjs/common";
import { ConstantRegistry } from "akanjs/constant";
import type { SliceMeta } from "../fetchType";
import type { FetchHandler } from "./fetchClientTypes";
import { FetchHandle } from "./fetchHandle";

interface ModelRuntimeState {
  references: Map<string, unknown>;
  slices: Map<string, SliceMeta>;
}

//? On globalThis: a server bundle can carry its own copy of this module beside the one that built the fetch client.
const MODEL_RUNTIMES_KEY = Symbol.for("akanjs.fetch.modelRuntimes");
const CLIENT_REFERENCE = Symbol.for("react.client.reference");
const globalWithModelRuntimes = globalThis as typeof globalThis & { [MODEL_RUNTIMES_KEY]?: ModelRuntimeState };
const state: ModelRuntimeState = globalWithModelRuntimes[MODEL_RUNTIMES_KEY] ?? {
  references: new Map(),
  slices: new Map(),
};
globalWithModelRuntimes[MODEL_RUNTIMES_KEY] = state;

type Handoff = { refName: string; _runtime?: unknown };

//? React's flight client loads a client reference before it delivers the object holding it: the whole mechanism.
export class ModelRuntimes {
  static set(references: { [refName: string]: unknown } | null) {
    state.references = new Map(
      Object.entries(references ?? {}).map(([refName, reference]) => [refName, ModelRuntimes.#carried(reference)]),
    );
    for (const meta of state.slices.values()) ModelRuntimes.of(meta);
  }

  //? React's own reference is a function, which `structuredClone` throws on and a JSON copy drops with its key. This
  //? one is what the flight server reads and nothing else: a deep copy of a handoff keeps working and holds `{}`.
  static #carried(reference: unknown): unknown {
    const { $$typeof, $$id, $$async } = reference as { $$typeof?: symbol; $$id?: string; $$async?: boolean };
    if ($$typeof !== CLIENT_REFERENCE) return reference;
    return Object.freeze(
      Object.defineProperties(
        {},
        { $$typeof: { value: $$typeof }, $$id: { value: $$id }, $$async: { value: $$async } },
      ),
    );
  }

  //? Absent, never `undefined`: the flight payload of a server with no reference stays what it was.
  static of<Value extends Handoff>(handoff: Value): Value {
    const reference = state.references.get(handoff.refName);
    if (reference !== undefined) handoff._runtime = reference;
    else if ("_runtime" in handoff) delete handoff._runtime;
    return handoff;
  }

  //? One object per slice for every client of the process, so registering reaches a meta a module captured before it.
  static sliceOf(refName: string, sliceName: string, argLength: number): SliceMeta {
    const key = `${refName}/${sliceName}/${argLength}`;
    const meta = state.slices.get(key) ?? ModelRuntimes.of({ refName, sliceName, argLength });
    state.slices.set(key, meta);
    return meta;
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
      let payload: Handoff | undefined;
      const modelOf = (modelObj: object) => (model ??= new cnst.full(modelObj));
      const payloadOf = (modelObj: object) => {
        payload ??= { refName, [names.modelObj]: modelObj, [names.modelViewAt]: new Date() };
        return ModelRuntimes.of(payload);
      };
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
