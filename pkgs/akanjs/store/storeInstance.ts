import { ACTION_META, STATE_DERIVED_META, STATE_INIT_META } from "akanjs/base";
import { Translator } from "akanjs/client";
import { capitalize, Logger, parseAkanI18nEnv } from "akanjs/common";
import { produce } from "immer";
import type { RefObject } from "react";
import { useEffect, useRef, useSyncExternalStore } from "./hooks";
import type { RootStoreCls } from "./rootStore";
import type { SliceStateKey } from "./state";
import { evaluateInitializers, type SearchParamsState, type StateDerivedMeta } from "./stateBuilder";

type StoreStateRecord = Record<string, unknown>;
type StoreAction = (...args: unknown[]) => unknown;
type TranslationParam = Record<string, string | number>;

type SliceActionKey =
  | "initModel"
  | "refreshModel"
  | "selectModel"
  | "setPageOfModel"
  | "addPageOfModel"
  | "setLimitOfModel"
  | "setQueryArgsOfModel"
  | "setSortOfModel";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === "object" && !Array.isArray(value));

const getActionErrorKey = (error: unknown) => {
  if (typeof error === "string") return error;
  if (!isRecord(error)) return String(error);
  if (typeof error.error === "string") return error.error;
  if (typeof error.message === "string") return error.message;
  return String(error);
};

const getActionErrorData = (error: unknown): TranslationParam | undefined => {
  if (!isRecord(error) || !isRecord(error.data)) return undefined;
  const data = Object.fromEntries(
    Object.entries(error.data).filter((entry): entry is [string, string | number] =>
      ["string", "number"].includes(typeof entry[1]),
    ),
  );
  return Object.keys(data).length ? data : undefined;
};

export type ReactAPI = {
  useSyncExternalStore: <T>(
    subscribe: (onStoreChange: () => void) => () => void,
    getSnapshot: () => T,
    getServerSnapshot?: () => T,
  ) => T;
  useRef: <T>(initialValue: T) => { current: T };
  useEffect: (effect: () => (() => void) | void, deps?: any[]) => void;
};

export class StoreInstance {
  #state: StoreStateRecord = {};
  #listeners = new Set<() => void>();
  #derivedMeta: StateDerivedMeta = { persistSession: {}, search: {}, computed: {}, derivedKeys: new Set() };

  get = (): StoreStateRecord => this.#state;

  set = (stateOrUpdater: StoreStateRecord | ((state: StoreStateRecord) => void)) => {
    const prev = this.#state;
    if (typeof stateOrUpdater === "function") {
      this.#state = produce(this.#state, stateOrUpdater);
    } else {
      this.#state = { ...this.#state, ...stateOrUpdater };
    }
    this.#assertNoDerivedMutation(stateOrUpdater);
    this.#state = this.#materializeDerived(this.#state, prev);
    this.#syncPersistSession(prev, this.#state);
    this.#notify();
  };

