"use client";
import { fetch, isClientRuntimeRegistered } from "akanjs/client";
import { modelNames } from "akanjs/common";

interface LightRow {
  id: string;
}

// Rows a control holds but its option list lacks. Not the model's store: that singleton would overwrite the listing
// on screen, which is also why `Data/RefPicker` keeps its rows local.
export class LightRefCache {
  static #rows = new Map<string, LightRow | null>();
  static #inflight = new Map<string, Promise<void>>();
  static #listeners = new Set<(refName: string, id: string) => void>();

  static get<Light extends LightRow>(refName: string, id: string) {
    return (LightRefCache.#rows.get(LightRefCache.#keyOf(refName, id)) ?? null) as Light | null;
  }
  static subscribe(listener: (refName: string, id: string) => void) {
    LightRefCache.#listeners.add(listener);
    return () => {
      LightRefCache.#listeners.delete(listener);
    };
  }
  static load(refName: string, ids: string[]) {
    for (const id of ids) LightRefCache.#read(refName, id);
  }
  static reset() {
    LightRefCache.#rows.clear();
    LightRefCache.#inflight.clear();
  }
  static #keyOf(refName: string, id: string) {
    return `${refName}:${id}`;
  }
  // An unreadable row is remembered as `null`, not retried: `light<Model>` guards can be narrower than the slice, and
  // a removed row answers the same every time. An unregistered runtime is no answer, so nothing is remembered.
  static #read(refName: string, id: string) {
    const key = LightRefCache.#keyOf(refName, id);
    if (LightRefCache.#rows.has(key) || LightRefCache.#inflight.has(key)) return;
    if (!isClientRuntimeRegistered()) return;
    const read = (fetch as unknown as { [key: string]: unknown })[modelNames(refName).lightModel];
    if (typeof read !== "function") {
      LightRefCache.#write(refName, id, null);
      return;
    }
    LightRefCache.#inflight.set(
      key,
      (read as (id: string) => Promise<LightRow | null>)(id)
        .then((row) => {
          LightRefCache.#write(refName, id, row?.id ? row : null);
        })
        .catch(() => {
          LightRefCache.#write(refName, id, null);
        })
        .finally(() => {
          LightRefCache.#inflight.delete(key);
        }),
    );
  }
  static #write(refName: string, id: string, row: LightRow | null) {
    LightRefCache.#rows.set(LightRefCache.#keyOf(refName, id), row);
    for (const listener of LightRefCache.#listeners) listener(refName, id);
  }
}
