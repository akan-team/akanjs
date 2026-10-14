import type { AkanNativeConfig } from "@akanjs/native/config";
import type { AkanI18nConfig } from "akanjs/common";
import type { AkanImageConfig } from "akanjs/server";
import type { AppPipelineConfig, WorkspacePipelineConfig } from "./pipelineConfig";

export const archs = ["amd64", "arm64"] as const;
export type Arch = (typeof archs)[number];

/** The object form runs only on the matching `TARGETARCH` leg of a multi-arch build. */
export type DockerRun = string | { [key in Arch]?: string };

export interface DockerImageConfig {
  image: string | { [key in Arch]?: string };
  /** Runs before `bun install`, so a system package a native dependency needs is there for the install. */
  preRuns: DockerRun[];
  /** Runs after `bun install`, before the app files are copied. */
  postRuns: DockerRun[];
  command: string[];
}

/** The string form is taken verbatim: nothing is merged into it, not even a lib's `docker` steps. */
export type DockerConfig = string | DockerImageConfig;

export type DockerOption = string | Partial<DockerImageConfig>;

/** Steps every app mounting the lib inherits; a lib never picks the base image or the command. */
export interface LibDockerConfig {
  preRuns: DockerRun[];
  postRuns: DockerRun[];
}

/** `${process.platform}-${process.arch}` of the computer a desktop app is built on, which is the one it runs on. */
export const binPlatforms = [
  "darwin-arm64",
  "darwin-x64",
  "linux-arm64",
  "linux-x64",
  "win32-arm64",
  "win32-x64",
] as const;
export type BinPlatform = (typeof binPlatforms)[number];

/** Downloaded when the desktop app is built; the file must hash to `sha256`, so plain http is as safe as https. */
export interface AkanBinUrlSource {
  url: string;
  sha256: string;
  /** The executable inside the archive `url` names (.zip, .tar.gz, .tgz, .tar.xz, .tar.bz2, .tar). */
  file?: string;
}

/** A file on the building computer, relative to the `akan.config.ts` that declares it. */
export interface AkanBinPathSource {
  path: string;
  /** The executable inside the archive `path` names. */
  file?: string;
}

export type AkanBinSource = AkanBinUrlSource | AkanBinPathSource;

/**
 * Executables a desktop app carries, by the name its code spawns and then by platform. Their folder comes first on
 * the app's PATH, so the carried server's `spawn("ffmpeg")` runs the carried file; a native plugin finds it in
 * `ctx.binDir`.
 */
export type AkanBinConfig = Record<string, { [platform in BinPlatform]?: AkanBinSource }>;

export interface AkanRouteDomains {
  main?: string[];
  develop?: string[];
  debug?: string[];
  [branch: string]: string[] | undefined;
}

export interface AkanRouteConfig {
  basePath?: string;
  domains: AkanRouteDomains;
}

/** `ssr`: the RSC/SSR renderer with its bundles and RSC worker; `csr`: the SPA shell the native apps ship and `/__csr` serves. */
export interface AkanWebConfig {
  ssr: boolean;
  csr: boolean;
}

/**
 * `false` is an API-only app, `true` (the default) both surfaces; the object form toggles only CSR, because the CSR
 * bundle inlines the stylesheet the SSR build compiles.
 */
export type AkanWebOption = boolean | { csr: boolean };

/** Trims only the build's own copy of `public/`; source trees keep every file. */
export interface AkanAssetsConfig {
  /** Drops fonts no built surface references; an `optimize` font is served subset from `/_akan/fonts`. */
  pruneFonts: boolean;
  /** Globs relative to the owning app's or lib's `public/`, for fonts a scan cannot see (a runtime-built URL). */
  keepFonts: string[];
}

/** A lib picks only which of its own fonts must survive; whether to prune at all belongs to the app. */
export type LibAssetsConfig = Pick<AkanAssetsConfig, "keepFonts">;

export type DatabaseMode = "single" | "multiple" | "cluster";
export type NativeEnv = "local" | "debug" | "develop" | "main";
export type NativePermission = "camera" | "contacts" | "location" | "push" | "speech";

export type AkanNativeValue = string | number | boolean | AkanNativeValue[] | { [key: string]: AkanNativeValue };

/**
 * One bundle id, or one per platform, for an app whose store listings already carry different ids. A platform without
 * its own takes `default`.
 */
