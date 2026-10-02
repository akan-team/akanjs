// Loads akan-native.config.ts and the plugin manifests of an app.

import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { MEMBER_NAME, RESERVED_MEMBERS } from "../../../core/src/protocol.ts";
import type { AkanNativeConfig } from "../config.ts";
import { manifestPermissionProblems, type PermissionSet, resolveAcl } from "./acl.ts";
import { unknownConfigKeys } from "./configkeys.ts";
import { validateCsp, validateExternalSchemes } from "./csp.ts";
import { type DesktopServerConfig, validateDesktopServer } from "./desktop-server.ts";
import { type EnvConfig, validateEnvConfig } from "./env.ts";
import { CliError } from "./log.ts";
import { type PermissionsConfig, validatePermissions } from "./permissions.ts";
import type { PlistValue } from "./plist.ts";
import { privacyApiProblems } from "./privacy.ts";
import { PACKAGE_ROOT } from "./root.ts";
import { type UpdatesConfig, validateUpdates } from "./updates.ts";

const CONFIG_FILES = ["akan-native.config.ts", "akan-native.config.js", "akan-native.config.mjs"];

export interface ResolvedConfig extends Omit<AkanNativeConfig, "icon" | "splash" | "permissions" | "updates"> {
  app: Required<AkanNativeConfig["app"]>;
  web: Required<Pick<AkanNativeConfig["web"], "dir" | "base">> & { build?: string; devEntry?: string };
  plugins: string[];
  env: EnvConfig;
  shell: { backgroundColor: string; backgroundColorDark: string };
  usageDescriptions: Record<string, string>;
  permissions: PermissionsConfig;
  deepLinks: { schemes: string[]; domains: { host: string; pathPrefixes: string[] }[] };
  desktop: {
    quitOnLastWindowClosed: boolean;
    recovery: "errorPage" | "reload";
    window: { fullscreen: boolean; skipTaskbar: boolean };
    screenCapture: "picker" | "auto";
    server?: DesktopServerConfig;
    /** Absolute. */
    bin?: string;
  };
  updates: UpdatesConfig | null;
  /** Absolute image path. */
  icon: { image: string; backgroundColor?: string } | null;
  splash: { backgroundColor: string; backgroundColorDark: string; image?: string; autoHide: boolean; timeout: number };
}

export interface Project {
  appDir: string;
  /** The config file, or "the config" when an API caller passed the object (docs/api.md). */
  configPath: string;
  config: ResolvedConfig;
  plugins: ResolvedPlugin[];
}

export function findAppDir(from: string): string {
  let dir = resolve(from);
  for (;;) {
    if (CONFIG_FILES.some((name) => existsSync(join(dir, name)))) return dir;
    const parent = dirname(dir);
    if (parent === dir)
      throw new CliError(`no akan-native.config.ts found in ${from} or its parents (use --app <dir>)`);
    dir = parent;
  }
}

const APP_ID = /^[a-zA-Z][a-zA-Z0-9]*(\.[a-zA-Z][a-zA-Z0-9_]*)+$/;
const VERSION = /^\d+(\.\d+){0,2}$/;

export async function loadProject(appDir: string): Promise<Project> {
  const configPath = CONFIG_FILES.map((name) => join(appDir, name)).find((p) => existsSync(p));
  if (!configPath) throw new CliError(`no akan-native.config.ts in ${appDir}`);
  // The modification time in the specifier: akan-native dev reloads a changed config (import() is cached per process).
  const mod = (await import(`${configPath}?mtime=${statSync(configPath).mtimeMs}`)) as { default?: AkanNativeConfig };
  const raw = mod.default;
  if (!raw || typeof raw !== "object") throw new CliError(`${configPath} must export default defineConfig({...})`);
  return projectFromConfig(raw, appDir, { configPath });
}

export interface ProjectOptions {
  /** For messages. Default "the config". */
  configPath?: string;
  /** Where plugin package names resolve from. Default the app folder. Relative plugin folders always use the app folder. */
  resolveFrom?: string;
}

/** Invalid config values, all of them at once (AkanNativeError CONFIG_INVALID carries the list). */
export class ConfigError extends CliError {
  constructor(
    where: string,
    readonly problems: string[],
  ) {
    super(`invalid ${where}:\n  - ${problems.join("\n  - ")}`);
    this.name = "ConfigError";
  }
}

/** A project from a config object (akan-native.config.ts's default export, or an API caller's object). */
/** app.fileName: what executables, the Swift module and archives are named. */
const FILE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

/** Windows device names, which no file or folder may be called (with any extension). */
const WINDOWS_DEVICES = /^(con|prn|aux|nul|com[0-9¹²³]|lpt[0-9¹²³])(\..*)?$/i;

