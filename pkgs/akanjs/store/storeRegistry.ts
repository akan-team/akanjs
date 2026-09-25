import {
  ACTION_META,
  type MergeAllKeyOfObjects,
  type MergeAllKeyOfTypes,
  type MergeAllTypes,
  STATE_DERIVED_META,
  STATE_INIT_META,
  STATE_META,
} from "akanjs/base";
import { applyMixins } from "akanjs/common";
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
  static register<StrCls extends StoreCls>(store: StrCls): StrCls {
    const parentStore = Object.getPrototypeOf(store) as StoreCls | null;
    const actions = { ...(parentStore?.[ACTION_META] ?? {}) };
    Object.entries(Object.getOwnPropertyDescriptors(store.prototype)).forEach(([key, descriptor]) => {
      if (key === "constructor") return;
      if (!descriptor.value || typeof descriptor.value !== "function") return;
      actions[key] = descriptor.value;
    });
    store[ACTION_META] = actions;
    StoreRegistry.#state.store.set(store.refName, store);
    return store;
  }
  static get(refName: string) {
    return StoreRegistry.#state.store.get(refName);
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
    return StoreRegistry.#state.instance.addStore(store) as unknown as WithSelectors<RtStoreCls>;
  }
}
