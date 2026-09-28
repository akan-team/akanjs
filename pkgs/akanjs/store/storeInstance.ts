import { ACTION_META, ACTION_OWNER_META, STATE_DERIVED_META, STATE_INIT_META } from "akanjs/base";
import { Translator } from "akanjs/client";
import { appState, isNativeApp } from "akanjs/client/native";
import { capitalize, type DynamicRecord, isRecord, Logger, parseAkanI18nEnv } from "akanjs/common";
import { ConstantRegistry } from "akanjs/constant";
import type { SerializedArg } from "akanjs/signal";
import { enableMapSet, produce } from "immer";
import type { RefObject } from "react";
import { type AgentGate, useAgentGate, useScopePath } from "use-agentic";
import { type ActionOwner, actionTagOf, tagAction } from "./actionTag";
import { useFormTools } from "./agentic/useFormTools";
import { DraftStore } from "./draftStore";
import { useEffect, useRef, useSyncExternalStore } from "./hooks";
import type { RootStoreCls } from "./rootStore";
import { sliceKeysOf } from "./sliceKeys";
import type { SliceActionKey, SliceActionRole, SliceStateRole } from "./sliceRole";
import type { DraftState, SliceStateKey } from "./state";
import { evaluateInitializers, type SearchParamsState, type StateDerivedMeta } from "./stateBuilder";
import type { StoreUseOptions } from "./types";

enableMapSet();

type StoreStateRecord = Record<string, unknown>;