/**
 * Why a display name cannot be a folder or shortcut name on every OS, or null (Dioxus #5743,
 * Electrobun #514: names like "My App." or "A/B" broke installs).
 */
export function appNameProblem(name: unknown): string | null {
  if (typeof name !== "string" || !name.trim()) return "app.name is required";
  if (name !== name.trim()) return `app.name must not start or end with spaces (got ${JSON.stringify(name)})`;
  if (name.endsWith(".")) return `app.name must not end with a dot (got ${JSON.stringify(name)})`;
  if ([...name].some((c) => c.charCodeAt(0) < 0x20 || c.charCodeAt(0) === 0x7f))
    return "app.name must not contain control characters";
  const bad = [...name].find((c) => '/\\:*?"<>|'.includes(c));
  if (bad)
    return `app.name must not contain ${JSON.stringify(bad)}: it names folders and shortcuts (got ${JSON.stringify(name)})`;
  if (WINDOWS_DEVICES.test(name)) return `app.name ${JSON.stringify(name)} is a Windows device name`;
  if (name.length > 100) return "app.name must be at most 100 characters";
  return null;
}

/**
 * What each target accepts as the build number (app.build, `--build`, AKAN_NATIVE_BUILD), or null: a positive
 * integer; Android's versionCode goes to 2,100,000,000; Windows puts it in a version resource field
 * (at most 65535); Apple takes any positive integer as CFBundleVersion.
 */
export function buildNumberProblem(build: unknown, platform: string): string | null {
  if (typeof build !== "number" || !Number.isSafeInteger(build) || build < 1)
    return `the build number must be a positive integer (got ${JSON.stringify(build)})`;
  if (platform === "android" && build > 2_100_000_000)
    return `Android versionCode goes up to 2100000000 (build ${build})`;
  if (platform === "windows" && build > 65_535) return `a Windows version field goes up to 65535 (build ${build})`;
  return null;
}

/** The last part of the app id, lowercased: "com.example.Notes" → "notes". */
export function defaultFileName(id: string): string {
  const tail = id.split(".").pop() ?? "app";
  const name = tail.toLowerCase().replace(/[^a-z0-9._-]/g, "");
  return FILE_NAME.test(name) ? name : "app";
}

