import { AkanNativeError, defineWebPlugin } from "../../../packages/core/src/index.ts";
import type { PreferencesApi } from "./index.ts";

// Same approach as capacitor-plugins/preferences/src/web.ts: a prefix inside
// localStorage so clear() and keys() only touch this plugin's entries.
const PREFIX = "akan-native.preferences.";

function storage(): Storage {
  try {
    return window.localStorage;
  } catch (error) {
    // Blocked storage (private mode, disabled site data) throws on access.
    throw new AkanNativeError("UNSUPPORTED", "localStorage is not available", { cause: error });
  }
}

function checkKey(key: unknown): string {
  if (typeof key !== "string" || key.length === 0)
    throw new AkanNativeError("INVALID_ARGS", "key must be a non-empty string");
  return key;
}

function ownKeys(store: Storage): string[] {
  const keys: string[] = [];
  for (let i = 0; i < store.length; i++) {
    const key = store.key(i);
    if (key?.startsWith(PREFIX)) keys.push(key);
  }
  return keys;
}

export const web = defineWebPlugin<PreferencesApi>({
  methods: {
    async get(args) {
      return { value: storage().getItem(PREFIX + checkKey(args?.key)) };
    },
    async set(args) {
      const key = checkKey(args?.key);
      if (typeof args.value !== "string") throw new AkanNativeError("INVALID_ARGS", "value must be a string");
      try {
        storage().setItem(PREFIX + key, args.value);
      } catch (error) {
        throw new AkanNativeError("INTERNAL", `could not store ${key}: ${String(error)}`, { cause: error });
      }
    },
    async remove(args) {
      storage().removeItem(PREFIX + checkKey(args?.key));
    },
    async keys() {
      return { keys: ownKeys(storage()).map((k) => k.slice(PREFIX.length)) };
    },
    async clear() {
      const store = storage();
      for (const key of ownKeys(store)) store.removeItem(key);
    },
  },
});