export type AkanNativeAppId =
  | string
  | { default?: string; ios?: string; android?: string; macos?: string; windows?: string; linux?: string };

export interface AkanNativeDeepLinks {
  /** Custom URL schemes the app opens (`board://…`). */
  schemes?: string[];
  /** Hosts whose https links open the app: universal links (iOS, `ios.teamId`) and app links (Android). */
  domains?: string[];
}

/**
 * Where an installed app looks for newer releases of itself (the native runtime's updates plugin): the whole app on a
 * desktop, the web bundle on a phone. `akan publish-update` writes and signs a release with a key on this machine;
 * `akan pack-update` writes an unsigned phone bundle for whoever holds the key to sign.
 */
export interface AkanNativeUpdatesConfig {
  /**
   * A static base URL, https in a release build, with no query: `<url>/<os>-<arch>/<channel>.json` (desktop) or
   * `<url>/<platform>/<channel>/<nativeApi>.json` (a phone's web bundle, one envelope per binary generation).
   */
  url: string;
  /**
   * The keys a phone binary trusts, raw 32-byte Ed25519 public keys in base64 (`akan update-keygen` prints one), 1 to
   * 3: the online signing key first, offline spares after it, since a key may revoke only keys listed before it. A
   * desktop app trusts the first.
   */
  publicKeys?: string[];
  /** The one-key form of `publicKeys`, never beside it: a target overriding native.updates' keys keeps its form. */
  publicKey?: string;
  /**
   * keyIds every phone release revokes (`akan update-keygen` prints a key's), kept here so a release published from a
   * fresh checkout still revokes them; `akan publish-update --revoke` starts a revocation. A key may revoke only keys
   * listed before it in publicKeys, so a release is signed with one listed after them.
   */
  revokedKeys?: string[];
  /**
   * The manifest the app follows, e.g. a "pilot" target's "pilot". Default: the backend env the app is built for
   * (`main`, `develop`, `debug`, `local`).
   */
  channel?: string;
  /** How long a newly applied release has to call notifyReady() before it is rolled back, ms. Default 10000. */
  readyTimeout?: number;
  /**
   * Where a phone posts what became of each release (downloaded, applied, confirmed, rolled back, failed) at its next
   * launch or return to the foreground, so rollback rates are visible. Left out, nothing is sent.
   */
  report?: { url: string };
}

export interface AkanNativeIosConfig {
  /** Where the iOS app starts, over the section's `indexPath`. */
  indexPath?: string;
  /** The Apple team id: the universal links of `deepLinks.domains` (apple-app-site-association). */
  teamId?: string;
  infoPlist?: Record<string, AkanNativeValue>;
  entitlements?: Record<string, AkanNativeValue>;
  /** The app's part of the iOS privacy manifest (PrivacyInfo.xcprivacy), which an App Store upload requires. */
  privacy?: AkanNativeConfig["privacy"];
  /** Files copied into the app bundle, keyed by their path there; the value is the source, relative to the app folder. */
  files?: Record<string, string>;
}

export interface AkanNativeAndroidConfig {
  /** Where the Android app starts, over the section's `indexPath`. */
  indexPath?: string;
  /** The signing certificates' SHA-256 fingerprints: the app links of `deepLinks.domains` (assetlinks.json). */
  sha256CertFingerprints?: string[];
  /** The Firebase project's google-services.json, relative to the app folder, for FCM push. */
  googleServices?: string;
  /** The notification channel, status bar icon (relative to the app folder) and accent color of pushes. */
  push?: NonNullable<AkanNativeConfig["push"]>["android"];
  /** Media plays with sound without a tap first, as it does on iOS and the desktop: a signage screen. */
  autoplay?: boolean;
  /** XML at the `<manifest>` level; `${applicationId}` is replaced. */
  manifest?: string[];
  /** XML inside `<application>`. */
  application?: string[];
  /** XML inside the app's activity. */
  activity?: string[];
  /** Files copied into the app, keyed `res/<type>/<file>` or `assets/<path>`; the value is the source. */
  files?: Record<string, string>;
}

