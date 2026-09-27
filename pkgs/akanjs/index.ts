import type { AkanI18nConfig } from "akanjs/common";
import type { AkanImageConfig } from "akanjs/server";

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
export type MobileEnv = "local" | "debug" | "develop" | "main";
export type MobilePermission = "camera" | "contacts" | "location" | "push" | "speech";

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

/**
 * Files copied into the app, keyed by where they land: `ios/<path>` (the app bundle), `android/res/<type>/<file>` or
 * `android/assets/<path>`. The value is the source, relative to the app folder.
 */
export type AkanMobileTargetFiles = Record<string, string>;

export type AkanNativeValue = string | number | boolean | AkanNativeValue[] | { [key: string]: AkanNativeValue };

export interface AkanMobileNativeConfig {
  /** Native runtime plugins beyond the ones the permissions bring, by builtin id (`"iap"`) or absolute folder. */
  plugins?: string[];
  ios?: {
    infoPlist?: Record<string, AkanNativeValue>;
    entitlements?: Record<string, AkanNativeValue>;
  };
  android?: {
    /** XML at the `<manifest>` level; `${applicationId}` is replaced. */
    manifest?: string[];
    /** XML inside `<application>`. */
    application?: string[];
    /** XML inside the app's activity. */
    activity?: string[];
    /** The Firebase project's google-services.json, relative to the app folder, for FCM push on Android. */
    googleServices?: string;
  };
}

export interface AkanMobileTargetConfig {
  name: string;
  basePath?: string;
  indexPath?: string;
  appName: string;
  appId: string;
  /** Executables, archives and the Swift module; letters, digits, `.`, `_` and `-`. Default: the app's folder name. */
  fileName?: string;
  version: string;
  buildNum: number;
  assets?: AkanMobileTargetAssets;
  permissions?: MobilePermission[];
  deepLinks?: AkanMobileTargetDeepLinks;
  files?: AkanMobileTargetFiles;
  native?: AkanMobileNativeConfig;
}

export interface AkanMobileConfig {
  appName: string;
  appId: string;
  fileName?: string;
  version: string;
  buildNum: number;
  files?: AkanMobileTargetFiles;
  native?: AkanMobileNativeConfig;
  targets: Record<string, AkanMobileTargetConfig>;
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

/** What a plugin adds to a mobile app whose target asks for its permission; the native build merges every one. */
export interface AkanPluginNativeConfig {
  permission: MobilePermission;
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
  barrelImports: string[];
  optimizeImports: string[];
  images: AkanImageConfig;
  i18n: AkanI18nConfig;
  publicEnv: string[];
  mobile: AkanMobileConfig;
  secrets: string[];
  assets: AkanAssetsConfig;
}

export interface LibConfigResult {
  externalLibs: string[];
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

export type AppConfigInput = Omit<DeepPartial<AppConfigResult>, "docker" | "web"> & {
  docker?: DockerOption;
  web?: AkanWebOption;
  plugins?: AkanPlugin[];
};
export type LibConfigInput = DeepPartial<LibConfigResult> & { plugins?: AkanPlugin[] };
export interface SubspaceDeclaration {
  /** Short name used on the command line and as the git remote suffix. */
  name: string;
  repo: string;
  /** Apps this subspace serves. Libraries are never listed — they are derived from each app's closure. */
  apps: string[];
  /** The subspace's own `AKAN_WORKSPACE_ID`, not this workspace's; only `akan subspace upload-env` reads it. */
  workspaceId?: string;
}

/** `akan.subspace.ts`: the repos this workspace mirrors to, on whichever branch the workspace is on. */
export interface SubspaceConfigInput {
  /** A feature branch is refused: pushing it would copy this workspace's branch namespace into every customer repo. */
  pushableBranches?: string[];
  /** Workspace-root names or `dir/` prefixes kept out of every subspace, on top of the ones that always are. */
  exclude?: string[];
  subspaces: SubspaceDeclaration[];
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
