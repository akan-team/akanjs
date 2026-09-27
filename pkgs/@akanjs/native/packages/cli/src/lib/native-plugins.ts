// Turns plugin manifests into per-platform build inputs (docs/architecture.md §6):
// boot.json plugin declarations, registration code and permission entries.

import { existsSync, mkdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import type { PluginDecl } from "../../../core/src/index.ts";
import { pluginBindings } from "./codegen.ts";
import { CliError } from "./log.ts";
import { mergePlist } from "./nativeconfig.ts";
import type { PlistValue } from "./plist.ts";
import type { AndroidManifest, IosManifest, NativeSubset, ResolvedPlugin } from "./project.ts";

export type NativePlatform = "macos" | "windows" | "linux" | "ios" | "android";

/** Declarations for boot.json: how this platform provides each plugin. */
export function pluginDecls(plugins: ResolvedPlugin[], platform: NativePlatform): Record<string, PluginDecl> {
  const decls: Record<string, PluginDecl> = {};
  for (const { manifest } of plugins) {
    // One desktop module serves macOS, Windows and Linux; it rejects what its OS lacks (UNSUPPORTED).
    const entry = platform === "ios" || platform === "android" ? manifest[platform] : manifest.desktop;
    if (entry === undefined || entry === null) continue;
    if (entry === "web") {
      if (manifest.web) decls[manifest.id] = "web";
      continue;
    }
    const subset: NativeSubset = typeof entry === "string" ? {} : entry;
    const events = subset.events ?? manifest.events;
    const coalesce = (manifest.coalesce ?? []).filter((e) => events.includes(e));
    decls[manifest.id] = {
      methods: subset.methods ?? manifest.methods,
      events,
      ...(subset.web && manifest.web ? { web: true as const } : {}),
      ...(coalesce.length ? { coalesce } : {}),
    };
  }
  return decls;
}

/**
 * A desktop module against its manifest: the page is told the methods and events of the manifest
 * (or its `desktop` subset), and the host answers NOT_FOUND for any the module lacks: a `$listen`
 * of an event without a source, a method that is not there. Imports the module (it only defines
 * the plugin; setup runs in the app).
 */
export async function desktopModuleProblems(plugin: ResolvedPlugin): Promise<string[]> {
  const { manifest } = plugin;
  const entry = manifest.desktop;
  if (!entry || entry === "web") return [];
  const subset: NativeSubset = typeof entry === "string" ? {} : entry;
  const file = pluginFile(plugin, typeof entry === "string" ? entry : entry.module, "desktop module");
  const module = (await import(file)) as { default?: { id?: string; methods?: object; events?: object } };
  const desktop = module.default;
  if (!desktop || typeof desktop !== "object")
    return [`${manifest.id}: ${relative(plugin.dir, file)} has no default export (defineDesktopPlugin)`];
  const methods = subset.methods ?? manifest.methods;
  const events = subset.events ?? manifest.events ?? [];
  const has = Object.keys(desktop.methods ?? {});
  const sources = Object.keys(desktop.events ?? {});
  const where = `${manifest.id} (${relative(plugin.dir, file)})`;
  return [
    ...(desktop.id !== manifest.id
      ? [`${where}: id is ${JSON.stringify(desktop.id)}, the manifest says ${manifest.id}`]
      : []),
    ...methods
      .filter((m) => !has.includes(m))
      .map(
        (m) =>
          `${where}: no method ${m} (the page would get NOT_FOUND; leave it out of the desktop methods to make it UNSUPPORTED)`,
      ),
    ...has
      .filter((m) => !methods.includes(m))
      .map((m) => `${where}: method ${m} is not among the manifest's desktop methods, so the page never calls it`),
    ...events
      .filter((e) => !sources.includes(e))
      .map(
        (e) =>
          `${where}: no source for event ${e} (listening would fail with NOT_FOUND; a source that never fires is () => () => {})`,
      ),
    ...sources
      .filter((e) => !events.includes(e))
      .map((e) => `${where}: event ${e} is not among the manifest's desktop events`),
  ];
}

export interface NativePlugin<M> {
  plugin: ResolvedPlugin;
  native: M;
  /** Absolute source files. */
  sources: string[];
}

/**
 * A file a manifest names, which must be inside the plugin's folder: relative, no "..", and its real
 * location (through symbolic links) inside the folder's (N7). A plugin cannot compile someone
 * else's files into the app.
 */
export function pluginFile(plugin: ResolvedPlugin, relativePath: string, what: string): string {
  const id = plugin.manifest.id;
  if (isAbsolute(relativePath) || relativePath.split(/[\\/]/).includes("..")) {
    throw new CliError(`plugin ${id}: ${what} ${relativePath} must be a path inside the plugin's folder`);
  }
  const path = resolve(plugin.dir, relativePath);
  if (!existsSync(path)) throw new CliError(`plugin ${id}: ${what} ${relativePath} not found`);
  const root = realpathSync(plugin.dir);
  const real = realpathSync(path);
  if (real !== root && !real.startsWith(root + sep))
    throw new CliError(`plugin ${id}: ${what} ${relativePath} leads outside the plugin's folder`);
  return path;
}

function expandSources(plugin: ResolvedPlugin, patterns: string[]): string[] {
  const files = new Set<string>();
  for (const pattern of patterns) {
    if (!/[*?[{]/.test(pattern)) {
      files.add(pluginFile(plugin, pattern, "source"));
      continue;
    }
    if (isAbsolute(pattern) || pattern.split(/[\\/]/).includes("..")) {
      throw new CliError(
        `plugin ${plugin.manifest.id}: source ${pattern} must be a pattern inside the plugin's folder`,
      );
    }
    const glob = new Bun.Glob(pattern);
    for (const match of glob.scanSync({ cwd: plugin.dir, absolute: true }))
      files.add(pluginFile(plugin, relative(plugin.dir, match), "source"));
  }
  if (files.size === 0) throw new CliError(`plugin ${plugin.manifest.id}: no sources match ${patterns.join(", ")}`);
  return [...files].sort();
}

export function iosPlugins(plugins: ResolvedPlugin[]): NativePlugin<IosManifest>[] {
  return plugins.flatMap((plugin) => {
    const native = plugin.manifest.ios;
    if (!native || native === "web") return [];
    return [{ plugin, native, sources: expandSources(plugin, native.sources) }];
  });
}

export function androidPlugins(plugins: ResolvedPlugin[]): NativePlugin<AndroidManifest>[] {
  return plugins.flatMap((plugin) => {
    const native = plugin.manifest.android;
    if (!native || native === "web") return [];
    return [{ plugin, native, sources: expandSources(plugin, native.sources) }];
  });
}

/**
 * Writes the Swift / Kotlin bindings of the plugins with "codegen": true into `dir` (emptied first,
 * so a plugin that stops opting in leaves nothing behind) and returns the files (PL-10).
 */
export function writePluginBindings(
  plugins: NativePlugin<unknown>[],
  platform: "ios" | "android",
  dir: string,
  appDir: string,
): string[] {
  rmSync(dir, { recursive: true, force: true });
  return plugins
    .filter(({ plugin }) => plugin.manifest.codegen)
    .map(({ plugin }) => {
      const { file, text } = pluginBindings(plugin, platform, appDir);
      const path = join(dir, file);
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, text);
      return path;
    });
}

const SWIFT_IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;
const JVM_CLASS = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*\.[A-Z][A-Za-z0-9_]*$/;

export function swiftRegistry(plugins: NativePlugin<IosManifest>[]): string {
  const lines = plugins.map(({ plugin, native }) => {
    if (!SWIFT_IDENT.test(native.class))
      throw new CliError(`plugin ${plugin.manifest.id}: invalid Swift class ${native.class}`);
    return `        ("${plugin.manifest.id}", ${native.class}.self),`;
  });
  return `// Generated by akan-native build. Do not edit.
@MainActor
enum AkanNativeGeneratedPlugins {
    static let all: [(id: String, type: AkanNativePlugin.Type)] = [
${lines.join("\n")}
    ]
}
`;
}

/** A plugin's `android.minSdk`, checked: at least the app's, at most the SDK akan-native compiles against. */
export function pluginMinSdk(id: string, native: AndroidManifest, appMinSdk: number, compileSdk: number): number {
  const min = native.minSdk ?? appMinSdk;
  if (!Number.isInteger(min) || min > compileSdk)
    throw new CliError(
      `plugin ${id}: android.minSdk must be an API level up to ${compileSdk} (got ${JSON.stringify(native.minSdk)})`,
    );
  return Math.max(min, appMinSdk);
}

/**
 * AkanNativeFeatures.kt: the shell's optional parts as constants (architecture review stage 6). The shell
 * reaches them only under these; kotlinc drops the branches of a false constant and R8 the classes
 * nothing reaches, so a release build without updates carries no update code.
 */
export function kotlinFeatures(features: { dev: boolean; updates: boolean }): string {
  return [
    "// Generated by akan-native (packages/cli/src/lib/native-plugins.ts). Do not edit.",
    "package com.akanjs.runtime",
    "",
    "internal object AkanNativeFeatures {",
    "    /** The self-test's $host methods and shared vectors. */",
    `    const val DEV = ${features.dev}`,
    "    /** Web bundle updates (AkanNativeUpdates): an updates config or the updates plugin. */",
    `    const val UPDATES = ${features.updates}`,
    "}",
    "",
  ].join("\n");
}

export function kotlinRegistry(
  plugins: NativePlugin<AndroidManifest>[],
  appMinSdk: number,
  compileSdk: number,
): string {
  const lines = plugins.map(({ plugin, native }) => {
    if (!JVM_CLASS.test(native.class))
      throw new CliError(`plugin ${plugin.manifest.id}: invalid class ${native.class}`);
    const min = pluginMinSdk(plugin.manifest.id, native, appMinSdk, compileSdk);
    if (min <= appMinSdk) return `        "${plugin.manifest.id}" to { ctx -> ${native.class}(ctx) },`;
    const reason = `${plugin.manifest.id} needs Android API ${min} or later`;
    return `        "${plugin.manifest.id}" to { ctx -> if (android.os.Build.VERSION.SDK_INT >= ${min}) ${native.class}(ctx) else com.akanjs.runtime.AkanNativeUnsupportedPlugin("${reason}") },`;
  });
  return `// Generated by akan-native build. Do not edit.
package com.akanjs.generated

import com.akanjs.runtime.AkanNativePlugin
import com.akanjs.runtime.AkanNativePluginContext

object AkanNativeGeneratedPlugins {
    val all: List<Pair<String, (AkanNativePluginContext) -> AkanNativePlugin>> = listOf(
${lines.join("\n")}
    )
}
`;
}

/**
 * The app's Info.plist (O5-1, architecture review F): akan-native's own keys (`base`), each plugin's entries,
 * then the app last: its permission texts (C8), usageDescriptions overrides of keys that are there,
 * and native.ios.infoPlist. Arrays union, dictionaries merge, two plugins that disagree on a value
 * fail the build, and `owned` keys only akan-native sets.
 */
export function iosInfoPlist(
  plugins: NativePlugin<IosManifest>[],
  overrides: Record<string, string>,
  appEntries: Record<string, string> = {},
  opts: { base?: Record<string, PlistValue>; app?: Record<string, PlistValue>; owned?: string[] } = {},
): Record<string, PlistValue> {
  const sources = [
    ...(opts.base ? [{ who: "akan-native", values: opts.base }] : []),
    ...plugins.map(({ plugin, native }) => ({ who: `plugin ${plugin.manifest.id}`, values: native.infoPlist ?? {} })),
  ];
  const present = new Set([
    ...plugins.flatMap(({ native }) => Object.keys(native.infoPlist ?? {})),
    ...Object.keys(appEntries),
  ]);
  const texts: Record<string, PlistValue> = { ...appEntries };
  for (const [key, text] of Object.entries(overrides)) if (present.has(key) && text) texts[key] = text;
  return mergePlist(sources, { who: "the app", values: { ...texts, ...(opts.app ?? {}) } }, opts.owned);
}

/**
 * The app's entitlements: akan-native's, each plugin's, associated-domains for deepLinks.domains, then
 * native.ios.entitlements. Xcode's variables in string values are filled in: $(AppIdentifierPrefix)
 * and $(TeamIdentifierPrefix) with "<team id>." ("" on the simulator), $(PRODUCT_BUNDLE_IDENTIFIER).
 */
export function iosEntitlements(
  bundleId: string,
  plugins: NativePlugin<IosManifest>[],
  domains: { host: string }[],
  app: Record<string, PlistValue> = {},
  teamId?: string,
): Record<string, PlistValue> {
  const prefix = teamId ? `${teamId}.` : "";
  const fill = (v: PlistValue): PlistValue =>
    typeof v === "string"
      ? v
          .replaceAll("$(AppIdentifierPrefix)", prefix)
          .replaceAll("$(TeamIdentifierPrefix)", prefix)
          .replaceAll("$(PRODUCT_BUNDLE_IDENTIFIER)", bundleId)
      : Array.isArray(v)
        ? v.map(fill)
        : v && typeof v === "object" && !(v instanceof Date)
          ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, x === undefined ? x : fill(x)]))
          : v;
  const applicationIdentifier = prefix + bundleId;
  const merged = mergePlist(
    [
      { who: "akan-native", values: { "application-identifier": applicationIdentifier } },
      ...plugins.map(({ plugin, native }) => ({
        who: `plugin ${plugin.manifest.id}`,
        values: native.entitlements ?? {},
      })),
      {
        who: "deepLinks.domains",
        values: domains.length
          ? { "com.apple.developer.associated-domains": domains.map((d) => `applinks:${d.host}`) }
          : {},
      },
    ],
    { who: "the app (native.ios.entitlements)", values: app },
    ["application-identifier"],
  );
  return fill(merged) as Record<string, PlistValue>;
}

export function iosFrameworks(plugins: NativePlugin<IosManifest>[]): string[] {
  return [...new Set(plugins.flatMap(({ native }) => native.frameworks ?? []))].sort();
}

export function androidPermissions(plugins: NativePlugin<AndroidManifest>[], appPermissions: string[] = []): string[] {
  return [...new Set([...plugins.flatMap(({ native }) => native.permissions ?? []), ...appPermissions])].sort();
}

export function describeSources(appDir: string, plugins: NativePlugin<unknown>[]): string {
  return plugins
    .map((p) => `${p.plugin.manifest.id} (${p.sources.map((s) => relative(appDir, s)).join(", ")})`)
    .join("; ");
}