export interface AkanNativeDesktopServerConfig {
  /**
   * Packages the image installs and the desktop app's server goes without, along with what only they pull in: an
   * addon that needs the image's system (a ROS install), code only a process the desktop app never starts loads.
   * The server's own bundle must not import them. The image is unchanged.
   */
  omit?: string[];
  /**
   * The server bundles `env/env.server.<env>.<profile>.ts` in place of `env/env.server.<env>.ts`, so the environment's
   * own file and its secrets stay off the computers the app is installed on. The build refuses a profile file that holds
   * a secret-named value.
   */
  profile?: string;
  /** What the server mounts, as `AKAN_MODULES`: names, or `@edge` for every module whose `serve()` lists edge. */
  modules?: string[];
  /**
   * Variables the server starts with over the image's, written into the app where anyone on the computer reads them:
   * the build refuses a secret-named one, and those the launcher or the stage sets.
   */
  env?: Record<string, string>;
  /** Crashes in a row before the app gives up on its server, 5 unless named; `"forever"` for a screen nobody attends. */
  restart?: "forever" | number;
  /** Asks the running server's health route every `intervalMs` (10 s) and restarts it after `failures` (3) missed. */
  watchdog?: boolean | { intervalMs?: number; failures?: number };
}

export interface AkanNativeDesktopConfig {
  /** Where the desktop app starts, over the section's `indexPath`. */
  indexPath?: string;
  /**
   * The desktop app carries the app's server (API only, database mode single, on loopback) and its pages call
   * nothing else: `true`, or `{ omit, profile, modules }` to carry it without some of the image's packages, with a
   * secret-free env, or with only some modules. `build-desktop`,
   * `start-desktop` and `publish-update` all read it, and an installed app refuses a release that carries a server
   * when it has none, or none when it has one.
   */
  server?: boolean | AkanNativeDesktopServerConfig;
  /**
   * `"reload"`: a window whose page's process ends (a crash, a hang) loads it again every time, waiting
   * longer after each end in a row, and the app relaunches when the webview's browser process ends — for an
   * app nobody attends. `"errorPage"` (default): one reload, then an error page, and a quit for the browser.
   */
  recovery?: "errorPage" | "reload";
  /**
   * The main window from its first frame: borderless fullscreen, no taskbar button (Windows, Linux), and no title
   * bar or border (`frameless`, a kiosk drawn at an exact size).
   */
  window?: { fullscreen?: boolean; skipTaskbar?: boolean; frameless?: boolean };
  /**
   * Windows: `"auto"` answers getDisplayMedia() with the first screen at once, no picker or gesture — remote
   * support on an unattended screen; it covers every media request, so not for an app that asks for a camera.
   */
  screenCapture?: "picker" | "auto";
  /**
   * Windows installer: `"bootstrapper"` (default) carries Microsoft's small setup that downloads the WebView2 Runtime
   * where none is installed; `"standalone"` carries the whole runtime (~200 MB) for a PC offline at install.
   */
  webview2?: "bootstrapper" | "standalone";
  /** Windows: who publishes the app, as the installed app's Publisher and its executable's company name (default: the app name). */
  publisher?: string;
  /**
   * macOS: entitlements of the app's executable beyond what it gets by itself — the JIT's under the hardened runtime and
   * the camera's or microphone's when a usage text asks for it — e.g. `com.apple.security.cs.disable-library-validation`
   * for a native addon signed by another team. Read when the app is signed with a team (a Developer ID).
   */
  entitlements?: Record<string, AkanNativeValue>;
  /**
   * macOS: the Finder window `build-desktop --installer` opens its dmg in — no toolbar or sidebar, the app's and the
   * Applications link's icons on a background, the app's icon on the mounted disk. Without it the window is 660×400 pt
   * on the framework's background, an arrow from the app at (180, 170) to Applications at (480, 170). A position is an
   * icon's center in points from the window's top left; the default background lines up with the default positions.
   */
  dmg?: AkanNativeDmgConfig;
}

export interface AkanNativeDmgConfig {
  /** A PNG (or TIFF) the size of the window in points, relative to the app folder; `false` for a plain window. */
  background?: string | false;
  /** The same picture at twice the pixels, for a Retina display. */
  background2x?: string;
  /** The area under the title bar, in points. Default the background's size, at 200, 120 on the screen. */
  window?: { x?: number; y?: number; width?: number; height?: number };
  /** Default 128. */
  iconSize?: number;
  /** Default 13. */
  textSize?: number;
  app?: { x: number; y: number };
  applications?: { x: number; y: number };
}

/**
 * What a native app (iOS, Android, desktop) is: the app's `native` section and each of its targets have this shape. A
 * target takes the section and overrides it field by field: objects merge key by key, and any other value — a list
 * included — replaces the section's.
 */
