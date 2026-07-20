import type { AkanI18nConfig } from "akanjs/common";
import type { AkanImageConfig } from "akanjs/server";

export const archs = ["amd64", "arm64"] as const;
export type Arch = (typeof archs)[number];

export interface DockerConfig {
  content: string;
  image: string | { [key in Arch]?: string };
  preRuns: (string | { [key in Arch]?: string })[];
  postRuns: (string | { [key in Arch]?: string })[];
  command: string[];
}

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

export type DatabaseMode = "single" | "multiple" | "cluster";
export type MobileEnv = "local" | "debug" | "develop" | "main";
export type MobilePermission = "camera" | "contacts" | "location" | "push";

export interface AkanMobileTargetAssets {
  icon?: string;
  splash?: string;
}

export interface AkanMobileTargetDeepLinks {
  schemes?: string[];
  domains?: string[];
  ios?: {
    teamId?: string;
  };
  android?: {
    sha256CertFingerprints?: string[];
  };
}

export interface AkanMobileTargetFiles {
  ios?: Record<string, string>;
  android?: Record<string, string>;
}

export interface AkanCapacitorLikeConfig {
  plugins?: Record<string, unknown>;
  android?: Record<string, unknown>;
  ios?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface AkanMobileTargetConfig extends AkanCapacitorLikeConfig {
  name: string;
  basePath?: string;
  indexPath?: string;
  appName: string;
  appId: string;
  version: string;
  buildNum: number;
  assets?: AkanMobileTargetAssets;
  permissions?: MobilePermission[];
  deepLinks?: AkanMobileTargetDeepLinks;
  files?: AkanMobileTargetFiles;
}

export interface AkanMobileConfig extends AkanCapacitorLikeConfig {
  appName: string;
  appId: string;
  version: string;
  buildNum: number;
  targets: Record<string, AkanMobileTargetConfig>;
}

// ── Plugin system ──
// Akan plugins let libraries (e.g. `libs/util`) contribute native/optional features
// — push, camera, contacts, … — that the web-first framework core does not bake in.
// A plugin is declared in a lib/app `akan.config.ts` `plugins` field and read live by
// the CLI/devkit at build time. Because a plugin carries functions, it is deliberately
// kept out of the serializable `AppConfigResult`/`LibConfigResult`.

export interface PluginRuntimeContext {
  readonly appName: string;
  readonly mobile: AkanMobileConfig;
  /** True when any mobile target declares the given permission. */
  hasMobilePermission(permission: MobilePermission): boolean;
}

// A minimal, framework-level view of a resolved scan (AppInfo/LibInfo), exposing the module/lib lists a
// plugin needs. Kept to `string[]` accessors so the devkit scan classes satisfy it structurally.
export interface AkanScanInfo {
  /** Transitive lib dependencies of the app (or direct deps of a lib). */
  getLibs(): string[];
  getDatabaseModules(): string[];
  getServiceModules(): string[];
  getScalarModules(): string[];
}

// A minimal, framework-level view of the CLI/devkit executor (AppExecutor/LibExecutor). It is exposed on
// plugin contexts so plugins can read scan results and perform file operations directly, without the
// framework depending on the devkit package — the devkit executors satisfy this interface structurally.
// Paths are resolved relative to the executor's `cwdPath` (see the concrete executor's getPath).
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
  /** The full app/lib executor for advanced scan-result access and file operations. */
  readonly executor: AkanExecutor;
  getPath(rel: string): string;
  fileExists(rel: string): Promise<boolean>;
  writeFile(rel: string, content: string, opts?: { overwrite?: boolean }): Promise<void>;
  /** Resolves `env/env.client.ts` and returns its exported `env`, or null when absent/invalid. */
  readEnvClient(): Promise<Record<string, unknown> | null>;
}

export interface AkanNativeContext {
  readonly appPath: string;
  /** The app executor for advanced scan-result access and file operations. */
  readonly executor: AkanExecutor;
  readonly target: AkanMobileTargetConfig;
  readonly operation: "local" | "release";
  readonly env: MobileEnv;
  /** Set NS-prefixed usage descriptions in the iOS Info.plist (Debug + Release). */
  setIosUsageDescriptions(descriptions: Record<string, string>): Promise<void>;
  /** Merge raw key/values into the iOS Info.plist (Debug + Release). */
  updateIosInfoPlist(values: Record<string, unknown>): Promise<void>;
  /** Contribute entries to the iOS entitlements file (merged, then written once per prepare). */
  addIosEntitlements(entitlements: Record<string, string | string[]>): void;
  /** Transform `ios/App/App/AppDelegate.swift` in place (no-op when the file is absent). */
  editIosAppDelegate(transform: (content: string) => string): Promise<void>;
  /** Add `uses-permission` entries to the Android manifest (without the `android.permission.` prefix). */
  addAndroidPermissions(permissions: string[]): void;
  /** Add `uses-feature` entries to the Android manifest. */
  addAndroidFeatures(features: string[]): void;
}

export interface AkanPluginCapacitorConfig {
  /** Mobile permission that activates this plugin's native config (reuses the existing permission model). */
  permission?: MobilePermission;
  /** Imperative native (Capacitor) project configuration. */
  configureNative?: (ctx: AkanNativeContext) => Promise<void>;
}

export interface AkanPlugin {
  name: string;
  /** Runtime npm packages this plugin needs; installed on demand by the CLI (e.g. firebase for push). */
  runtimePackages?: (ctx: PluginRuntimeContext) => string[];
  /** Native (Capacitor) project configuration. */
  capacitor?: AkanPluginCapacitorConfig;
  /** Build-time asset generation (e.g. `public/firebase-messaging-sw.js`). */
  syncAssets?: (ctx: AkanSyncContext) => Promise<void>;
}

export interface AppConfigResult {
  docker: DockerConfig;
  defaultDatabaseMode: DatabaseMode;
  routes?: AkanRouteConfig[];
  externalLibs: string[];
  barrelImports: string[];
  optimizeImports: string[];
  images: AkanImageConfig;
  i18n: AkanI18nConfig;
  publicEnv: string[];
  mobile: AkanMobileConfig;
  secrets: string[];
}

export interface LibConfigResult {
  externalLibs: string[];
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

export type AppConfigInput = DeepPartial<AppConfigResult> & { plugins?: AkanPlugin[] };
export type LibConfigInput = DeepPartial<LibConfigResult> & { plugins?: AkanPlugin[] };
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
  readonly file: FileConventionScanResult;
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
  readonly file: FileConventionScanResult;
  getLibs(): string[];
  getLibInfos(): Map<string, LibInfo>;
  getLibInfo(libName: string): LibInfo | undefined;
  getDatabaseModules(): string[];
  getScalarModules(): string[];
  getServiceModules(): string[];
}
