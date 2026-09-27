// Web bundle ↔ native shell compatibility (UP-3, docs/architecture.md "버전 호환 규칙").
//
// An app binary can only run web bundles that expect exactly what it provides natively: the
// bridge protocol, the akan-native runtime's minor version, the plugins it declares (and the native
// plugins' versions), the capabilities it enforces and the permissions it declares. All of that is
// baked into the binary (boot.json, Info.plist, AndroidManifest), so a web-only update (UP-2) may
// only ship when these are unchanged. They are hashed into `nativeApi`: boot.json carries the hash
// (the page reads it as `nativeApi` from @akanjs/native/core), and every native build writes bundle.json
// with the hash and what went into it, so `akan-native compat` can say what changed.
//
// Capacitor instead forgets a live-update bundle whenever the binary's versionCode/versionName
// changes (capacitor/android/.../Bridge.java:429-455, CAPBridgeViewController.swift:18-30): safe
// but coarse, a new binary with the same native surface still drops every web update.

import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import type { Platform, PluginDecl, ResolvedAcl } from "../../../core/src/index.ts";
import { BRIDGE_FEATURES } from "../../../core/src/protocol.ts";
import { CliError } from "./log.ts";
import type { Project } from "./project.ts";
import { PACKAGE_ROOT } from "./root.ts";

export const BUNDLE_FILE = "bundle.json";

export interface NativeApi {
  /** Bridge protocol version (architecture.md §4) and the v1.1 features the hosts speak. */
  protocol: 1;
  features: string[];
  /** @akanjs/native/core major.minor, or major alone from 1.0 on (semver caret compatibility). */
  runtime: string;
  platform: Platform;
  /** Every plugin the binary declares, with the package version of native implementations. */
  plugins: Record<string, { decl: PluginDecl; version?: string }>;
  /** The capabilities the binary enforces (PL-11). */
  acl: ResolvedAcl | null;
  /** App-level permissions (C8) and deep-link schemes the binary declares. */
  permissions: string[];
  deepLinks: string[];
}

export interface BundleInfo {
  schema: 1;
  app: { id: string; version: string; build: number };
  platform: Platform;
  runtimeVersion: string;
  nativeApi: { hash: string; inputs: NativeApi };
  /** sha256 of the web files (index.html as served and public/), for update integrity later. */
  web: { hash: string; files: number };
}

/** "0.1.4" → "0.1", "1.2.0" → "1". */
export function runtimeLine(version: string): string {
  const [major = "0", minor = "0"] = version.split(".");
  return major === "0" ? `0.${minor}` : major;
}

function packageVersion(dir: string): string | undefined {
  const path = join(dir, "package.json");
  if (!existsSync(path)) return undefined;
  const version = (JSON.parse(readFileSync(path, "utf8")) as { version?: unknown }).version;
  return typeof version === "string" ? version : undefined;
}

export function nativeApi(
  project: Project,
  platform: Platform,
  decls: Record<string, PluginDecl>,
  acl: ResolvedAcl | undefined,
  runtimeVersion: string,
): NativeApi {
  const dirs = new Map(project.plugins.map((p) => [p.manifest.id, p.dir]));
  const plugins: NativeApi["plugins"] = {};
  for (const [id, decl] of Object.entries(decls)) {
    // A builtin plugin ships with the runtime and has its version; another one its package's.
    const dir = dirs.get(id) ?? "";
    const version =
      decl === "web" ? undefined : dir.startsWith(join(PACKAGE_ROOT, "plugins")) ? runtimeVersion : packageVersion(dir);
    plugins[id] = { decl, ...(version ? { version } : {}) };
  }
  return {
    protocol: 1,
    features: [...BRIDGE_FEATURES],
    runtime: runtimeLine(runtimeVersion),
    platform,
    plugins,
    acl: acl ?? null,
    permissions: Object.keys(project.config.permissions).sort(),
    deepLinks: [...project.config.deepLinks.schemes].sort(),
  };
}

