// Desktop: the page's store in packages/desktop/src/secretStore.ts, which says what it protects against.
import { join } from "node:path";
import { AkanNativeError } from "../../../packages/core/src/index.ts";
import { type DesktopContext, defineDesktopPlugin } from "../../../packages/desktop/src/plugin.ts";
import { createSecretStore, type SecretStore } from "../../../packages/desktop/src/secretStore.ts";
import type { SecureStorageApi } from "./index.ts";

export { decrypt, encrypt, quoteForSecurity } from "../../../packages/desktop/src/secretStore.ts";

export interface DesktopSecureStorageOptions {
  /** Keychain service of the data key. Default `<app id>.akan-native.secure-storage`. */
  service?: (ctx: DesktopContext) => string;
  /** The encrypted values. Default `<appDataDir>/secure-storage.json`. */
  file?: (ctx: DesktopContext) => string;
}

function checkKey(key: unknown): string {
  if (typeof key !== "string" || key.length === 0)
    throw new AkanNativeError("INVALID_ARGS", "key must be a non-empty string");
  return key;
}

export function createDesktopSecureStorage(options: DesktopSecureStorageOptions = {}) {
  const stores = new Map<string, SecretStore>();
  const storeFor = (ctx: DesktopContext): SecretStore => {
    const service = options.service?.(ctx) ?? `${ctx.app.id}.akan-native.secure-storage`;
    const file = options.file?.(ctx) ?? join(ctx.appDataDir, "secure-storage.json");
    const id = `${service}\0${file}`;
    let store = stores.get(id);
    if (!store) {
      store = createSecretStore({ service, file, label: `${ctx.app.name} secure storage`, shell: ctx.shell });
      stores.set(id, store);
    }
    return store;
  };

  return defineDesktopPlugin<SecureStorageApi>({
    id: "secure-storage",
    methods: {
      async get(args, ctx) {
        const name = checkKey(args?.key);
        return { value: await storeFor(ctx).get(name) };
      },
      async set(args, ctx) {
        const name = checkKey(args?.key);
        if (typeof args.value !== "string") throw new AkanNativeError("INVALID_ARGS", "value must be a string");
        await storeFor(ctx).set(name, args.value);
      },
      remove(args, ctx) {
        storeFor(ctx).remove(checkKey(args?.key));
      },
      async keys(_args, ctx) {
        return { keys: await storeFor(ctx).keys() };
      },
      clear(_args, ctx) {
        storeFor(ctx).clear();
      },
    },
  });
}

export default createDesktopSecureStorage();
