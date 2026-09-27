import { getEnv } from "akanjs/base";

type NativeModule = typeof import("./native");

interface ClientStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

const localStore: ClientStore = {
  get: async (key) => localStorage.getItem(key),
  set: async (key, value) => localStorage.setItem(key, value),
  remove: async (key) => localStorage.removeItem(key),
};

const nativeApp = async (): Promise<NativeModule | null> => {
  const native = await import("./native");
  return native.isNativeApp() ? native : null;
};

const inClient = async <T>(
  run: (store: ClientStore) => Promise<T>,
  nativeStore: (native: NativeModule) => ClientStore,
) => {
  const env = getEnv();
  if (env.side === "server") return;
  const native = env.renderMode === "csr" ? await nativeApp() : null;
  return await run(native ? nativeStore(native) : localStore);
};

const preferencesOf = ({ preferences }: NativeModule): ClientStore => ({
  get: async (key) => (await preferences.get({ key })).value,
  set: (key, value) => preferences.set({ key, value }),
  remove: (key) => preferences.remove({ key }),
});

//* iOS keeps Keychain items after the app is deleted, so a reinstall would sign in as whoever used it last. Preferences
//* go with the app, so a store without this install's marker is cleared before its first use.
const installMarkerKey = "akan:installed";
let freshInstall: Promise<void> | null = null;
const clearedOnReinstall = (native: NativeModule) =>
  (freshInstall ??= (async () => {
    if ((await native.preferences.get({ key: installMarkerKey })).value) return;
    await native.secureStorage.clear();
    await native.preferences.set({ key: installMarkerKey, value: "1" });
  })().catch((error: unknown) => {
    freshInstall = null;
    throw error;
  }));

const secureStorageOf = (native: NativeModule): ClientStore => ({
  get: async (key) => {
    await clearedOnReinstall(native);
    return (await native.secureStorage.get({ key })).value;
  },
  set: async (key, value) => {
    await clearedOnReinstall(native);
    await native.secureStorage.set({ key, value });
  },
  remove: async (key) => {
    await clearedOnReinstall(native);
    await native.secureStorage.remove({ key });
  },
});

/** Client key-value storage: the shell's preferences in a native app, localStorage in a browser. */
export const storage = {
  getItem: (key: string) => inClient((store) => store.get(key), preferencesOf),
  setItem: (key: string, value: string) => inClient((store) => store.set(key, value), preferencesOf),
  removeItem: (key: string) => inClient((store) => store.remove(key), preferencesOf),
};

/** Tokens: the OS credential store in a native app; a browser has none, so localStorage there. */
export const secretStorage = {
  getItem: (key: string) => inClient((store) => store.get(key), secureStorageOf),
  setItem: (key: string, value: string) => inClient((store) => store.set(key, value), secureStorageOf),
  removeItem: (key: string) => inClient((store) => store.remove(key), secureStorageOf),
};
