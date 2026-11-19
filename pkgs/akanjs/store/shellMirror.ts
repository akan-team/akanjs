import { ShellState, type ShellStateValue } from "akanjs/client";
import { DraftStore } from "./draftStore";
import type { StoreInstance } from "./storeInstance";

declare global {
  var __AKAN_SHELL_MIRROR__: StoreInstance | undefined;
}

type MirroredState = { [key: string]: unknown };

export class ShellMirror {
  static bind(instance: StoreInstance) {
    if (typeof window === "undefined" || globalThis.__AKAN_SHELL_MIRROR__ === instance) return;
    globalThis.__AKAN_SHELL_MIRROR__ = instance;
    //? The shell goes first: a store loaded by a later page finds the shell already past its starting state.
    ShellMirror.#toStore(instance);
    ShellState.subscribe(() => ShellMirror.#toStore(instance));
    instance.subscribe(() => ShellMirror.#toShell(instance));
    let sized = false;
    ShellState.onMount(() => {
      const devMode = localStorage.getItem("devMode");
      if (devMode) void instance.do.setDevMode(devMode === "true");
      void DraftStore.reconcileIdentity().then(() => DraftStore.sweep());
      if (sized) return;
      sized = true;
      const setWindowSize = () => {
        void instance.do.setWindowSize();
      };
      setWindowSize();
      window.addEventListener("resize", setWindowSize);
    });
  }

  static #toStore(instance: StoreInstance) {
    const shell = ShellState.get() as unknown as MirroredState;
    const state = instance.get();
    const patch: MirroredState = {};
    for (const key of ShellState.keys) if (key in state && !Object.is(state[key], shell[key])) patch[key] = shell[key];
    if (Object.keys(patch).length) instance.set(patch);
  }

  static #toShell(instance: StoreInstance) {
    const shell = ShellState.get() as unknown as MirroredState;
    const state = instance.get();
    const patch: MirroredState = {};
    for (const key of ShellState.keys) if (key in state && !Object.is(state[key], shell[key])) patch[key] = state[key];
    if (Object.keys(patch).length) ShellState.set(patch as Partial<ShellStateValue>);
  }
}