export interface AkanNativeSettings {
  /** The client the app opens, a basePath the routes declare; an app without basePaths leaves it out. */
  basePath?: string;
  /**
   * Where the app starts, and falls back to for a deep link's stack and a back with no history. Default `/`. A platform
   * section's own `indexPath` (`desktop.indexPath`) wins on that platform.
   */
  indexPath?: string;
  /** Default: the app's folder name. */
  appName?: string;
  /** Default: one made from the repository's and the app's names. */
  appId?: AkanNativeAppId;
  /** Executables, archives and the Swift module; letters, digits, `.`, `_` and `-`. Default: the app's folder name. */
  fileName?: string;
  /** Default `0.0.1`. */
  version?: string;
  /** Default 1. */
  buildNum?: number;
  /** A square PNG, relative to the app folder, or it with the color behind its transparent areas. */
  icon?: string | { image: string; backgroundColor?: string };
  /** A PNG shown centered at launch, or the launch screen's color, image and when it hides. */
  splash?: string | NonNullable<AkanNativeConfig["splash"]>;
  /** A window's and an external view's color before its page paints (and the splash's default): one, or `{ light, dark }`. Default white / black. */
  backgroundColor?: string | { light: string; dark: string };
  permissions?: NativePermission[];
  /** Native runtime plugins beyond the ones the permissions bring: a builtin id (`"iap"`) or a folder, from the app's. */
  plugins?: string[];
  deepLinks?: AkanNativeDeepLinks;
  updates?: Partial<AkanNativeUpdatesConfig>;
  /**
   * The web inspector (Safari's, `chrome://inspect`) in a release build too, as a debug build always has it: for an
   * internal test target only, since anyone holding the device can then read and drive the page.
   */
  devtools?: boolean;
  ios?: AkanNativeIosConfig;
  android?: AkanNativeAndroidConfig;
  desktop?: AkanNativeDesktopConfig;
}

/** `native` in akan.config.ts. Without `targets` the app has one target, named `default`. */
export interface AkanNativeAppConfig extends AkanNativeSettings {
  targets?: Record<string, AkanNativeSettings>;
}

/** One target of the app, its fields over the app's `native` section and the defaults. */
export interface AkanNativeTarget
  extends Omit<AkanNativeSettings, "appName" | "appId" | "version" | "buildNum" | "updates"> {
  name: string;
  appName: string;
  appId: AkanNativeAppId;
  version: string;
  buildNum: number;
  updates?: AkanNativeUpdatesConfig;
}

export interface AkanNativeAppResult {
  appName: string;
  appId: AkanNativeAppId;
  fileName?: string;
  version: string;
  buildNum: number;
  targets: Record<string, AkanNativeTarget>;
}

// Structural, so the devkit scan classes (AppInfo/LibInfo) satisfy it without a dependency.
export interface AkanScanInfo {
  /** Transitive lib dependencies of the app (or direct deps of a lib). */
  getLibs(): string[];
  getDatabaseModules(): string[];
  getServiceModules(): string[];
  getScalarModules(): string[];
}

// Structural, so the devkit executors satisfy it without a dependency; paths are relative to `cwdPath`.
export interface AkanExecutor {
  readonly name: string;
  readonly type: "app" | "lib";
  readonly cwdPath: string;
  getPath(rel: string): string;
  exists(rel: string): Promise<boolean>;
  readFile(rel: string): Promise<string>;
  writeFile(rel: string, content: string, opts?: { overwrite?: boolean; silent?: boolean }): Promise<unknown>;
  mkdir(rel: string): Promise<unknown>;
  removeDir(rel: string): Promise<unknown>;
  cp(src: string, dest: string): Promise<void>;
  readdir(rel: string): Promise<string[]>;
  getFilesAndDirs(rel: string): Promise<{ files: string[]; dirs: string[] }>;
  scan(options?: { refresh?: boolean; write?: boolean }): Promise<AkanScanInfo>;
}

export interface AkanSyncContext {
  readonly appName: string;
  readonly appPath: string;
  readonly executor: AkanExecutor;
  getPath(rel: string): string;
  fileExists(rel: string): Promise<boolean>;
  readFile(rel: string): Promise<string>;
  writeFile(rel: string, content: string, opts?: { overwrite?: boolean }): Promise<void>;
  /** Resolves `env/env.client.ts` and returns its exported `env`, or null when absent/invalid. */
  readEnvClient(): Promise<Record<string, unknown> | null>;
}

