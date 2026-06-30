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

export type AppConfig = DeepPartial<AppConfigResult> | ((app: AppConfigContext) => DeepPartial<AppConfigResult>);
export type LibConfig = DeepPartial<LibConfigResult> | ((lib: LibConfigContext) => DeepPartial<LibConfigResult>);
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
