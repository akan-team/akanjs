"use client";
import { useEffect, useSyncExternalStore } from "react";

interface OriginRegistry {
  origins: Map<string, string>;
  editors: Map<string, Map<string, number>>;
  listeners: Set<() => void>;
}

declare global {
  var __AKAN_NEW_FORM_ORIGIN__: OriginRegistry | undefined;
}

//* Which slice's create button opened a model's new form. The store keeps one `<model>Modal` per model, so two
//* `Model.New`s of one model on a screen would both open. Only an editor of that slice opens it while one is mounted;
//* with none, or for a form no trigger opened, every new-form editor of the model does.
export class NewFormOrigin {
  static readonly #registry = NewFormOrigin.#internRegistry();

  //? On globalThis: the trigger and the editor can sit in two client bundles, each with its own copy of this module.
  static #internRegistry() {
    globalThis.__AKAN_NEW_FORM_ORIGIN__ ??= { origins: new Map(), editors: new Map(), listeners: new Set() };
    return globalThis.__AKAN_NEW_FORM_ORIGIN__;
  }

  static set(model: string, sliceName: string) {
    if (NewFormOrigin.#registry.origins.get(model) === sliceName) return;
    NewFormOrigin.#registry.origins.set(model, sliceName);
    NewFormOrigin.#notify();
  }

  static clear(model: string) {
    if (NewFormOrigin.#registry.origins.delete(model)) NewFormOrigin.#notify();
  }

  static get(model: string) {
    return NewFormOrigin.#registry.origins.get(model) ?? null;
  }

  static useEditor(model: string, sliceName: string, modal: string, takesNewForms: boolean) {
    useEffect(() => {
      if (!takesNewForms) return;
      return NewFormOrigin.#claim(model, NewFormOrigin.#keyOf(modal, sliceName));
    }, [model, sliceName, modal, takesNewForms]);
    return useSyncExternalStore(
      NewFormOrigin.#subscribe,
      () => NewFormOrigin.#opens(model, sliceName, modal),
      () => true,
    );
  }

  static #opens(model: string, sliceName: string, modal: string) {
    const origin = NewFormOrigin.get(model);
    return (
      !origin ||
      origin === sliceName ||
      !NewFormOrigin.#registry.editors.get(model)?.has(NewFormOrigin.#keyOf(modal, origin))
    );
  }

  static #claim(model: string, key: string) {
    const claims = NewFormOrigin.#registry.editors.get(model) ?? new Map<string, number>();
    NewFormOrigin.#registry.editors.set(model, claims);
    claims.set(key, (claims.get(key) ?? 0) + 1);
    NewFormOrigin.#notify();
    return () => {
      const count = (claims.get(key) ?? 1) - 1;
      if (count > 0) claims.set(key, count);
      else claims.delete(key);
      NewFormOrigin.#notify();
    };
  }

  static #keyOf(modal: string, sliceName: string) {
    return `${modal}|${sliceName}`;
  }

  static #subscribe(listener: () => void) {
    NewFormOrigin.#registry.listeners.add(listener);
    return () => NewFormOrigin.#registry.listeners.delete(listener);
  }

  static #notify() {
    for (const listener of NewFormOrigin.#registry.listeners) listener();
  }
}