  #pick = (...fields: string[]) => {
    const ret = {} as StoreStateRecord;
    for (const field of fields) {
      const val = this.#state[field];
      if (val === null || val === undefined || val === "") throw new Error(`Field ${field} is not ready`);
      ret[field] = val;
    }
    return ret;
  };

  #ctx: Record<string, unknown> = { set: this.set, get: this.get, pick: this.#pick };

  subscribe = (listener: () => void) => {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  };

  sub: {
    (listener: (state: StoreStateRecord, prev: StoreStateRecord) => void): () => void;
    <U>(
      selector: (state: StoreStateRecord) => U,
      listener: (state: U, prev: U) => void,
      options?: { equalityFn?: (a: U, b: U) => boolean; fireImmediately?: boolean },
    ): () => void;
  } = ((...args: any[]) => {
    if (args.length === 1 && typeof args[0] === "function") {
      const listener = args[0] as (state: StoreStateRecord, prev: StoreStateRecord) => void;
      let prev = this.#state;
      const wrapped = () => {
        const next = this.#state;
        listener(next, prev);
        prev = next;
      };
      this.#listeners.add(wrapped);
      return () => {
        this.#listeners.delete(wrapped);
      };
    }
    const [selector, listener, options] = args as [
      (state: StoreStateRecord) => unknown,
      (state: unknown, prev: unknown) => void,
      { equalityFn?: (a: any, b: any) => boolean; fireImmediately?: boolean } | undefined,
    ];
    const equalityFn = options?.equalityFn ?? Object.is;
    let prev = selector(this.#state);
    const wrapped = () => {
      const next = selector(this.#state);
      if (!equalityFn(next, prev)) {
        const p = prev;
        prev = next;
        listener(next, p);
      }
    };
    this.#listeners.add(wrapped);
    if (options?.fireImmediately) listener(prev, prev);
    return () => {
      this.#listeners.delete(wrapped);
    };
  }) as any;

  sel = <U>(selector: (state: StoreStateRecord) => U, equals?: (a: U, b: U) => boolean) => {
    const eq = equals ?? Object.is;
    return useSyncExternalStore(
      (onStoreChange: () => void) => {
        let prev = selector(this.#state);
        const listener = () => {
          const next = selector(this.#state);
          if (!eq(next, prev)) {
            prev = next;
            onStoreChange();
          }
        };
        return this.subscribe(listener);
      },
      () => selector(this.#state),
      () => selector(this.#state),
    );
  };

  ref = <U>(selector: (state: StoreStateRecord) => U): RefObject<U> => {
    const ref = useRef(selector(this.get()));
    useEffect(
      () =>
        this.sub(selector, (val: U) => {
          ref.current = val;
        }),
      [],
    );
    return ref as RefObject<U>;
  };

  use: { [key: string]: () => unknown } = {};
  do: { [key: string]: StoreAction } = {};
  slice: { [key: string]: unknown } = {};

  constructor(store?: RootStoreCls) {
    if (store) this.addStore(store);
  }

  addStore(store: RootStoreCls) {
    this.#mergeDerivedMeta(store[STATE_DERIVED_META]);
    const newState = evaluateInitializers(store[STATE_INIT_META] ?? {});
    const hydratedState = this.#hydratePersistSession(newState);
    const derivedState = this.#materializeDerived({ ...this.#state, ...hydratedState }, this.#state);
    let hasNewStateKey = false;
    const nextState = { ...this.#state };
    for (const [key, value] of Object.entries(derivedState)) {
      if (key in nextState) continue;
      nextState[key] = value;
      hasNewStateKey = true;
    }
    if (hasNewStateKey) this.#state = nextState;
    this.#mergeActions(store[ACTION_META]);
    this.#extendAccessors(derivedState, store[ACTION_META]);
    this.#buildSlices(store);
    if (hasNewStateKey) this.#notify();
    return this;
  }

  #mergeActions(actions: { [key: string]: StoreAction }) {
    for (const [k, method] of Object.entries(actions)) {
      this.#ctx[k] = (...args: unknown[]) => method.call(this.#ctx, ...args);
    }
  }

  #extendAccessors(state: StoreStateRecord, actions: { [key: string]: StoreAction }) {
    for (const k of Object.keys(state)) {
      if (typeof state[k] !== "function") {
        this.use[k] = () => this.sel((s) => s[k]);
        if (this.#derivedMeta.derivedKeys.has(k)) continue;
        const setKey = `set${capitalize(k)}`;
        this.do[setKey] = (value: unknown) => this.set({ [k]: value });
      }
    }
    for (const k of Object.keys(actions)) {
      this.do[k] = async (...args: unknown[]) => {
        Logger.verbose(`${k} action loading...`);
        const start = Date.now();
        try {
          const result = await (this.#ctx[k] as StoreAction)(...args);
          Logger.verbose(`=> ${k} action dispatched (${Date.now() - start}ms)`);
          return result;
        } catch (error) {
          this.#showActionErrorMessage(k, error);
          Logger.error(`${k} action error return: ${error instanceof Error ? error.message : String(error)}`);
          throw error;
        }
      };
    }
  }

  #showActionErrorMessage(actionKey: string, error: unknown) {
    const showMessage = this.#ctx.showMessage;
    if (typeof showMessage !== "function") return;
    try {
      const lang = Translator.getActiveLocale() ?? parseAkanI18nEnv().defaultLocale;
      const errorKey = getActionErrorKey(error);
      const content = Translator.translateByLocale(lang, errorKey, getActionErrorData(error));
      showMessage({ type: "error", key: actionKey, duration: 3, content });
    } catch (messageError) {
      Logger.warn(
        `Failed to show ${actionKey} action error message: ${
          messageError instanceof Error ? messageError.message : String(messageError)
        }`,
      );
    }
  }

  #buildSlices(store: RootStoreCls) {
    Object.entries(store.slice).forEach(([refName, sliceObj]) => {
      Object.entries(sliceObj).forEach(([suffix, serializedSlice]) => {
        const sliceName = `${refName}${capitalize(suffix)}`;
        this.#buildSlice(refName, sliceName, serializedSlice);
      });
    });
  }

  #buildSlice(refName: string, sliceName: string, serializedSlice: { args?: any[] }) {
    const [fieldName, className] = [refName, capitalize(refName)];
    const names: { [key in SliceStateKey | SliceActionKey | "model" | "Model"]: string } = {
      model: fieldName,
      Model: className,
      defaultModel: `default${className}`,
      modelInsight: `${fieldName}Insight`,
      modelList: `${fieldName}List`,
      modelListLoading: `${fieldName}ListLoading`,
      modelInitList: `${fieldName}InitList`,
      modelInitAt: `${fieldName}InitAt`,
      modelStaleAt: `${fieldName}StaleAt`,
      pageOfModel: `pageOf${className}`,
      limitOfModel: `limitOf${className}`,
      queryArgsOfModel: `queryArgsOf${className}`,
      sortOfModel: `sortOf${className}`,
      modelSelection: `${fieldName}Selection`,
      initModel: `init${className}`,
      refreshModel: `refresh${className}`,
      selectModel: `select${className}`,
      setPageOfModel: `setPageOf${className}`,
      addPageOfModel: `addPageOf${className}`,
      setLimitOfModel: `setLimitOf${className}`,
      setQueryArgsOfModel: `setQueryArgsOf${className}`,
      setSortOfModel: `setSortOf${className}`,
      lastPageOfModel: `lastPageOf${className}`,
    };
    const SliceName = capitalize(sliceName);
    const namesOfSliceState: { [key in SliceStateKey]: string } = {
      defaultModel: SliceName.replace(names.Model, names.defaultModel),
      modelInitList: SliceName.replace(names.Model, names.modelInitList),
      modelInsight: sliceName.replace(names.model, names.modelInsight),
      modelList: sliceName.replace(names.model, names.modelList),
      modelListLoading: sliceName.replace(names.model, names.modelListLoading),
      modelInitAt: SliceName.replace(names.Model, names.modelInitAt),
      modelStaleAt: SliceName.replace(names.Model, names.modelStaleAt),
      lastPageOfModel: SliceName.replace(names.Model, names.lastPageOfModel),
      pageOfModel: SliceName.replace(names.Model, names.pageOfModel),
      limitOfModel: SliceName.replace(names.Model, names.limitOfModel),
      queryArgsOfModel: SliceName.replace(names.Model, names.queryArgsOfModel),
      sortOfModel: SliceName.replace(names.Model, names.sortOfModel),
      modelSelection: SliceName.replace(names.Model, names.modelSelection),
    };
    const namesOfSliceAction: { [key in SliceActionKey]: string } = {
      initModel: SliceName.replace(names.Model, names.initModel),
      refreshModel: SliceName.replace(names.Model, names.refreshModel),
      selectModel: SliceName.replace(names.Model, names.selectModel),
      setPageOfModel: SliceName.replace(names.Model, names.setPageOfModel),
      addPageOfModel: SliceName.replace(names.Model, names.addPageOfModel),
      setLimitOfModel: SliceName.replace(names.Model, names.setLimitOfModel),
      setQueryArgsOfModel: SliceName.replace(names.Model, names.setQueryArgsOfModel),
      setSortOfModel: SliceName.replace(names.Model, names.setSortOfModel),
    };

    const targetSlice: {
      do: { [key: string]: (...args: any[]) => void };
      use: { [key: string]: () => any };
      get: () => any;
      sliceName: string;
      refName: string;
      argLength: number;
    } = {
      do: {},
      use: {},
      get: () => ({}),
      sliceName,
      refName,
      argLength: serializedSlice.args?.length ?? 0,
    };

    for (const key of Object.keys(namesOfSliceAction) as SliceActionKey[]) {
      const rootActionKey = namesOfSliceAction[key];
      if (this.do[rootActionKey]) targetSlice.do[names[key]] = this.do[rootActionKey];
    }

    for (const key of Object.keys(namesOfSliceState) as SliceStateKey[]) {
      const rootStateKey = namesOfSliceState[key];
      if (this.use[rootStateKey]) targetSlice.use[names[key]] = this.use[rootStateKey];
      const setRootKey = `set${capitalize(rootStateKey)}`;
      const setLocalKey = `set${capitalize(names[key])}`;
      if (this.do[setRootKey]) targetSlice.do[setLocalKey] = this.do[setRootKey];
    }

    targetSlice.get = () => {
      const state = this.get();
      return Object.fromEntries(
        (Object.entries(namesOfSliceState) as [SliceStateKey, string][]).map(([key, value]) => [
          names[key],
          state[value],
        ]),
      );
    };

    (this.slice as any)[sliceName] = targetSlice;
  }

  #notify() {
    for (const listener of this.#listeners) listener();
  }

  #mergeDerivedMeta(meta?: StateDerivedMeta) {
    if (!meta) return;
    Object.assign(this.#derivedMeta.persistSession, meta.persistSession);
    Object.assign(this.#derivedMeta.search, meta.search);
    Object.assign(this.#derivedMeta.computed, meta.computed);
    for (const key of meta.derivedKeys) this.#derivedMeta.derivedKeys.add(key);
  }

  #hydratePersistSession(state: StoreStateRecord) {
    const next = { ...state };
    for (const [key, meta] of Object.entries(this.#derivedMeta.persistSession)) {
      if (!(key in next)) continue;
      const storage = this.#getStorage(meta.kind);
      if (!storage) continue;
      try {
        const raw = storage.getItem(meta.storageKey);
        if (raw === null) continue;
        next[key] = meta.parse(JSON.parse(raw));
      } catch (error) {
        Logger.warn(`Failed to hydrate ${meta.kind} state ${key}: ${String(error)}`);
        next[key] = meta.getDefault();
      }
    }
    return next;
  }

  #syncPersistSession(prev: StoreStateRecord, next: StoreStateRecord) {
    for (const [key, meta] of Object.entries(this.#derivedMeta.persistSession)) {
      if (Object.is(prev[key], next[key])) continue;
      const storage = this.#getStorage(meta.kind);
      if (!storage) continue;
      try {
        storage.setItem(meta.storageKey, JSON.stringify(meta.serialize(next[key])));
      } catch (error) {
        Logger.warn(`Failed to persist ${meta.kind} state ${key}: ${String(error)}`);
      }
    }
  }

  #materializeDerived(next: StoreStateRecord, prev: StoreStateRecord) {
    const materialized = { ...next };
    const changedKeys = new Set(Object.keys(materialized).filter((key) => !Object.is(materialized[key], prev[key])));
    const searchParams = (materialized.searchParams ?? {}) as SearchParamsState;
    for (const [key, meta] of Object.entries(this.#derivedMeta.search)) {
      const value = typeof window === "undefined" ? meta.getDefault() : meta.parseSearch(searchParams);
      if (!Object.is(materialized[key], value)) {
        materialized[key] = value;
        changedKeys.add(key);
      }
    }
    for (const [key, meta] of Object.entries(this.#derivedMeta.computed)) {
      if (key in materialized && !meta.deps.some((dep) => changedKeys.has(dep))) continue;
      const value = meta.selector(...meta.deps.map((dep) => materialized[dep]));
      if (!(key in materialized) || !meta.equals(materialized[key], value)) {
        materialized[key] = value;
        changedKeys.add(key);
      }
    }
    return materialized;
  }

  #assertNoDerivedMutation(stateOrUpdater: unknown) {
    if (!stateOrUpdater || typeof stateOrUpdater === "function") return;
    for (const key of Object.keys(stateOrUpdater)) {
      if (this.#derivedMeta.derivedKeys.has(key)) throw new Error(`Cannot set derived state directly: ${key}`);
    }
  }

  #getStorage(kind: "persist" | "session") {
    if (typeof window === "undefined") return null;
    try {
      return kind === "persist" ? window.localStorage : window.sessionStorage;
    } catch {
      return null;
    }
  }
}
