import type { Type } from "@akanjs/base";
import type { SerializedSignal } from "@akanjs/signal";

import { baseSt, makeStore } from "./storeDecorators";

interface StateAction {
  state: { [key: string]: any };
  action: { [key: string]: (...args: any) => void | Promise<void> };
}
export const storeInfo = {
  store: new Map<string, Type>(),
  storeRefNameMap: new Map<Type, string>(),
  setRefNameTemp(refName: string, store: Type) {
    Reflect.defineMetadata("akan:storeRefName", refName, store.prototype as object);
  },
  getRefNameTemp(store: Type) {
    const refName = Reflect.getMetadata("akan:storeRefName", store.prototype as object) as string | undefined;
    if (!refName) throw new Error(`No ref name for store: ${store}`);
    return refName;
  },
  setState(storeRef: Type, applyState: { [key: string]: any }) {
    const state = storeInfo.getState(storeRef);
    Object.assign(state, applyState);
    Reflect.defineMetadata("akan:store:state", state, storeRef.prototype as object);
  },
  getState(storeRef: Type) {
    const state = Reflect.getMetadata("akan:store:state", storeRef.prototype as object) as
      | { [key: string]: any }
      | undefined;
    return state ?? {};
  },
  applyAction(storeRef: Type) {
    const actionKeys = Object.getOwnPropertyNames(storeRef.prototype).filter((key) => key !== "constructor");
    const action = storeInfo.getAction(storeRef);
    const applyAction = Object.fromEntries(actionKeys.map((key) => [key, (storeRef.prototype as object)[key]]));
    Object.assign(action, applyAction);
    Reflect.defineMetadata("akan:store:action", action, storeRef.prototype as object);
  },
  getAction(storeRef: Type) {
    const action = Reflect.getMetadata("akan:store:action", storeRef.prototype as object) as
      | { [key: string]: (...args: any) => void | Promise<void> }
      | undefined;
    return action ?? {};
  },
  register<Store extends Type>(refName: string, storeRef: Store): Store {
    storeInfo.setRefNameTemp(refName, storeRef);
    storeInfo.applyAction(storeRef);
    storeInfo.store.set(refName, storeRef);
    return storeRef;
    // stores.forEach((store) => {
    //   const refName = storeInfo.getRefNameTemp(store);
    //   const storeMeta = getStoreMeta(refName);
    //   return function (target: Type) {
    //     const customDoKeys = Object.getOwnPropertyNames(target.prototype).filter((key) => key !== "constructor");
    //     setStoreMeta(refName, { ...storeMeta, doKeys: [...storeMeta.doKeys, ...customDoKeys] });
    //   };
    // });
  },
  buildStore(signals: SerializedSignal[]) {
    makeStore(baseSt, signals);
  },
};