const DRAFT_DEBOUNCE_MS = 400;
type StoreAction = (...args: unknown[]) => unknown;
type TranslationParam = Record<string, string | number>;

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
  // What the server rendered: initializers only, since nothing on the server ever calls `set`.
  #serverState: StoreStateRecord = {};
  #listeners = new Set<() => void>();
  #derivedMeta: StateDerivedMeta = { drafts: {}, persistSession: {}, search: {}, computed: {}, derivedKeys: new Set() };
  #draftTimers = new Map<string, ReturnType<typeof setTimeout>>();
  #draftFlushBound = false;

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
    this.#syncDrafts(prev, this.#state);
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
    let serverSnapshot: { value: U } | null = null;
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
      // React hydrates each Suspense boundary in its own pass, after earlier boundaries' effects already wrote the store.
      () => {
        serverSnapshot ??= { value: selector(this.#serverState) };
        return serverSnapshot.value;
      },
    );
  };

  retainLive = (key: string, scopeKey = "", gate: AgentGate | null = null) => {
    const scopes = this.#liveKeys.get(key) ?? new Map<string, Map<AgentGate | null, number>>();
    const gates = scopes.get(scopeKey) ?? new Map<AgentGate | null, number>();
    gates.set(gate, (gates.get(gate) ?? 0) + 1);
    scopes.set(scopeKey, gates);
    this.#liveKeys.set(key, scopes);
  };

  releaseLive = (key: string, scopeKey = "", gate: AgentGate | null = null) => {
    const gates = this.#liveKeys.get(key)?.get(scopeKey);
    if (!gates) return;
    const count = gates.get(gate) ?? 0;
    if (count <= 1) gates.delete(gate);
    else gates.set(gate, count - 1);
    if (gates.size) return;
    const scopes = this.#liveKeys.get(key);
    scopes?.delete(scopeKey);
    if (!scopes?.size) this.#liveKeys.delete(key);
  };

  #useLive(key: string, count = true) {
    // Retention is tagged with the ambient agent scope, so a zone session sees only the keys its own subtree reads,
    // and with its gate, so a page kept mounted under the current one stops lending the screen its keys.
    const scopeKey = useScopePath().join(".");
    const gate = useAgentGate();
    useEffect(() => {
      if (!count) return;
      this.retainLive(key, scopeKey, gate);
      return () => {
        this.releaseLive(key, scopeKey, gate);
      };
    }, [key, count, scopeKey, gate]);
  }

  // Keys are learned by running the selector over a recording proxy, once at mount: retained must equal released.
  #useLiveSelector(selector: (state: StoreStateRecord) => unknown) {
    const scopeKey = useScopePath().join(".");
    const gate = useAgentGate();
    useEffect(() => {
      const keys = [...this.#touched(selector)];
      for (const key of keys) this.retainLive(key, scopeKey, gate);
      return () => {
        for (const key of keys) this.releaseLive(key, scopeKey, gate);
      };
    }, [scopeKey, gate]);
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
  readonly #liveKeys = new Map<string, Map<string, Map<AgentGate | null, number>>>();
  readonly #generatedSetters = new Set<string>();

  /** How many mounted components read each state key right now. */
  get liveKeys(): ReadonlyMap<string, number> {
    return this.liveKeysIn("");
  }

  /** Live keys retained at `viewKey`'s scope or below, behind no gate or an active one; `""` is the whole screen. */
  liveKeysIn(viewKey: string): ReadonlyMap<string, number> {
    const keys = new Map<string, number>();
    for (const [key, scopes] of this.#liveKeys) {
      let total = 0;
      for (const [scopeKey, gates] of scopes) {
        if (viewKey && scopeKey !== viewKey && !scopeKey.startsWith(`${viewKey}.`)) continue;
        for (const [gate, count] of gates) if (gate?.active ?? true) total += count;
      }
      if (total > 0) keys.set(key, total);
    }
    return keys;
  }

  get actionOwners(): ReadonlyMap<string, ActionOwner> {
    return this.#actionOwners;
  }

  /** Each method's own `length`: `do[key]` is a rest-argument wrapper whose `length` is 0. */
  get actionArity(): ReadonlyMap<string, number> {
    return this.#actionArity;
  }

  get sliceActionRoles(): ReadonlyMap<string, SliceActionRole> {
    return this.#sliceActionRoles;
  }

  get sliceStateRoles(): ReadonlyMap<string, SliceStateRole> {
    return this.#sliceStateRoles;
  }

  /** `search()` and `computed()` keys; `set` throws on them. */
  get derivedKeys(): ReadonlySet<string> {
    return this.#derivedMeta.derivedKeys;
  }

  /** The generated `set<Key>` setters for plain state keys; their value is untyped. */
  get generatedSetters(): ReadonlySet<string> {
    return this.#generatedSetters;
  }

  constructor(store?: RootStoreCls) {
    if (store) this.addStore(store);
  }

  addStore(store: RootStoreCls) {
    this.#mergeDerivedMeta(store[STATE_DERIVED_META]);
    const newState = evaluateInitializers(store[STATE_INIT_META] ?? {});
    this.#serverState = this.#withNewKeys(
      this.#serverState,
      this.#materializeDerived({ ...this.#serverState, ...newState }, this.#serverState, true),
    );
    const hydratedState = this.#hydratePersistSession(newState);
    const derivedState = this.#materializeDerived({ ...this.#state, ...hydratedState }, this.#state);
    const nextState = this.#withNewKeys(this.#state, derivedState);
    const hasNewStateKey = nextState !== this.#state;
    this.#state = nextState;
    for (const [key, owner] of Object.entries(store[ACTION_OWNER_META] ?? {})) this.#actionOwners.set(key, owner);
    this.#mergeActions(store[ACTION_META]);
    this.#extendAccessors(derivedState, store[ACTION_META]);
    this.#buildSlices(store);
    if (hasNewStateKey) this.#notify();
    return this;
  }

  #withNewKeys(state: StoreStateRecord, additions: StoreStateRecord) {
    const newKeys = Object.keys(additions).filter((key) => !(key in state));
    if (!newKeys.length) return state;
    return { ...state, ...Object.fromEntries(newKeys.map((key) => [key, additions[key]])) };
  }

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
        // Subscribing a `<model>Form` publishes its fill tool: the component that shows the form opts it in.
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
          await (this.#ctx[k] as StoreAction)(...args);
          Logger.verbose(`=> ${k} action dispatched (${Date.now() - start}ms)`);
        } catch (error) {
          this.#showActionErrorMessage(k, error);
          Logger.error(`${k} action error return: ${error instanceof Error ? error.message : String(error)}`);
          throw error;
        }
      };
      // Carried over, not rebuilt: a generated setter's tag holds the state path this wrapper cannot know.
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
        this.#buildSlice(refName, suffix, serializedSlice);
      });
    });
  }

  #buildSlice(refName: string, suffix: string, serializedSlice: { args?: SerializedArg[] }) {
    const sliceName = `${refName}${capitalize(suffix)}`;
    const names = sliceKeysOf(refName);
    const { state: namesOfSliceState, action: namesOfSliceAction } = sliceKeysOf(refName, suffix);
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
      targetSlice.do[names.action[key]] = this.do[rootActionKey];
      this.#sliceActionRoles.set(rootActionKey, { role: key, refName, sliceName, args });
    }

    for (const key of Object.keys(namesOfSliceState) as SliceStateKey[]) {
      const rootStateKey = namesOfSliceState[key];
      if (this.use[rootStateKey]) {
        targetSlice.use[names.state[key]] = this.use[rootStateKey];
        this.#sliceStateRoles.set(rootStateKey, { role: key, refName, sliceName });
      }
      const setRootKey = `set${capitalize(rootStateKey)}`;
      const setLocalKey = `set${capitalize(names.state[key])}`;
      if (this.do[setRootKey]) targetSlice.do[setLocalKey] = this.do[setRootKey];
    }

    targetSlice.get = () => {
      const state = this.get();
      return Object.fromEntries(
        (Object.entries(namesOfSliceState) as [SliceStateKey, string][]).map(([key, value]) => [
          names.state[key],
          state[value],
        ]),
      );
    };

    (this.slice as unknown as DynamicRecord)[sliceName] = targetSlice;
  }

  #notify() {
    for (const listener of this.#listeners) listener();
  }

  #mergeDerivedMeta(meta?: StateDerivedMeta) {
    if (!meta) return;
    Object.assign(this.#derivedMeta.drafts, meta.drafts);
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

  // The debounce lives in the store, not a component, so an editor unmounting mid-window still lands its last write.
  #syncDrafts(prev: StoreStateRecord, next: StoreStateRecord) {
    if (typeof window === "undefined") return;
    for (const meta of Object.values(this.#derivedMeta.drafts)) {
      const draft = next[meta.draftKey] as DraftState | null;
      if (!draft?.key) {
        this.#cancelDraftTimer(meta.formKey);
        continue;
      }
      if (Object.is(prev[meta.formKey], next[meta.formKey])) continue;
      // A `set` that also moves the draft slot (open, apply, restore, discard) is not typing, so it schedules nothing.
      if (!Object.is(prev[meta.draftKey], next[meta.draftKey])) continue;
      this.#armDraftFlush();
      this.#cancelDraftTimer(meta.formKey);
      this.#draftTimers.set(
        meta.formKey,
        setTimeout(() => {
          this.#draftTimers.delete(meta.formKey);
          void this.#writeDraft(meta.refName, meta.formKey, meta.draftKey);
        }, DRAFT_DEBOUNCE_MS),
      );
    }
  }

  #cancelDraftTimer(formKey: string) {
    const timer = this.#draftTimers.get(formKey);
    if (!timer) return;
    clearTimeout(timer);
    this.#draftTimers.delete(formKey);
  }

  async #writeDraft(refName: string, formKey: string, draftKey: string) {
    const draft = this.#state[draftKey] as DraftState | null;
    const form = this.#state[formKey] as object | null;
    if (!draft?.key || !form) return;
    try {
      const hash = DraftStore.formHash(refName, form);
      // Back at the opened value: a leftover record would offer to restore what is already on screen.
      if (hash === draft.baseHash) {
        await DraftStore.remove(draft.key);
        return;
      }
      await DraftStore.write(draft.key, {
        v: 1,
        savedAt: new Date().toISOString(),
        baseUpdatedAt: draft.baseUpdatedAt,
        form: DraftStore.encodeForm(refName, form),
      });
    } catch (error) {
      Logger.warn(`Failed to save the ${refName} form draft: ${String(error)}`);
    }
  }

  /** Writes every pending draft now, cancelling its debounce. */
  flushDrafts = () => {
    for (const [formKey, timer] of this.#draftTimers) {
      clearTimeout(timer);
      const meta = this.#derivedMeta.drafts[formKey];
      if (meta) void this.#writeDraft(meta.refName, meta.formKey, meta.draftKey);
    }
    this.#draftTimers.clear();
  };

  #armDraftFlush() {
    if (this.#draftFlushBound || typeof window === "undefined") return;
    this.#draftFlushBound = true;
    const onHide = () => {
      if (document.visibilityState === "hidden") this.flushDrafts();
    };
    // `pagehide` is the one a bfcache navigation and an iOS tab teardown both fire; `beforeunload` is not.
    window.addEventListener("pagehide", this.flushDrafts);
    document.addEventListener("visibilitychange", onHide);
    // iOS can suspend a webview without ever firing a page event, so the native lifecycle is the only warning.
    if (isNativeApp())
      appState.listen("change", ({ state }) => {
        if (state === "background") this.flushDrafts();
      });
  }

  #materializeDerived(next: StoreStateRecord, prev: StoreStateRecord, server = typeof window === "undefined") {
    const materialized = { ...next };
    const changedKeys = new Set(Object.keys(materialized).filter((key) => !Object.is(materialized[key], prev[key])));
    const searchParams = (materialized.searchParams ?? {}) as SearchParamsState;
    for (const [key, meta] of Object.entries(this.#derivedMeta.search)) {
      const value = server ? meta.getDefault() : meta.parseSearch(searchParams);
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
