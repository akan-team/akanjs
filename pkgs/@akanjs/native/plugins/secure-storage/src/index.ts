import { definePlugin } from "../../../packages/core/src/index.ts";

/**
 * Small secrets (tokens, keys, passwords) kept by the OS credential store, encrypted at rest.
 * Same shape as @akanjs/native/plugins/preferences; store JSON yourself for structured data.
 *
 * - iOS: Keychain generic passwords, readable after the first unlock, never synced or restored
 *   to another device. Keychain items survive uninstalling the app.
 * - Android: values encrypted with an AES-256-GCM key that never leaves AndroidKeyStore.
 *   Uninstalling deletes them; values whose key is gone (device transfer) read as null.
 * - macOS: values encrypted with a key kept in the login Keychain (see src/desktop.ts for
 *   what that protects against).
 * - Windows: the same, with the key in the Credential Manager (a generic credential).
 * - Linux: the same, with the key in the Secret Service (the login keyring of gnome-keyring,
 *   KWallet or KeePassXC). UNSUPPORTED in a session without one.
 * - Web: UNSUPPORTED. A browser has no secret store; do not fall back to localStorage.
 *
 * No hook on purpose: secrets are read where they are used (an API client), not rendered.
 */
export interface SecureStorageApi {
  /** `{ value: null }` when the key is not stored. */
  get(args: { key: string }): Promise<{ value: string | null }>;
  set(args: { key: string; value: string }): Promise<void>;
  remove(args: { key: string }): Promise<void>;
  /** Stored keys, sorted. */
  keys(): Promise<{ keys: string[] }>;
  /** Removes every key of this app. */
  clear(): Promise<void>;
}

export const secureStorage = definePlugin<SecureStorageApi>("secure-storage", {
  methods: ["get", "set", "remove", "keys", "clear"],
});
