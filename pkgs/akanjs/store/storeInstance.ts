import { ACTION_META, ACTION_OWNER_META, STATE_DERIVED_META, STATE_INIT_META } from "akanjs/base";
import { Translator } from "akanjs/client";
import { capitalize, Logger, parseAkanI18nEnv } from "akanjs/common";
import { ConstantRegistry } from "akanjs/constant";
import type { SerializedArg } from "akanjs/signal";
import { enableMapSet, produce } from "immer";
import type { RefObject } from "react";
import { useScopePath } from "use-agentic";
import { type ActionOwner, actionTagOf, tagAction } from "./actionTag";
import { useFormTools } from "./agentic/useFormTools";
import { useEffect, useRef, useSyncExternalStore } from "./hooks";
import type { RootStoreCls } from "./rootStore";
import type { SliceActionKey, SliceActionRole, SliceStateRole } from "./sliceRole";
import type { SliceStateKey } from "./state";
import { evaluateInitializers, type SearchParamsState, type StateDerivedMeta } from "./stateBuilder";
import type { StoreUseOptions } from "./types";

enableMapSet();

type StoreStateRecord = Record<string, unknown>;
type StoreAction = (...args: unknown[]) => unknown;
type TranslationParam = Record<string, string | number>;

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
    this.#useLiveSelector(selector);
    return this.#sel(selector, equals);
  };

  #sel = <U>(selector: (state: StoreStateRecord) => U, equals?: (a: U, b: U) => boolean) => {
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

  retainLive = (key: string, scopeKey = "") => {
    const scopes = this.#liveKeys.get(key) ?? new Map<string, number>();
    scopes.set(scopeKey, (scopes.get(scopeKey) ?? 0) + 1);
    this.#liveKeys.set(key, scopes);
  };

  releaseLive = (key: string, scopeKey = "") => {
    const scopes = this.#liveKeys.get(key);
    if (!scopes) return;
    const count = scopes.get(scopeKey) ?? 0;
    if (count <= 1) scopes.delete(scopeKey);
    else scopes.set(scopeKey, count - 1);
    if (!scopes.size) this.#liveKeys.delete(key);
  };

  #useLive(key: string, count = true) {
    // Retention is tagged with the ambient agent scope, so a zone session sees only the keys its own subtree reads.
    const scopeKey = useScopePath().join(".");
    useEffect(() => {
      if (!count) return;
      this.retainLive(key, scopeKey);
      return () => {
        this.releaseLive(key, scopeKey);
      };
    }, [key, count, scopeKey]);
  }

  /**
   * `sel` and `ref` take an opaque selector, so the keys it reads are learned by running it once over a recording
   * proxy. Captured at mount, like every surface declaration: the retained set must equal the released set, and a
   * selector is a new closure every render.
   */
  #useLiveSelector(selector: (state: StoreStateRecord) => unknown) {
    const scopeKey = useScopePath().join(".");
    useEffect(() => {
      const keys = [...this.#touched(selector)];
      for (const key of keys) this.retainLive(key, scopeKey);
      return () => {
        for (const key of keys) this.releaseLive(key, scopeKey);
      };
    }, [scopeKey]);
  }

  #touched(selector: (state: StoreStateRecord) => unknown) {
    const touched = new Set<string>();
    const proxy = new Proxy(this.#state, {
      get: (target, key) => {
        if (typeof key === "string") touched.add(key);
        return Reflect.get(target, key);
      },
    });
    try {
      selector(proxy as StoreStateRecord);
    } catch {
      // A selector that throws on the current state still counted every key it reached first.
    }
    return touched;
  }

  ref = <U>(selector: (state: StoreStateRecord) => U): RefObject<U> => {
    this.#useLiveSelector(selector);
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

  use: { [key: string]: (options?: StoreUseOptions) => unknown } = {};
  do: { [key: string]: StoreAction } = {};
  slice: { [key: string]: unknown } = {};

  readonly #sliceActionRoles = new Map<string, SliceActionRole>();
  readonly #sliceStateRoles = new Map<string, SliceStateRole>();
  readonly #actionArity = new Map<string, number>();
  readonly #actionOwners = new Map<string, ActionOwner>();
  readonly #liveKeys = new Map<string, Map<string, number>>();
  readonly #generatedSetters = new Set<string>();

  /**
   * How many mounted components are reading each state key right now. `st.use.*` is a hook, so subscription is
   * presence — this is how an agent context knows which keys the screen is actually built from.
   */
  get liveKeys(): ReadonlyMap<string, number> {
    return this.liveKeysIn("");
  }

  /**
   * The live keys as one zone view sees them: retentions tagged at the view's scope or below. The empty view is the
   * whole screen. Zones are views, not walls — a key read inside a zone counts for that zone and for the root alike.
   */
  liveKeysIn(viewKey: string): ReadonlyMap<string, number> {
    const keys = new Map<string, number>();
    for (const [key, scopes] of this.#liveKeys) {
      let total = 0;
      for (const [scopeKey, count] of scopes) {
        if (viewKey && scopeKey !== viewKey && !scopeKey.startsWith(`${viewKey}.`)) continue;
        total += count;
      }
      if (total > 0) keys.set(key, total);
    }
    return keys;
  }

  /** Which module declared each action. See `ActionOwner`. */
  get actionOwners(): ReadonlyMap<string, ActionOwner> {
    return this.#actionOwners;
  }

  /**
   * How many arguments each action declares.
   *
   * Recorded because `do[key]` is a rest-argument wrapper around the real method, so its own `length` is zero for
   * everything — the arity is gone by the time anyone holding the instance could ask. A rest parameter on the method
   * itself still reads as zero; nothing can recover that.
   */
  get actionArity(): ReadonlyMap<string, number> {
    return this.#actionArity;
  }

  /** What each generated slice key is, for a reader that has only the finished store. See `SliceActionRole`. */
  get sliceActionRoles(): ReadonlyMap<string, SliceActionRole> {
    return this.#sliceActionRoles;
  }

  get sliceStateRoles(): ReadonlyMap<string, SliceStateRole> {
    return this.#sliceStateRoles;
  }

  /** Keys the store materializes from a computation, the URL, or storage. `set` throws on them. */
  get derivedKeys(): ReadonlySet<string> {
    return this.#derivedMeta.derivedKeys;
  }

  /** The `set<Key>` conveniences `#extendAccessors` writes for every plain state key. Their value is untyped. */
  get generatedSetters(): ReadonlySet<string> {
    return this.#generatedSetters;
  }

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
    for (const [key, owner] of Object.entries(store[ACTION_OWNER_META] ?? {})) this.#actionOwners.set(key, owner);
    this.#mergeActions(store[ACTION_META]);
    this.#extendAccessors(derivedState, store[ACTION_META]);
    this.#buildSlices(store);
    if (hasNewStateKey) this.#notify();
    return this;
  }

  /** `<model>Form` for a model this client knows, or null — the only state key whose setters are worth publishing. */
  static #formRefNameOf(key: string) {
    if (!key.endsWith("Form")) return null;
    const refName = key.slice(0, -"Form".length);
    return ConstantRegistry.database.has(refName) ? refName : null;
  }

  #mergeActions(actions: { [key: string]: StoreAction }) {
    for (const [k, method] of Object.entries(actions)) {
      this.#ctx[k] = (...args: unknown[]) => method.call(this.#ctx, ...args);
      this.#actionArity.set(k, method.length);
    }
  }

  #extendAccessors(state: StoreStateRecord, actions: { [key: string]: StoreAction }) {
    for (const k of Object.keys(state)) {
      if (typeof state[k] !== "function") {
        // Reading a form is what publishes its field setters: the component that put the form on screen is the
        // one saying an agent may fill it, and no app writes `st.tool` once per field to say the same thing.
        const formRefName = StoreInstance.#formRefNameOf(k);
        this.use[k] = formRefName
          ? (options?: StoreUseOptions) => {
              const publish = options?.agent !== false;
              this.#useLive(k, publish);
              useFormTools(publish ? formRefName : null, (action, value) => {
                void (this.do[action] as ((value: unknown) => unknown) | undefined)?.(value);
              });
              return this.#sel((s) => s[k]);
            }
          : (options?: StoreUseOptions) => {
              this.#useLive(k, options?.agent !== false);
              return this.#sel((s) => s[k]);
            };
        if (this.#derivedMeta.derivedKeys.has(k)) continue;
        const setKey = `set${capitalize(k)}`;
        // A declared action of the same name (`setPageOfX` is a slice action) wins the key; no convenience setter.
        if (setKey in actions) continue;
        this.do[setKey] = tagAction((value: unknown) => this.set({ [k]: value }), { action: setKey, state: k });
        this.#actionArity.set(setKey, 1);
        this.#generatedSetters.add(setKey);
      }
    }
    for (const k of Object.keys(actions)) {
      const dispatch = async (...args: unknown[]) => {
        Logger.verbose(`${k} action loading...`);
        const start = Date.now();
        try {
          // action can return the result, but it is restricted to undefined, because of maintainability concerns
          const result = await (this.#ctx[k] as StoreAction)(...args);
          Logger.verbose(`=> ${k} action dispatched (${Date.now() - start}ms)`);
        } catch (error) {
          this.#showActionErrorMessage(k, error);
          Logger.error(`${k} action error return: ${error instanceof Error ? error.message : String(error)}`);
          throw error;
        }
      };
      // Carried over from the method rather than rebuilt, because a generated setter knows the state path it writes
      // and this wrapper does not. Everything else at least knows its own name.
      this.do[k] = tagAction(dispatch, actionTagOf(actions[k]) ?? { action: k });
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

  #buildSlice(refName: string, sliceName: string, serializedSlice: { args?: SerializedArg[] }) {
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

    const args = serializedSlice.args ?? [];
    for (const key of Object.keys(namesOfSliceAction) as SliceActionKey[]) {
      const rootActionKey = namesOfSliceAction[key];
      if (!this.do[rootActionKey]) continue;
      targetSlice.do[names[key]] = this.do[rootActionKey];
      this.#sliceActionRoles.set(rootActionKey, { role: key, refName, sliceName, args });
    }

    for (const key of Object.keys(namesOfSliceState) as SliceStateKey[]) {
      const rootStateKey = namesOfSliceState[key];
      if (this.use[rootStateKey]) {
        targetSlice.use[names[key]] = this.use[rootStateKey];
        this.#sliceStateRoles.set(rootStateKey, { role: key, refName, sliceName });
      }
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
