// Desktop: a JSON file in the app data folder, owned by the Bun Worker.
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { AkanNativeError } from "../../../packages/core/src/index.ts";
import { type DesktopContext, defineDesktopPlugin } from "../../../packages/desktop/src/plugin.ts";
import type { PreferencesApi } from "./index.ts";

let store: Map<string, string> | null = null;
let path = "";

function load(ctx: DesktopContext): Map<string, string> {
  const file = join(ctx.appDataDir, "preferences.json");
  if (store && path === file) return store;
  path = file;
  store = new Map();
  if (existsSync(path)) {
    try {
      const data = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
      for (const [key, value] of Object.entries(data)) if (typeof value === "string") store.set(key, value);
    } catch (error) {
      console.error(`[akan-native] ${path} is unreadable, starting empty`, error);
    }
  }
  return store;
}

function save(): void {
  // Write-then-rename so a crash never leaves a half-written file.
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, JSON.stringify(Object.fromEntries(store!), null, 2));
  renameSync(tmp, path);
}

function checkKey(key: unknown): string {
  if (typeof key !== "string" || key.length === 0)
    throw new AkanNativeError("INVALID_ARGS", "key must be a non-empty string");
  return key;
}

export default defineDesktopPlugin<PreferencesApi>({
  id: "preferences",
  methods: {
    get: (args, ctx) => ({ value: load(ctx).get(checkKey(args?.key)) ?? null }),
    set(args, ctx) {
      const key = checkKey(args?.key);
      if (typeof args.value !== "string") throw new AkanNativeError("INVALID_ARGS", "value must be a string");
      load(ctx).set(key, args.value);
      save();
    },
    remove(args, ctx) {
      if (load(ctx).delete(checkKey(args?.key))) save();
    },
    keys: (_args, ctx) => ({ keys: [...load(ctx).keys()] }),
    clear(_args, ctx) {
      load(ctx).clear();
      save();
    },
  },
});
