import {
  ACTION_META,
  ACTION_OWNER_META,
  FIELD_META,
  type MergeAllKeyOfObjects,
  type MergeAllKeyOfTypes,
  type MergeAllTypes,
  STATE_DERIVED_META,
  STATE_INIT_META,
  STATE_META,
} from "akanjs/base";
import { applyMixins } from "akanjs/common";
import { ConstantRegistry } from "akanjs/constant";
import { attachAgentic } from "./agentic";
import { formSetterNames } from "./formSetterNames";
import type { RootStoreCls } from "./rootStore";
import type { StoreCls } from "./store";
import { StoreInstance } from "./storeInstance";

export type { ReactAPI } from "./storeInstance";

import type { SerializedSlice } from "akanjs/signal";
import { mergeDerivedMeta } from "./stateBuilder";
import type { SetGet } from "./types";
import type { WithSelectors } from "./withSelector";

const STORE_REGISTRY_KEY = Symbol.for("akanjs.store.registry");

interface StoreRegistryState {
  instance: StoreInstance;
  store: Map<string, StoreCls>;
}

function getStoreRegistryState(): StoreRegistryState {
  const globalStore = globalThis as typeof globalThis & { [STORE_REGISTRY_KEY]?: StoreRegistryState };
  globalStore[STORE_REGISTRY_KEY] ??= {
    instance: new StoreInstance(),
    store: new Map<string, StoreCls>(),
  };
  return globalStore[STORE_REGISTRY_KEY];
}

export class StoreRegistry {
  static #state = getStoreRegistryState();
  /** The one store every `st.use` / `st.do` in the process goes through. What an agent bridge drives. */
  static get instance(): StoreInstance {
    return StoreRegistry.#state.instance;
  }
  static register<StrCls extends StoreCls>(store: StrCls): StrCls {
    const parentStore = Object.getPrototypeOf(store) as StoreCls | null;
    const actions = { ...(parentStore?.[ACTION_META] ?? {}) };
    // A subclass body is the only place a module's own action names the module that wrote it: `store()` stamped
    // the generated ones before this class existed.
    const owners = { ...(parentStore?.[ACTION_OWNER_META] ?? {}) };
    Object.entries(Object.getOwnPropertyDescriptors(store.prototype)).forEach(([key, descriptor]) => {
      if (key === "constructor") return;
      if (!descriptor.value || typeof descriptor.value !== "function") return;
      actions[key] = descriptor.value;
      owners[key] = { refName: store.refName };
    });
    store[ACTION_META] = actions;
    store[ACTION_OWNER_META] = owners;
    StoreRegistry.#state.store.set(store.refName, store);
    StoreRegistry.#warnUnknownPostSetHooks(store);
    return store;
  }

  /**
   * A `_postSet<Field>` hook cannot be typed — the generated setters live in a mapped type, so every name the base
   * declares is a property a subclass method may not redeclare (TS2425), and the hook only compiles because the base
   * declares nothing under it. A misspelled field would therefore never fire and never complain, so say so here.
   */
  static #warnUnknownPostSetHooks(store: StoreCls) {
    const hooks = Object.keys(Object.getOwnPropertyDescriptors(store.prototype)).filter((key) =>
      key.startsWith("_postSet"),
    );
    if (!hooks.length) return;
    const model = ConstantRegistry.getDatabase(store.refName, { allowEmpty: true });
    if (!model) return;
    const known = new Set(
      Object.keys(model.full[FIELD_META] as object).map((key) => formSetterNames("", key).postSetField),
    );
    for (const hook of hooks.filter((key) => !known.has(key)))
      console.warn(`[${store.refName}Store] ${hook} matches no field of ${store.refName}, so it will never run.`);
  }
  static get(refName: string) {
    return StoreRegistry.#state.store.get(refName);
  }
  /** Every registered module store by refName. What the agent surface derives key ownership and exposure from. */
  static get stores(): ReadonlyMap<string, StoreCls> {
    return StoreRegistry.#state.store;
  }
  static merge<RefName extends string, StoreClses extends (StoreCls | RootStoreCls)[]>(
    refName: RefName,
    ...stores: StoreClses
  ): RootStoreCls<
    RefName,
    MergeAllKeyOfObjects<StoreClses, typeof STATE_META>,
    MergeAllTypes<StoreClses, keyof SetGet | "slice">,
    MergeAllKeyOfTypes<StoreClses, "slice">,
    MergeAllKeyOfObjects<StoreClses, "_slice">
  > {
    class RootStore {
      static type = "root";
      static refName = refName;
      static [STATE_META] = Object.assign({}, ...stores.map((store) => store[STATE_META]));
      static [STATE_INIT_META] = Object.assign({}, ...stores.map((store) => store[STATE_INIT_META]));
      static [STATE_DERIVED_META] = mergeDerivedMeta(...stores.map((store) => store[STATE_DERIVED_META]));
      static [ACTION_META] = Object.assign({}, ...stores.map((store) => store[ACTION_META]));
      static [ACTION_OWNER_META] = Object.assign({}, ...stores.map((store) => store[ACTION_OWNER_META] ?? {}));
      static slice: { [key: string]: { [key: string]: SerializedSlice } } = {};
    }
    stores.forEach((store) => {
      if (store.type === "root") Object.assign(RootStore.slice, store.slice);
      else RootStore.slice[store.refName] = store.slice;
    });
    applyMixins(RootStore, stores);
    return RootStore as any;
  }
  static build<RtStoreCls extends RootStoreCls>(store: RtStoreCls): WithSelectors<RtStoreCls> {
    return attachAgentic(StoreRegistry.#state.instance.addStore(store)) as unknown as WithSelectors<RtStoreCls>;
  }
}