/** JSON with sorted object keys (arrays keep their order), so the hash does not depend on it. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value).filter(([, v]) => v !== undefined);
    return `{${entries
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function nativeApiHash(api: NativeApi): string {
  return createHash("sha256").update(canonical(api)).digest("hex").slice(0, 16);
}

/** Why a bundle built against `bundle` cannot run in a binary that provides `installed` (empty: it can). */
export function compatProblems(installed: NativeApi, bundle: NativeApi): string[] {
  const problems: string[] = [];
  if (installed.platform !== bundle.platform)
    return [`the bundle is for ${bundle.platform}, the app is ${installed.platform}`];
  if (installed.protocol !== bundle.protocol)
    problems.push(`bridge protocol ${bundle.protocol} vs ${installed.protocol}`);
  const features = (api: NativeApi) => [...(api.features ?? [])].sort().join(", ") || "none";
  if (features(installed) !== features(bundle))
    problems.push(`bridge features ${features(bundle)} vs ${features(installed)} in the app`);
  if (installed.runtime !== bundle.runtime)
    problems.push(`akan-native runtime ${bundle.runtime} vs ${installed.runtime} in the app`);
  const ids = [...new Set([...Object.keys(installed.plugins), ...Object.keys(bundle.plugins)])].sort();
  for (const id of ids) {
    const a = installed.plugins[id];
    const b = bundle.plugins[id];
    if (!a) problems.push(`plugin ${id} is not in the app`);
    else if (!b) problems.push(`plugin ${id} is in the app but not in the bundle`);
    else {
      if (a.version !== b.version) problems.push(`plugin ${id} ${b.version ?? "?"} vs ${a.version ?? "?"} in the app`);
      const describe = (d: PluginDecl) =>
        d === "web"
          ? "web"
          : `native: ${d.methods.join(", ")}${d.events.length ? `; events ${d.events.join(", ")}` : ""}${d.web ? " (+web)" : ""}`;
      if (canonical(a.decl) !== canonical(b.decl))
        problems.push(`plugin ${id} is ${describe(b.decl)} in the bundle, ${describe(a.decl)} in the app`);
    }
  }
  if (canonical(installed.acl) !== canonical(bundle.acl)) problems.push("capabilities changed");
  if (canonical(installed.permissions) !== canonical(bundle.permissions))
    problems.push(`permissions [${bundle.permissions.join(", ")}] vs [${installed.permissions.join(", ")}] in the app`);
  if (canonical(installed.deepLinks) !== canonical(bundle.deepLinks))
    problems.push(
      `deep link schemes [${bundle.deepLinks.join(", ")}] vs [${installed.deepLinks.join(", ")}] in the app`,
    );
  return problems;
}

function webHash(webDir: string, html: string): { hash: string; files: number } {
  const hash = createHash("sha256");
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir).sort()) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else files.push(path);
    }
  };
  walk(webDir);
  for (const file of files) {
    const rel = relative(webDir, file);
    hash.update(`${rel}\0`);
    hash.update(rel === "index.html" ? html : readFileSync(file));
    hash.update("\0");
  }
  return { hash: hash.digest("hex"), files: files.length };
}

/** Writes <outDir>/bundle.json for a native build. */
export function writeBundleInfo(
  outDir: string,
  project: Project,
  platform: Platform,
  runtimeVersion: string,
  api: NativeApi,
  webDir: string,
  html: string,
): BundleInfo {
  const { app } = project.config;
  const info: BundleInfo = {
    schema: 1,
    app: { id: app.id, version: app.version, build: app.build },
    platform,
    runtimeVersion,
    nativeApi: { hash: nativeApiHash(api), inputs: api },
    web: webHash(webDir, html),
  };
  writeFileSync(join(outDir, BUNDLE_FILE), `${JSON.stringify(info, null, 2)}\n`);
  return info;
}

export function readBundleInfo(path: string): BundleInfo {
  if (!existsSync(path)) throw new CliError(`${path} not found`);
  const info = JSON.parse(readFileSync(path, "utf8")) as BundleInfo;
  if (info?.schema !== 1 || !info.nativeApi?.inputs)
    throw new CliError(`${path} is not an akan-native bundle.json (schema 1)`);
  return info;
}
