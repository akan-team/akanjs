// A namespace import: under React Server Components (react-server) react has no hooks, and named
// imports of them would fail when this module is linked (docs/api.md, O2-3).
import * as React from "react";
import { createLiveValue, definePlugin, type LiveValue } from "../../../packages/core/src/index.ts";
import { useLiveValue } from "../../../packages/react/src/index.ts";
import { web } from "./web.ts";

/** String key-value storage that survives app restarts. Store JSON yourself for structured data. */
export interface PreferencesApi {
  get(args: { key: string }): Promise<{ value: string | null }>;
  set(args: { key: string; value: string }): Promise<void>;
  remove(args: { key: string }): Promise<void>;
  keys(): Promise<{ keys: string[] }>;
  clear(): Promise<void>;
}

export const preferences = definePlugin<PreferencesApi>("preferences", {
  methods: ["get", "set", "remove", "keys", "clear"],
  web,
});

interface Entry {
  value: string | null;
  ready: boolean;
}

// One live value per key, so every component using the same key sees the same value.
const entries = new Map<string, LiveValue<Entry>>();

function entry(key: string): LiveValue<Entry> {
  let live = entries.get(key);
  if (!live) {
    const created = createLiveValue<Entry>({ value: null, ready: false }, (set) => {
      if (!created.get().ready) {
        preferences
          .get({ key })
          .then(({ value }) => {
            // A set() that finished first wins over this initial read.
            if (!created.get().ready) set({ value, ready: true });
          })
          .catch((error) => {
            console.warn(`[akan-native] preferences.get(${key}) failed`, error);
            set({ value: null, ready: true });
          });
      }
    });
    live = created;
    entries.set(key, created);
  }
  return live;
}

export type PreferenceSetter = (value: string | null) => Promise<void>;

/**
 * Reads and writes one key. `ready` is false until the stored value has loaded.
 * Setting null removes the key.
 */
export function usePreference(key: string): [value: string | null, set: PreferenceSetter, ready: boolean] {
  const live = entry(key);
  const { value, ready } = useLiveValue(live);
  const set = React.useCallback<PreferenceSetter>(
    async (next) => {
      const previous = live.get();
      live.set({ value: next, ready: true });
      try {
        await (next === null ? preferences.remove({ key }) : preferences.set({ key, value: next }));
      } catch (error) {
        live.set(previous);
        throw error;
      }
    },
    [key, live],
  );
  return [value, set, ready];
}
