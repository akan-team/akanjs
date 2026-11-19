import { parseSearchParams } from "akanjs/common";
import type { PageState } from "./csrTypes";
import { defaultPageState } from "./frameConfig";
import { useSyncExternalStore } from "./shellStateHooks";

export interface ShellMessage {
  type: "info" | "success" | "error" | "warning" | "loading";
  content: string;
  /** Seconds. */
  duration: number;
  key: string;
}

export interface ShellStateValue {
  path: string;
  pathname: string;
  params: { [key: string]: string };
  searchParams: { [key: string]: string | string[] };
  theme: string;
  uiOperation: "sleep" | "loading" | "idle";
  messages: ShellMessage[];
  keyboardHeight: number;
  pageState: PageState;
}

interface ShellStateStore {
  state: ShellStateValue;
  initial: ShellStateValue;
  listeners: Set<() => void>;
  mounts: number;
  mountListeners: Set<() => void>;
}

declare global {
  var __AKAN_SHELL_STATE__: ShellStateStore | undefined;
}

const shownMessageLimit = 7;

/**
 * What the page shell (`System`, `Link`, the toasts) reads and writes, so a page that uses no store does not load one.
 * `akanjs/store` copies each key to and from its own state of the same name once it is on the page.
 */
export class ShellState {
  static readonly keys = [
    "path",
    "pathname",
    "params",
    "searchParams",
    "theme",
    "uiOperation",
    "messages",
    "keyboardHeight",
    "pageState",
  ] as const satisfies readonly (keyof ShellStateValue)[];

  static initial(): ShellStateValue {
    return {
      path: "/",
      pathname: typeof window !== "undefined" ? window.location.pathname : "/",
      params: {},
      //? Read before hydration, so an SSR page's first browser render sees the params its server render did.
      searchParams: typeof window !== "undefined" ? parseSearchParams(window.location.search) : {},
      theme: "system",
      uiOperation: "sleep",
      messages: [],
      keyboardHeight: 0,
      pageState: { ...defaultPageState },
    };
  }

  //? On `globalThis`: this file is bundled into more than one browser chunk, and each copy must see one state.
  static #store(): ShellStateStore {
    if (!globalThis.__AKAN_SHELL_STATE__) {
      const initial = ShellState.initial();
      globalThis.__AKAN_SHELL_STATE__ = {
        state: initial,
        initial,
        listeners: new Set(),
        mounts: 0,
        mountListeners: new Set(),
      };
    }
    return globalThis.__AKAN_SHELL_STATE__;
  }

  static get(): ShellStateValue {
    return ShellState.#store().state;
  }

  static set(patch: Partial<ShellStateValue>) {
    const store = ShellState.#store();
    const keys = (Object.keys(patch) as (keyof ShellStateValue)[]).filter(
      (key) => !Object.is(store.state[key], patch[key]),
    );
    if (!keys.length) return;
    store.state = { ...store.state, ...patch };
    for (const listener of [...store.listeners]) listener();
  }

  static subscribe(listener: () => void) {
    const { listeners } = ShellState.#store();
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }

  //? The server snapshot is the state the module started with, as the store's is: nothing on the server ever sets it.
  static use<Key extends keyof ShellStateValue>(key: Key): ShellStateValue[Key] {
    return useSyncExternalStore(
      ShellState.subscribe,
      () => ShellState.#store().state[key],
      () => ShellState.#store().initial[key],
    );
  }

  static messagesWith(messages: ShellMessage[], message: ShellMessage): ShellMessage[] {
    if (messages.some((shown) => shown.key === message.key))
      return messages.map((shown) => (shown.key === message.key ? message : shown));
    return [...(messages.length >= shownMessageLimit ? messages.slice(1) : messages), message];
  }

  static showMessage(message: Omit<Partial<ShellMessage>, "content"> & { content: string | string[] }) {
    const shown = { type: "info", duration: 3, key: Math.random().toString(36).slice(2, 15), ...message };
    ShellState.set({ messages: ShellState.messagesWith(ShellState.get().messages, shown as ShellMessage) });
  }

  static hideMessage(key: string) {
    ShellState.set({ messages: ShellState.get().messages.filter((message) => message.key !== key) });
  }

  static mount() {
    const store = ShellState.#store();
    store.mounts += 1;
    for (const listener of [...store.mountListeners]) listener();
    return () => {
      store.mounts -= 1;
    };
  }

  static onMount(listener: () => void) {
    const store = ShellState.#store();
    store.mountListeners.add(listener);
    if (store.mounts > 0) listener();
    return () => {
      store.mountListeners.delete(listener);
    };
  }
}