/** What a plugin adds to a native app whose target asks for its permission; the native build merges every one. */
export interface AkanPluginNativeConfig {
  permission: NativePermission;
  /** Native runtime plugins, by builtin id (`"camera"`). */
  plugins?: string[];
  /** iOS usage texts by description name (`cameraUsageDescription`); `$(PRODUCT_NAME)` becomes the app name. */
  usageDescriptions?: Record<string, string>;
  infoPlist?: Record<string, AkanNativeValue>;
  entitlements?: Record<string, AkanNativeValue>;
  /** `uses-permission` names, without the `android.permission.` prefix. */
  androidPermissions?: string[];
  /** `uses-feature` names, declared as not required. */
  androidFeatures?: string[];
}

/** Read live by the CLI at build time; it carries functions, so it stays out of the serializable config results. */
export interface AkanPlugin {
  name: string;
  native?: AkanPluginNativeConfig;
  /** Build-time asset generation (e.g. `public/firebase-messaging-sw.js`). */
  syncAssets?: (ctx: AkanSyncContext) => Promise<void>;
}

export interface AkanApiConfig {
  /** Where signal endpoints are mounted. Defaults to `/api`. */
  prefix: string;
  /** Where the websocket upgrade sits under `prefix`. Defaults to `/ws`. */
  websocketPrefix: string;
}

export interface AkanDatabaseConfig {
  /**
   * The build carries each mode's drivers; a deployment picks one with `AKAN_DATABASE_MODE` (required when there are
   * several), and `akan start` runs the first unless the shell names another.
   */
  modes: DatabaseMode[];
}

export interface AppConfigResult {
  docker: DockerConfig;
  database: AkanDatabaseConfig;
  /**
   * Baked into every client bundle, since a prebuilt CSR shell or mobile bundle never asks the server;
   * `new AkanApp({ prefix })` still overrides the server and every server-rendered page.
   */
  api: AkanApiConfig;
  /** Web surfaces built into the app and mounted at boot. Both default to `true`. */
  web: AkanWebConfig;
  routes?: AkanRouteConfig[];
  /**
   * Mounts `libs/<lib>/page` under `page/(libs)/(<lib>)` on sync: `true` every lib dependency with a `page` folder, an
   * array exactly those libs, `false` (the default) nothing, removing what a previous sync created.
   */
  syncPageLibs?: string[] | boolean;
  externalLibs: string[];
  /** Dependencies whose install scripts `bun install --production` runs, in the image and in a desktop app's server. */
  trustedDependencies: string[];
  /** Every desktop build, run and dev session carries these, server or not; the image installs through `docker`. */
  bin: AkanBinConfig;
  barrelImports: string[];
  optimizeImports: string[];
  images: AkanImageConfig;
  i18n: AkanI18nConfig;
  publicEnv: string[];
  native: AkanNativeAppResult;
  secrets: string[];
  assets: AkanAssetsConfig;
}

export interface LibConfigResult {
  externalLibs: string[];
  trustedDependencies: string[];
  /** Carried by the desktop app of every app that depends on this lib; an app's own entry of the same name wins. */
  bin: AkanBinConfig;
  /** Image steps every app that mounts this lib inherits, unless that app declares a whole Dockerfile. */
  docker: LibDockerConfig;
  /** Which of this lib's own public fonts every app that mounts it must keep. */
  assets: LibAssetsConfig;
}

export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends unknown[] ? T[P] : T[P] extends object ? DeepPartial<T[P]> : T[P];
};

export interface AppConfigContext {
  readonly name: string;
  readonly type: "app";
}

export interface LibConfigContext {
  readonly name: string;
  readonly type: "lib";
}

export * from "./pipelineConfig";

export type AppConfigInput = Omit<DeepPartial<AppConfigResult>, "docker" | "web" | "bin" | "native"> & {
  docker?: DockerOption;
  web?: AkanWebOption;
  bin?: AkanBinConfig;
  native?: AkanNativeAppConfig;
  plugins?: AkanPlugin[];
  pipeline?: AppPipelineConfig;
};
export type LibConfigInput = Omit<DeepPartial<LibConfigResult>, "bin"> & {
  bin?: AkanBinConfig;
  plugins?: AkanPlugin[];
};
export interface SubspaceDeclaration {
  /** Short name used on the command line and as the git remote suffix. */
  name: string;
  repo: string;
  /** Apps this subspace serves. Libraries are never listed — they are derived from each app's closure. */
  apps: string[];
  /** The subspace's own `AKAN_WORKSPACE_ID`, not this workspace's: `akan subspace upload-env` and `--subspace` read it. */
  workspaceId?: string;
}

