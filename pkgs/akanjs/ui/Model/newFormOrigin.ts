"use client";
import { useSyncExternalStore } from "react";

interface OriginRegistry {
  origins: Map<string, string>;
  listeners: Set<() => void>;
}

const globalWithOrigins = globalThis as typeof globalThis & { __AKAN_NEW_FORM_ORIGIN__?: OriginRegistry };
//? On globalThis: the trigger and the editor can sit in two client bundles, each with its own copy of this module.
globalWithOrigins.__AKAN_NEW_FORM_ORIGIN__ ??= { origins: new Map(), listeners: new Set() };
const registry = globalWithOrigins.__AKAN_NEW_FORM_ORIGIN__;

//* Which slice's create button opened a model's new form. The store keeps one `<model>Modal` per model, so two
//* `Model.New`s of one model on a screen would both open; a form opened any other way names no slice and opens as
//* it always did.
export class NewFormOrigin {
  static set(model: string, sliceName: string) {
    if (registry.origins.get(model) === sliceName) return;
    registry.origins.set(model, sliceName);
    NewFormOrigin.#notify();
  }

  static clear(model: string) {
    if (registry.origins.delete(model)) NewFormOrigin.#notify();
  }

  static get(model: string) {
    return registry.origins.get(model) ?? null;
  }

  static use(model: string) {
    return useSyncExternalStore(
      NewFormOrigin.#subscribe,
      () => NewFormOrigin.get(model),
      () => null,
    );
  }

  static #subscribe(listener: () => void) {
    registry.listeners.add(listener);
    return () => registry.listeners.delete(listener);
  }

  static #notify() {
    for (const listener of registry.listeners) listener();
  }
}