export function projectFromConfig(raw: AkanNativeConfig, appDir: string, options: ProjectOptions = {}): Project {
  const configPath = options.configPath ?? "the config";
  if (!raw || typeof raw !== "object") throw new ConfigError(configPath, ["the config must be an object"]);
  // A misspelled or renamed key would otherwise be a setting that silently does nothing.
  const problems: string[] = unknownConfigKeys(raw);
  if (!raw.app || typeof raw.app !== "object") problems.push("app is required");
  else {
    if (typeof raw.app.id !== "string" || !APP_ID.test(raw.app.id))
      problems.push(`app.id must be reverse-DNS like "com.example.app" (got ${JSON.stringify(raw.app?.id)})`);
    const nameProblem = appNameProblem(raw.app.name);
    if (nameProblem) problems.push(nameProblem);
    if (raw.app.fileName !== undefined && (typeof raw.app.fileName !== "string" || !FILE_NAME.test(raw.app.fileName))) {
      problems.push(
        `app.fileName must be letters, digits, ".", "_" and "-", starting with a letter or digit, at most 64 characters (got ${JSON.stringify(raw.app.fileName)})`,
      );
    }
    if (typeof raw.app.version !== "string" || !VERSION.test(raw.app.version))
      problems.push(`app.version must look like "1.2.3" (got ${JSON.stringify(raw.app?.version)})`);
    if (raw.app.build !== undefined && (!Number.isInteger(raw.app.build) || raw.app.build < 1))
      problems.push("app.build must be a positive integer");
  }
  if (!raw.web || typeof raw.web.dir !== "string") problems.push("web.dir is required");
  if (
    raw.web?.devEntry !== undefined &&
    (typeof raw.web.devEntry !== "string" || !raw.web.devEntry.toLowerCase().endsWith(".html"))
  ) {
    problems.push(`web.devEntry must be the path of an .html file (got ${JSON.stringify(raw.web.devEntry)})`);
  }
  for (const scheme of raw.deepLinks?.schemes ?? []) {
    if (!/^[a-z][a-z0-9+.-]*$/.test(scheme) || ["http", "https", "file", "app"].includes(scheme))
      problems.push(`deepLinks.schemes: invalid scheme ${JSON.stringify(scheme)}`);
  }
  checkIconAndSplash(raw, appDir, problems);
  checkPrivacy(raw.privacy, problems);
  checkNative(raw, appDir, problems);
  const suffix = raw.android?.debugAppIdSuffix;
  if (suffix !== undefined && (typeof suffix !== "string" || !/^(\.[a-zA-Z][a-zA-Z0-9_]*)+$/.test(suffix))) {
    problems.push(`android.debugAppIdSuffix must look like ".debug" (got ${JSON.stringify(suffix)})`);
  }
  if (raw.app?.build !== undefined && raw.app.build > 2_100_000_000)
    problems.push("app.build must be at most 2100000000 (Android versionCode)");
  const googleServices = raw.android?.googleServices;
  if (googleServices !== undefined) {
    if (typeof googleServices !== "string" || !existsSync(resolve(appDir, googleServices)))
      problems.push(`android.googleServices: ${JSON.stringify(googleServices)} is not a file in the app folder`);
  }
  const minWebView = raw.android?.minWebViewVersion;
  if (minWebView !== undefined && !(Number.isInteger(minWebView) && minWebView >= 94 && minWebView < 1000)) {
    problems.push(
      `android.minWebViewVersion must be a Chromium major version, at least 94 (got ${JSON.stringify(minWebView)})`,
    );
  }
  const env = validateEnvConfig(raw.env, problems);
  const updates = validateUpdates(raw.updates, problems);
  if (raw.desktop?.quitOnLastWindowClosed !== undefined && typeof raw.desktop.quitOnLastWindowClosed !== "boolean") {
    problems.push("desktop.quitOnLastWindowClosed must be a boolean");
  }
  const recovery = raw.desktop?.recovery;
  if (recovery !== undefined && recovery !== "errorPage" && recovery !== "reload")
    problems.push(`desktop.recovery must be "errorPage" or "reload" (got ${JSON.stringify(recovery)})`);
  for (const key of ["fullscreen", "skipTaskbar"] as const) {
    const value = raw.desktop?.window?.[key];
    if (value !== undefined && typeof value !== "boolean") problems.push(`desktop.window.${key} must be a boolean`);
  }
  const screenCapture = raw.desktop?.screenCapture;
  if (screenCapture !== undefined && screenCapture !== "picker" && screenCapture !== "auto")
    problems.push(`desktop.screenCapture must be "picker" or "auto" (got ${JSON.stringify(screenCapture)})`);
  if (raw.android?.autoplay !== undefined && typeof raw.android.autoplay !== "boolean")
    problems.push("android.autoplay must be a boolean");
  const bin = raw.desktop?.bin;
  const binDir = typeof bin === "string" && bin ? resolve(appDir, bin) : null;
  if (bin !== undefined && !(binDir && existsSync(binDir) && statSync(binDir).isDirectory()))
    problems.push(`desktop.bin must be a folder (got ${JSON.stringify(bin)})`);
  const desktopServer = validateDesktopServer(raw.desktop, appDir, problems);
  if (raw.keyboard?.resize !== undefined && raw.keyboard.resize !== "resize" && raw.keyboard.resize !== "none") {
    problems.push(`keyboard.resize must be "resize" or "none" (got ${JSON.stringify(raw.keyboard.resize)})`);
  }
  if (raw.ios?.hideFormAccessoryBar !== undefined && typeof raw.ios.hideFormAccessoryBar !== "boolean")
    problems.push("ios.hideFormAccessoryBar must be a boolean");
  const pushAndroid = raw.push?.android;
  if (pushAndroid?.channel !== undefined) {
    const c = pushAndroid.channel;
    if (!c || typeof c.id !== "string" || !/^[A-Za-z0-9_.-]{1,100}$/.test(c.id))
      problems.push(`push.android.channel.id must be letters, digits, ".", "_" or "-" (got ${JSON.stringify(c?.id)})`);
    if (!c || typeof c.name !== "string" || !c.name.trim())
      problems.push("push.android.channel.name is required (the name users see in the app's notification settings)");
    if (c?.importance !== undefined && !["min", "low", "default", "high"].includes(c.importance))
      problems.push(
        `push.android.channel.importance must be "min", "low", "default" or "high" (got ${JSON.stringify(c.importance)})`,
      );
    if (c?.description !== undefined && typeof c.description !== "string")
      problems.push("push.android.channel.description must be text");
  }
  if (pushAndroid?.smallIcon !== undefined) {
    if (typeof pushAndroid.smallIcon !== "string" || !pushAndroid.smallIcon.toLowerCase().endsWith(".png"))
      problems.push(
        `push.android.smallIcon must be a path to a .png file (got ${JSON.stringify(pushAndroid.smallIcon)})`,
      );
    else if (!existsSync(resolve(appDir, pushAndroid.smallIcon)))
      problems.push(`push.android.smallIcon: ${resolve(appDir, pushAndroid.smallIcon)} not found`);
  }
  if (
    pushAndroid?.color !== undefined &&
    (typeof pushAndroid.color !== "string" || !/^#[0-9a-fA-F]{6}$/.test(pushAndroid.color))
  )
    problems.push(`push.android.color must be a color like "#1a73e8" (got ${JSON.stringify(pushAndroid.color)})`);
  if (problems.length) throw new ConfigError(configPath, problems);

  const shell = {
    backgroundColor: raw.shell?.backgroundColor ?? "#ffffff",
    backgroundColorDark: raw.shell?.backgroundColorDark ?? raw.shell?.backgroundColor ?? "#000000",
  };
  const icon = typeof raw.icon === "string" ? { image: raw.icon } : raw.icon;
  const splashColor = raw.splash?.backgroundColor;
  const config: ResolvedConfig = {
    ...raw,
    app: { build: 1, ...raw.app, fileName: raw.app.fileName ?? defaultFileName(raw.app.id) },
    web: { base: "/", ...raw.web },
    plugins: raw.plugins ?? [],
    env,
    shell,
    usageDescriptions: raw.usageDescriptions ?? {},
    permissions: validatePermissions(raw.permissions),
    security: {
      csp: validateCsp(raw.security?.csp),
      shell: { externalSchemes: validateExternalSchemes(raw.security?.shell?.externalSchemes) },
    },
    deepLinks: {
      schemes: raw.deepLinks?.schemes ?? [],
      domains: (raw.deepLinks?.domains ?? []).map((d) =>
        typeof d === "string" ? { host: d, pathPrefixes: [] } : { host: d.host, pathPrefixes: d.pathPrefixes ?? [] },
      ),
    },
    desktop: {
      quitOnLastWindowClosed: raw.desktop?.quitOnLastWindowClosed ?? true,
      recovery: raw.desktop?.recovery === "reload" ? "reload" : "errorPage",
      screenCapture: raw.desktop?.screenCapture === "auto" ? "auto" : "picker",
      window: {
        fullscreen: raw.desktop?.window?.fullscreen === true,
        skipTaskbar: raw.desktop?.window?.skipTaskbar === true,
      },
      ...(desktopServer ? { server: desktopServer } : {}),
      ...(binDir ? { bin: binDir } : {}),
    },
    updates,
    icon: icon ? { ...icon, image: resolve(appDir, icon.image) } : null,
    splash: {
      backgroundColor: typeof splashColor === "string" ? splashColor : (splashColor?.light ?? shell.backgroundColor),
      backgroundColorDark:
        typeof splashColor === "string" ? splashColor : (splashColor?.dark ?? shell.backgroundColorDark),
      image: raw.splash?.image ? resolve(appDir, raw.splash.image) : undefined,
      autoHide: raw.splash?.autoHide ?? true,
      timeout: raw.splash?.timeout ?? 10_000,
    },
  };
  const plugins = resolvePlugins(appDir, config.plugins, options.resolveFrom);
  resolveAcl(config.capabilities, plugins, "web"); // validates every capability, whatever the platform
  return { appDir, configPath, config, plugins };
}

const COLOR = /^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/;

function checkIconAndSplash(raw: AkanNativeConfig, appDir: string, problems: string[]) {
  const png = (what: string, path: unknown) => {
    if (typeof path !== "string" || !path.toLowerCase().endsWith(".png"))
      problems.push(`${what} must be a path to a .png file (got ${JSON.stringify(path)})`);
    else if (!existsSync(resolve(appDir, path))) problems.push(`${what}: ${resolve(appDir, path)} not found`);
  };
  const color = (what: string, value: unknown) => {
    if (typeof value !== "string" || !COLOR.test(value))
      problems.push(`${what} must be a color like "#1a2b3c" (got ${JSON.stringify(value)})`);
  };
  if (raw.icon !== undefined) {
    if (typeof raw.icon === "string") png("icon", raw.icon);
    else if (raw.icon && typeof raw.icon === "object") {
      png("icon.image", raw.icon.image);
      if (raw.icon.backgroundColor !== undefined) color("icon.backgroundColor", raw.icon.backgroundColor);
    } else problems.push(`icon must be a .png path or { image, backgroundColor } (got ${JSON.stringify(raw.icon)})`);
  }
  const splash = raw.splash;
  if (splash === undefined) return;
  if (!splash || typeof splash !== "object") return void problems.push("splash must be an object");
  const bg = splash.backgroundColor;
  if (bg !== undefined) {
    if (bg && typeof bg === "object") {
      color("splash.backgroundColor.light", bg.light);
      color("splash.backgroundColor.dark", bg.dark);
    } else color("splash.backgroundColor", bg);
  }
  if (splash.image !== undefined) png("splash.image", splash.image);
  if (splash.autoHide !== undefined && typeof splash.autoHide !== "boolean")
    problems.push("splash.autoHide must be true or false");
  if (
    splash.timeout !== undefined &&
    (typeof splash.timeout !== "number" || !(splash.timeout > 0) || splash.timeout > 60_000)
  ) {
    problems.push("splash.timeout must be a number of milliseconds between 1 and 60000");
  }
}

// ---------------------------------------------------------------- plugins

export interface NativeSubset {
  /** Methods this platform implements. Default: all of the manifest's methods. */
  methods?: string[];
  events?: string[];
  /** The methods and events not listed run the plugin's web implementation instead of being UNSUPPORTED. */
  web?: boolean;
}

export interface IosManifest extends NativeSubset {
  /** Swift files, relative to the plugin folder. Globs allowed. */
  sources: string[];
  /** Swift class conforming to AkanNativePlugin. */
  class: string;
  frameworks?: string[];
  /** Info.plist entries, typically usage descriptions. The app config may override the texts. */
  infoPlist?: Record<string, PlistValue>;
  /**
   * Required Reason APIs the plugin's code calls (App Store privacy manifest), by category without the
   * NSPrivacyAccessedAPICategory prefix, e.g. { "UserDefaults": ["CA92.1"] }. Merged into
   * PrivacyInfo.xcprivacy (lib/privacy.ts).
   */
  privacyApis?: Record<string, string[]>;
  /** Entitlements the plugin's feature needs (e.g. aps-environment), merged like Info.plist entries. */
  entitlements?: Record<string, PlistValue>;
}

export interface AndroidManifest extends NativeSubset {
  /** Kotlin or Java files, relative to the plugin folder. Globs allowed. */
  sources: string[];
  /** Fully qualified class with a constructor (AkanNativePluginContext). */
  class: string;
  permissions?: string[];
  /** Extra XML inserted into <application> (e.g. a <provider>). ${applicationId} is replaced. */
  applicationXml?: string;
  /** Extra XML at the <manifest> level (e.g. <queries> for package visibility). ${applicationId} is replaced. */
  manifestXml?: string;
  /** Extra R8 rules for release builds. Components named in applicationXml are kept automatically. */
  proguard?: string[];
  /**
   * Pinned Maven libraries the plugin needs (akanjs readiness O8), as root coordinates, e.g.
   * "com.android.billingclient:billing:9.1.0". Their closure comes from native/android/maven.lock.json
   * and goes only into apps that use the plugin.
   */
  maven?: string[];
  /**
   * The lowest Android API the plugin runs on, when it is above the app's (e.g. 35 for sqlite, built on
   * SQLiteRawStatement). Below it the plugin is not created and every call is UNSUPPORTED; its package
   * may use APIs up to this level without version checks (apilevel.ts).
   */
  minSdk?: number;
}

/** Desktop Bun module that implements only some methods (the rest are UNSUPPORTED, or web with `web: true`). */
export interface DesktopManifest extends NativeSubset {
  module: string;
}

export interface PluginManifest {
  id: string;
  apiVersion: 1;
  /** The JS API surface. Native implementations must handle all of them. */
  methods: string[];
  events: string[];
  web?: string | null;
  /**
   * Per platform: "web" = the web implementation runs in the app's WebView,
   * native description = native implementation, null or missing = unsupported.
   * desktop takes a path to a Bun module (run in the desktop Worker) as its native form.
   */
  desktop?: "web" | string | DesktopManifest | null;
  /** macOS packaging extras, e.g. usage descriptions needed by a "web" desktop implementation. */
  macos?: { infoPlist?: Record<string, PlistValue> };
  ios?: IosManifest | "web" | null;
  android?: AndroidManifest | "web" | null;
  /**
   * PL-11. What "<id>:default" grants: local permission names (allow-<method>,
   * allow-listen-<event>, set names, "all"). Absent: every method and event.
   */
  defaultPermissions?: string[];
  /** Named permission sets, e.g. { read: { permissions: ["allow-readFile", "allow-stat"] } } → "<id>:read". */
  permissionSets?: Record<string, PermissionSet>;
  /** The scope fields the plugin enforces, with a description each, e.g. { path: "glob relative to base" }. */
  /** `urlFields`: the fields that hold URL patterns (matched by urlMatch; the build checks their denies). */
  scope?: { description?: string; fields: Record<string, string>; urlFields?: string[]; pathFields?: string[] };
  /**
   * Scopes of `<plugin>:default`, which an app without `capabilities` gets: what the plugin allows
   * without the app asking (filesystem: the app's own folders; http: no URL). A capability's own
   * `allow` on `<plugin>:default` replaces these; its `deny` is added.
   */
  defaultScope?: { allow?: Record<string, string>[]; deny?: Record<string, string>[] };
  /**
   * PL-10: generate Swift / Kotlin types and a `<Plugin>PluginSpec` protocol from the
   * definePlugin<Api, Events> interfaces in src/index.ts into every iOS and Android build.
   */
  codegen?: boolean;
  /**
   * Plugins whose native code this plugin's native code uses (architecture review stage 6). Each must
   * be in the app's plugins (akan-native never adds one by itself) and have a native part wherever this one does.
   */
  dependencies?: string[];
  /**
   * Events whose payload is a snapshot (progress, a size, a position): the host sends only the latest
   * of a burst, at most about every 100 ms (architecture review stage 4). The payload must be
   * cumulative or absolute, never a delta; an end state is a method's result, not an event.
   */
  coalesce?: string[];
}

export interface ResolvedPlugin {
  /** What the app config listed. */
  spec: string;
  dir: string;
  manifest: PluginManifest;
}

const PLUGIN_ID = /^[a-z][a-z0-9-]{0,62}$/;

/**
 * Where a plugin's manifest is: a builtin plugin by id ("camera": the package's plugins/camera), a
 * folder by path (absolute, or relative to the app; how akanjs passes plugins), else a package name
 * resolved from `resolveFrom`.
 */
function resolveManifestPath(appDir: string, spec: string, resolveFrom: string): string {
  if (PLUGIN_ID.test(spec)) {
    const path = join(PACKAGE_ROOT, "plugins", spec, "native-plugin.json");
    if (!existsSync(path))
      throw new CliError(
        `plugin ${spec}: no builtin plugin with this id (plugins/${spec}); give another plugin by its folder path`,
      );
    return path;
  }
  if (spec.startsWith(".") || isAbsolute(spec)) {
    const path = join(resolve(appDir, spec), "native-plugin.json");
    if (!existsSync(path)) throw new CliError(`plugin ${spec}: ${path} not found`);
    return path;
  }
  try {
    return Bun.resolveSync(`${spec}/native-plugin.json`, resolveFrom);
  } catch {
    throw new CliError(
      `plugin ${spec}: cannot resolve ${spec}/native-plugin.json from ${resolveFrom} (installed? exported in package.json?)`,
    );
  }
}

export function resolvePlugins(appDir: string, specs: string[], resolveFrom = appDir): ResolvedPlugin[] {
  const seen = new Map<string, string>();
  const resolved = specs.map((spec) => {
    const path = resolveManifestPath(appDir, spec, resolveFrom);
    let manifest: PluginManifest;
    try {
      manifest = JSON.parse(readFileSync(path, "utf8"));
    } catch (error) {
      throw new CliError(`plugin ${spec}: invalid JSON in ${path}: ${(error as Error).message}`);
    }
    if (typeof manifest.id !== "string" || !PLUGIN_ID.test(manifest.id))
      throw new CliError(`plugin ${spec}: invalid id ${JSON.stringify(manifest.id)}`);
    if (typeof manifest.apiVersion === "number" && manifest.apiVersion > 1) {
      throw new CliError(
        `plugin ${spec}: needs a newer akan-native (it is written for plugin apiVersion ${manifest.apiVersion}; this akan-native reads 1)`,
      );
    }
    if (manifest.apiVersion !== 1) throw new CliError(`plugin ${spec}: unsupported apiVersion ${manifest.apiVersion}`);
    const unknown = unknownManifestKeys(manifest);
    if (unknown.length) throw new CliError(`plugin ${spec}: unknown keys in native-plugin.json: ${unknown.join(", ")}`);
    if (
      manifest.dependencies !== undefined &&
      !(
        Array.isArray(manifest.dependencies) &&
        manifest.dependencies.every((d) => typeof d === "string" && PLUGIN_ID.test(d))
      )
    ) {
      throw new CliError(`plugin ${spec}: dependencies must be a list of plugin ids`);
    }
    if (
      manifest.coalesce !== undefined &&
      !(Array.isArray(manifest.coalesce) && manifest.coalesce.every((e) => (manifest.events ?? []).includes(e)))
    ) {
      throw new CliError(`plugin ${spec}: coalesce must list events of the plugin`);
    }
    if (!Array.isArray(manifest.methods) || !Array.isArray(manifest.events ?? []))
      throw new CliError(`plugin ${spec}: methods and events must be arrays`);
    manifest.events ??= [];
    // Names starting with "$" are the bridge's own operations; a plugin's may not look like one.
    for (const [kind, names] of [
      ["method", manifest.methods],
      ["event", manifest.events],
    ] as const) {
      for (const name of names as unknown[]) {
        if (typeof name !== "string" || !MEMBER_NAME.test(name))
          throw new CliError(
            `plugin ${spec}: ${kind} name ${JSON.stringify(name)} must start with a letter and hold only letters, digits and "_" ("$" names belong to the bridge)`,
          );
        if (kind === "method" && RESERVED_MEMBERS.includes(name))
          throw new CliError(
            `plugin ${spec}: method name "${name}" is reserved (the plugin object or JavaScript uses it)`,
          );
      }
    }
    if (manifest.codegen !== undefined && typeof manifest.codegen !== "boolean")
      throw new CliError(`plugin ${spec}: codegen must be true or false`);
    const permissionIssues = manifestPermissionProblems(manifest);
    if (permissionIssues.length) throw new CliError(`plugin ${spec}: ${permissionIssues.join("; ")}`);
    const other = seen.get(manifest.id);
    if (other) throw new CliError(`plugin id "${manifest.id}" is provided by both ${other} and ${spec}`);
    seen.set(manifest.id, spec);
    return { spec, dir: dirname(path), manifest };
  });
  for (const { spec, manifest } of resolved) {
    for (const dep of manifest.dependencies ?? []) {
      if (!seen.has(dep))
        throw new CliError(
          `plugin ${spec} needs plugin "${dep}": add it to the app's plugins (akan-native does not add plugins by itself)`,
        );
    }
  }
  return resolved;
}

const MANIFEST_KEYS: Record<string, readonly string[]> = {
  "": [
    "$schema",
    "description",
    "id",
    "apiVersion",
    "methods",
    "events",
    "coalesce",
    "codegen",
    "web",
    "desktop",
    "macos",
    "ios",
    "android",
    "defaultPermissions",
    "permissionSets",
    "scope",
    "defaultScope",
    "dependencies",
  ],
  ios: ["methods", "events", "web", "sources", "class", "frameworks", "infoPlist", "privacyApis", "entitlements"],
  android: [
    "methods",
    "events",
    "web",
    "sources",
    "class",
    "permissions",
    "applicationXml",
    "manifestXml",
    "proguard",
    "maven",
    "minSdk",
  ],
  desktop: ["methods", "events", "web", "module"],
  macos: ["infoPlist"],
};

/** Keys akan-native does not know, at the top and in the platform entries ("ios.bogus"). A typo would otherwise do nothing. */
export function unknownManifestKeys(manifest: object): string[] {
  const out: string[] = [];
  for (const key of Object.keys(manifest)) if (!MANIFEST_KEYS[""]!.includes(key)) out.push(key);
  for (const platform of ["ios", "android", "desktop", "macos"]) {
    const entry = (manifest as Record<string, unknown>)[platform];
    if (!entry || typeof entry !== "object") continue;
    for (const key of Object.keys(entry)) if (!MANIFEST_KEYS[platform]!.includes(key)) out.push(`${platform}.${key}`);
  }
  return out;
}

/**
 * Plugins whose native part needs another plugin's native part on this platform (dependencies):
 * the other one must not be web-only or missing there.
 */
export function dependencyProblems(plugins: ResolvedPlugin[], platform: string): string[] {
  const entryKey = platform === "ios" || platform === "android" ? platform : platform === "web" ? null : "desktop";
  if (!entryKey) return [];
  const byId = new Map(plugins.map((p) => [p.manifest.id, p]));
  const native = (p: ResolvedPlugin) => {
    const entry = (p.manifest as unknown as Record<string, unknown>)[entryKey];
    return entry !== undefined && entry !== null && entry !== "web";
  };
  const problems: string[] = [];
  for (const plugin of plugins) {
    if (!native(plugin)) continue;
    for (const dep of plugin.manifest.dependencies ?? []) {
      const other = byId.get(dep);
      if (other && !native(other))
        problems.push(
          `plugin ${plugin.manifest.id} needs the native part of plugin ${dep}, which has none on ${platform}`,
        );
    }
  }
  return problems;
}

function checkPrivacy(privacy: AkanNativeConfig["privacy"], problems: string[]): void {
  if (privacy === undefined) return;
  if (!privacy || typeof privacy !== "object" || Array.isArray(privacy))
    return void problems.push("privacy must be an object");
  if (privacy.tracking !== undefined && typeof privacy.tracking !== "boolean")
    problems.push("privacy.tracking must be a boolean");
  if (
    privacy.trackingDomains !== undefined &&
    !(Array.isArray(privacy.trackingDomains) && privacy.trackingDomains.every((d) => typeof d === "string" && d))
  ) {
    problems.push("privacy.trackingDomains must be a list of domains");
  }
  if (
    privacy.collectedDataTypes !== undefined &&
    !(
      Array.isArray(privacy.collectedDataTypes) &&
      privacy.collectedDataTypes.every(
        (t) => t && typeof t === "object" && typeof t.NSPrivacyCollectedDataType === "string",
      )
    )
  ) {
    problems.push("privacy.collectedDataTypes must be a list of dictionaries with NSPrivacyCollectedDataType");
  }
  problems.push(...privacyApiProblems({ who: "privacy.accessedApis", apis: privacy.accessedApis }));
}

const HOST = /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

/** deepLinks.domains, native.ios, native.android and native.resources (akanjs readiness O5). */
function checkNative(raw: AkanNativeConfig, appDir: string, problems: string[]): void {
  for (const domain of raw.deepLinks?.domains ?? []) {
    const host = typeof domain === "string" ? domain : domain?.host;
    if (typeof host !== "string" || !HOST.test(host))
      problems.push(`deepLinks.domains: ${JSON.stringify(host)} is not a host name like "example.com"`);
    const prefixes = typeof domain === "object" ? domain.pathPrefixes : undefined;
    if (
      prefixes !== undefined &&
      !(Array.isArray(prefixes) && prefixes.every((p) => typeof p === "string" && p.startsWith("/")))
    ) {
      problems.push(`deepLinks.domains: pathPrefixes of ${host} must be paths starting with "/"`);
    }
  }
  const native = raw.native;
  if (native === undefined) return;
  if (!native || typeof native !== "object") return void problems.push("native must be an object");
  const dict = (what: string, value: unknown) => {
    if (value !== undefined && (!value || typeof value !== "object" || Array.isArray(value)))
      problems.push(`${what} must be an object of plist values`);
  };
  dict("native.ios.infoPlist", native.ios?.infoPlist);
  dict("native.ios.entitlements", native.ios?.entitlements);
  dict("native.macos.entitlements", native.macos?.entitlements);
  for (const key of ["manifest", "application", "activity"] as const) {
    const xml = native.android?.[key];
    if (
      xml !== undefined &&
      !(Array.isArray(xml) && xml.every((x) => typeof x === "string" && x.trim().startsWith("<")))
    ) {
      problems.push(`native.android.${key} must be a list of XML fragments`);
    }
  }
  for (const [i, r] of (native.resources ?? []).entries()) {
    if (!r || typeof r.from !== "string" || typeof r.to !== "string") {
      problems.push(`native.resources[${i}] needs from and to`);
      continue;
    }
    if (!existsSync(resolve(appDir, r.from)))
      problems.push(`native.resources[${i}]: ${resolve(appDir, r.from)} not found`);
    const problem = resourceTargetProblem(r.to);
    if (problem) problems.push(`native.resources[${i}]: ${problem}`);
  }
}

/** Why a resource's logical `to` is not allowed, or null. */
export function resourceTargetProblem(to: string): string | null {
  const parts = to.split("/");
  if (parts.some((p) => p === "" || p === "." || p === ".."))
    return `"${to}" must be a relative path without . or .. parts`;
  if (parts[0] === "ios") {
    if (parts.length < 2) return `"${to}" needs a file name after ios/`;
    if (
      [
        "Info.plist",
        "PrivacyInfo.xcprivacy",
        "app",
        "akan-native",
        "_CodeSignature",
        "embedded.mobileprovision",
        "Assets.car",
      ].includes(parts[1]!)
    )
      return `"${to}" would replace a file akan-native writes`;
    return null;
  }
  if (parts[0] === "android" && parts[1] === "res") {
    if (
      parts.length !== 4 ||
      !/^[a-z]+(-[a-zA-Z0-9+]+)*$/.test(parts[2]!) ||
      !/^[a-z0-9_]+\.[a-z0-9]+$/.test(parts[3]!)
    ) {
      return `"${to}" must be android/res/<type>/<name> with a lowercase resource name (e.g. android/res/raw/chime.mp3)`;
    }
    return null;
  }
  if (parts[0] === "android" && parts[1] === "assets") {
    if (parts.length < 3) return `"${to}" needs a file after android/assets/`;
    if (parts[2] === "app" || parts[2] === "akan-native") return `"${to}": android/assets/${parts[2]} is akan-native's`;
    return null;
  }
  return `"${to}" must start with ios/, android/res/ or android/assets/`;
}
