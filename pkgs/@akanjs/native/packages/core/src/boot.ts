// Page boot data written by the host's /__akan_native/init.js before the app bundle runs
// (docs/architecture.md §3.1).

import { loadAcl, type ResolvedAcl } from "./acl.ts";

export type Platform = "web" | "macos" | "windows" | "linux" | "ios" | "android";

/**
 * How a host provides a plugin:
 * - "web": the plugin's web implementation runs inside the WebView
 * - { methods, events }: the host has a native implementation of these
 * A plugin missing from the map is unsupported on that host (web platform excepted).
 */
/**
 * "web": the page runs the web implementation. An object: the host implements these methods and
 * events; with `web: true` the others fall back to the web implementation (e.g. macOS camera:
 * native permission state, getUserMedia capture).
 */
/**
 * `coalesce`: events whose payload is a snapshot (progress, sizes, positions): the host sends only the
 * latest of a burst (architecture review stage 4, `coalesce: "latest"`).
 */
export type PluginDecl = "web" | { methods: string[]; events: string[]; web?: true; coalesce?: string[] };

export interface AppInfo {
  id: string;
  name: string;
  version: string;
  build?: number;
}

export interface AkanNativeBoot {
  v: 1;
  platform: Platform;
  runtimeVersion: string;
  dev: boolean;
  app: AppInfo | null;
  env: Record<string, string>;
  plugins: Record<string, PluginDecl>;
  /** Desktop: this page's window (1 = the window the app opened, SH-6). Absent elsewhere. */
  windowId?: number;
  /** The resolved capabilities (PL-11). The host enforces them; the page applies them to web implementations. */
  acl?: ResolvedAcl;
  /** Native hosts: fingerprint of what the binary provides natively; web bundles must match it (UP-3). */
  nativeApi?: string;
  /** Native hosts: bridge v1.1 features (protocol.ts BRIDGE_FEATURES). */
  bridge?: { features: string[] };
  /** The app's origin, set by the shell (the web: the page's): the one value origin checks use. */
  origin?: string;
  /** Native hosts: the page's engine (wkwebview, webview2, webkitgtk, android-webview) and its version. */
  engine?: string;
  engineVersion?: string;
}

/** The global object. init.js fills the boot fields, @akanjs/native/core adds `receive`. */
export interface AkanNativeGlobal extends Partial<AkanNativeBoot> {
  /** Entry point for host → JS messages (responses on Android, events everywhere). */
  receive?: (message: unknown) => void;
  /** Shared runtime state, so that duplicated copies of @akanjs/native/core in one page agree. */
  __runtime?: unknown;
}

const PLATFORMS: readonly Platform[] = ["web", "macos", "windows", "linux", "ios", "android"];

export function akanNativeGlobal(): AkanNativeGlobal {
  const g = globalThis as { __AKAN_NATIVE__?: AkanNativeGlobal };
  g.__AKAN_NATIVE__ ??= {};
  return g.__AKAN_NATIVE__;
}

/**
 * Reads the boot data. Without init.js (plain dev server, unit tests) the page
 * behaves as the web platform with an empty env.
 */
export function readBoot(): AkanNativeBoot {
  const g = akanNativeGlobal();
  const acl = loadAcl(g).acl;
  return {
    v: 1,
    platform: g.platform && PLATFORMS.includes(g.platform) ? g.platform : "web",
    runtimeVersion: typeof g.runtimeVersion === "string" ? g.runtimeVersion : "0.0.0",
    dev: g.dev === true,
    app: g.app ?? null,
    env: Object.freeze({ ...(g.env ?? {}) }),
    plugins: g.plugins ?? {},
    ...(typeof g.windowId === "number" ? { windowId: g.windowId } : {}),
    // A malformed ACL denies everything, as on the hosts (acl.ts loadAcl).
    ...(acl ? { acl } : {}),
    ...(typeof g.nativeApi === "string" ? { nativeApi: g.nativeApi } : {}),
    ...(typeof g.origin === "string"
      ? { origin: g.origin }
      : typeof location !== "undefined" && location.origin !== "null"
        ? { origin: location.origin }
        : {}),
    ...(typeof g.engine === "string" ? { engine: g.engine } : {}),
    ...(typeof g.engineVersion === "string" ? { engineVersion: g.engineVersion } : {}),
  };
}