/** The repos this workspace mirrors to, on whichever branch the workspace is on. */
export interface SubspaceConfigInput {
  /** A feature branch is refused: pushing it would copy this workspace's branch namespace into every customer repo. */
  pushableBranches?: string[];
  /** Workspace-root names or `dir/` prefixes kept out of every subspace, on top of the ones that always are. */
  exclude?: string[];
  subspaces: SubspaceDeclaration[];
}

/** The cloud a workspace's CLI talks to when a command names no `--host`: a self-hosted control plane, say. */
export interface WorkspaceCloudConfig {
  /** The cloud's origin, e.g. `https://cloud.example.com`. Default: Akan Cloud. */
  host?: string;
}

/** The workspace root's `akan.config.ts`. It never reaches a subspace, and app or lib settings are refused in it. */
export interface WorkspaceConfig {
  subspace?: SubspaceConfigInput;
  pipeline?: WorkspacePipelineConfig;
  cloud?: WorkspaceCloudConfig;
}

export type AppConfig = AppConfigInput | ((app: AppConfigContext) => AppConfigInput);
export type LibConfig = LibConfigInput | ((lib: LibConfigContext) => LibConfigInput);
export type AkanConfigFile = object;

export interface FileConventionScanResult {
  constant: { databases: string[]; scalars: string[] };
  dictionary: { databases: string[]; services: string[]; scalars: string[] };
  document: { databases: string[]; scalars: string[] };
  service: { databases: string[]; services: string[] };
  signal: { databases: string[]; services: string[] };
  store: { databases: string[]; services: string[] };
  template: { databases: string[]; services: string[]; scalars: string[] };
  unit: { databases: string[]; services: string[]; scalars: string[] };
  util: { databases: string[]; services: string[]; scalars: string[] };
  view: { databases: string[]; services: string[]; scalars: string[] };
  zone: { databases: string[]; services: string[]; scalars: string[] };
}

/**
 * The live form of `FileConventionScanResult` on `AppInfo.file`/`LibInfo.file` (every reader calls `.has()`); the
 * arrays above are its JSON form, which lists only the kinds each file type can hold.
 */
export interface FileConventionScanSet {
  all: Set<string>;
  databases: Set<string>;
  services: Set<string>;
  scalars: Set<string>;
}
export type FileConventionScanSets = { [key in keyof FileConventionScanResult]: FileConventionScanSet };

export interface ScanResult {
  name: string;
  type: "app" | "lib";
  repoName: string;
  serveDomain: string;
  files: FileConventionScanResult;
  libDeps: string[];
  pkgDeps: string[];
  dependencies: string[];
  devDependencies: string[];
}

export interface AppScanResult extends ScanResult {
  akanConfig: AppConfigResult;
  routes: string[];
}

export interface LibScanResult extends ScanResult {
  akanConfig: LibConfigResult;
}

export interface PkgScanResult {
  name: string;
  pkgDeps: string[];
  dependencies: string[];
}

export interface WorkspaceScanResult {
  appNames: string[];
  libNames: string[];
  pkgNames: string[];
  apps: { [key: string]: AppScanResult };
  libs: { [key: string]: LibScanResult };
  pkgs: { [key: string]: PkgScanResult };
}

export interface AppInfo {
  readonly name: string;
  readonly type: "app";
  readonly database: Map<string, Set<string>>;
  readonly service: Map<string, Set<string>>;
  readonly scalar: Map<string, Set<string>>;
  readonly file: FileConventionScanSets;
  getLibs(): string[];
  getLibInfos(): Map<string, LibInfo>;
  getDatabaseModules(): string[];
  getScalarModules(): string[];
  getServiceModules(): string[];
}

export interface LibInfo {
  readonly name: string;
  readonly type: "lib";
  readonly database: Map<string, Set<string>>;
  readonly service: Map<string, Set<string>>;
  readonly scalar: Map<string, Set<string>>;
  readonly file: FileConventionScanSets;
  getLibs(): string[];
  getLibInfos(): Map<string, LibInfo>;
  getLibInfo(libName: string): LibInfo | undefined;
  getDatabaseModules(): string[];
  getScalarModules(): string[];
  getServiceModules(): string[];
}
