import type { AkanI18nConfig } from "akanjs/common";
import type { AkanImageConfig } from "akanjs/server";

export const archs = ["amd64", "arm64"] as const;
export type Arch = (typeof archs)[number];

/** One image step. The object form runs only on the matching `TARGETARCH` leg of a multi-arch build. */
export type DockerRun = string | { [key in Arch]?: string };

/** The pieces Akan assembles a Dockerfile from. */
export interface DockerImageConfig {
  image: string | { [key in Arch]?: string };
  /** Runs before `bun install`, so a system package a native dependency needs is there for the install. */
  preRuns: DockerRun[];
  /** Runs after `bun install`, before the app files are copied. */
  postRuns: DockerRun[];
  command: string[];
}

/**
 * A whole Dockerfile as a string, or the parts Akan assembles one from. The string form is taken verbatim —
 * nothing is merged into it, including the steps a lib contributes through its own `docker`.
 */
export type DockerConfig = string | DockerImageConfig;

/** What an `akan.config.ts` may write for `docker`: a whole Dockerfile, or any subset of the parts. */
export type DockerOption = string | Partial<DockerImageConfig>;

/**
 * A lib's contribution to the image of every app that mounts it — a lib never picks the base image or the
 * command, only the steps its own runtime needs.
 */
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

/**
 * Which web surfaces an app serves, resolved. `ssr` is the RSC/SSR route renderer and everything it needs —
 * the pages bundle, the client bundles, the RSC worker process. `csr` is the single-file SPA shell that the
 * Capacitor mobile build ships and that `/__csr` serves.
 */
export interface AkanWebConfig {
  ssr: boolean;
  csr: boolean;
}

/**
 * What an `akan.config.ts` may write. `false` is an API-only app — no web artifact is built and no web route
 * is mounted; `true` (the default) is both surfaces. The object form keeps SSR and toggles only the CSR
 * bundle, which is the whole range there is: the CSR bundle inlines the stylesheet the SSR build compiles, so
 * CSR without SSR would ship an unstyled app and is not expressible here.
 */
export type AkanWebOption = boolean | { csr: boolean };

/**
 * How `akan build` trims the `public/` tree it copies into `dist`. Source trees are never touched: an app's
 * and a lib's `public/` keep every file, and only the build's own copy is trimmed.
 */
export interface AkanAssetsConfig {
  /**
   * Drop font files from the build's `public/` that no built surface references. A font with `optimize` on is
   * served from `/_akan/fonts` after subsetting, so its source is a build input the image never reads.
   */
  pruneFonts: boolean;
  /**
   * Font files to keep whatever the scan concludes, as globs relative to this app's or lib's own `public/`
   * (`"fonts/Assistant-*.woff2"`). For the case a scan cannot see: a URL assembled at runtime. Declare it in
   * the `akan.config.ts` that owns the font, so the reason travels with the lib rather than with the app.
   */
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
  readFile(rel: string): Promise<string>;
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

export interface AkanApiConfig {
  /** Where signal endpoints are mounted. Defaults to `/api`. */
  prefix: string;
  /** Where the websocket upgrade sits under `prefix`. Defaults to `/ws`. */
  websocketPrefix: string;
}

export interface AkanDatabaseConfig {
  /**
   * The modes this app's build can run in. `akan build` bundles the drivers of each, the image lets a deployment
   * pick one of them with `AKAN_DATABASE_MODE` and no other, and `akan start` runs the first unless the shell names
   * another. A deployment of a build carrying several has to name one.
   */
  modes: DatabaseMode[];
}

export interface AppConfigResult {
  docker: DockerConfig;
  database: AkanDatabaseConfig;
  /**
   * Where this app mounts its endpoints. Declared here rather than only in `main.ts` because the value is baked
   * into every client bundle: a prebuilt CSR shell or a mobile bundle never reaches the server that would tell
   * it otherwise. `new AkanApp({ prefix })` still overrides the server and every server-rendered page.
   */
  api: AkanApiConfig;
  /** Web surfaces built into the app and mounted at boot. Both default to `true`. */
  web: AkanWebConfig;
  routes?: AkanRouteConfig[];
  /**
   * Mounts `libs/<lib>/page` into this app under `page/(libs)/(<lib>)` on sync. `true` takes every lib
   * dependency that ships a `page` folder, an array takes exactly the libs listed, `false` (the default)
   * syncs nothing and removes what a previous sync created.
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
  /** How the build trims the `public/` copy it ships. */
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
  /**
   * The cloud workspace this subspace deploys from — its own `AKAN_WORKSPACE_ID`, not this workspace's.
   * `akan subspace upload-env` is the only thing that reads it.
   */
  workspaceId?: string;
}

/**
 * What `akan.subspace.ts` at a workspace root may write: the customer repos this workspace is mirrored
 * to. There is no branch field — the branch is whichever one the workspace is on, so one declaration
 * serves every release branch and each of them holds one akanjs version and one copy of the library
 * source.
 */
export interface SubspaceConfigInput {
  /**
   * Branches a push may target. A feature branch is refused, because pushing it would copy this
   * workspace's branch namespace into every customer repo.
   */
  pushableBranches?: string[];
  /**
   * Workspace-root entries to keep out of every subspace, on top of the ones that always are. Top-level
   * names or `dir/` prefixes — a workspace's own infra, release and benchmark trees are the usual
   * entries.
   */
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
 * What a *live* scan exposes on `AppInfo.file` / `LibInfo.file`: a set per module kind, with every file
 * type carrying all four kinds. `FileConventionScanResult` above is the serialized form that crosses a
 * process boundary as JSON, which is why it is arrays and why each file type lists only the kinds it can
 * hold. The two are not interchangeable — every reader of `.file` calls `.has()`.
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
