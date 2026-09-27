// Live bindings for the boot values, so `import { env } from "./index.ts"` stays
// a plain object while tests can re-install a different host.

import type { AppInfo, Platform } from "./boot.ts";
import { runtime } from "./runtime.ts";

/**
 * The PUBLIC_ keys the app's config and .env files define. `akan-native build` writes akan-native-env.d.ts next
 * to akan-native.config.ts, which adds them to this interface (ENV-7).
 */
// biome-ignore lint/suspicious/noEmptyInterface: an interface, so the generated akan-native-env.d.ts can add to it; a type alias cannot be augmented.
export interface AkanNativeEnv {}
/**
 * Known keys from AkanNativeEnv; other keys (set only at run time through AKAN_NATIVE_PUBLIC_*) stay a plain
 * index signature, so with noUncheckedIndexedAccess they read as string | undefined.
 */
export type Env = Readonly<AkanNativeEnv> & Readonly<Record<string, string>>;

export let platform: Platform;
export let env: Env;
export let runtimeVersion: string;
export let app: AppInfo | null;
export let isDev: boolean;
/** True inside an akan-native app shell (macOS, iOS, Android ...), false on the web. */
export let isNative: boolean;
/** Desktop: this page's window (1 = the window the app opened, SH-6). null elsewhere. */
export let windowId: number | null;
/**
 * Native hosts: a fingerprint of what this app binary provides natively (bridge protocol, akan-native
 * runtime minor, plugins, capabilities, permissions). A web bundle runs only in a binary with the
 * same value (UP-3). null on the web.
 */
export let nativeApi: string | null;

export function refreshBoot(): void {
  const boot = runtime().boot;
  platform = boot.platform;
  env = boot.env as Env;
  runtimeVersion = boot.runtimeVersion;
  app = boot.app;
  isDev = boot.dev;
  isNative = boot.platform !== "web";
  windowId = boot.windowId ?? null;
  nativeApi = boot.nativeApi ?? null;
}

refreshBoot();
