import { CapacitorConfig } from "@capacitor/cli";
import type { NextConfig } from "next";

import { NextConfigFn } from "./nextConfig";

export interface RunnerProps {
  type: "app" | "lib";
  name: string;
  repoName: string;
  serveDomain: string;
  env: "testing" | "local" | "debug" | "develop" | "main";
}

export const archs = ["amd64", "arm64"] as const;
export type Arch = (typeof archs)[number];
export type ExplicitDependencies = string[] | { [key in Arch]: string[] };
export interface DockerConfig {
  content: string;
  image: string | { [key in Arch]?: string };
  preRuns: (string | { [key in Arch]?: string })[];
  postRuns: (string | { [key in Arch]?: string })[];
  command: string[];
}

export interface AppConfigResult {
  backend: {
    docker: DockerConfig;
    explicitDependencies: ExplicitDependencies;
  };
  frontend: {
    docker: DockerConfig;
    nextConfig:
      | NextConfig
      | NextConfigFn
      | ((baseConfig?: NextConfig) => Promise<NextConfig> | NextConfig | NextConfigFn);
    routes?: { basePath?: string; domains: { main?: string[]; develop?: string[]; debug?: string[] } }[];
    explicitDependencies: ExplicitDependencies;
  };
  mobile: CapacitorConfig & {
    version: string;
    buildNum: number;
  };
}
export interface LibConfigResult {
  backend: {
    explicitDependencies: ExplicitDependencies;
  };
  frontend: {
    explicitDependencies: ExplicitDependencies;
  };
}

export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends any[] ? T[P] : T[P] extends object ? DeepPartial<T[P]> : T[P];
};

export type AppConfig = DeepPartial<AppConfigResult> | ((props: RunnerProps) => DeepPartial<AppConfigResult>);
export type LibConfig = DeepPartial<LibConfigResult> | ((props: RunnerProps) => DeepPartial<LibConfigResult>);

export interface AkanConfigFile {
  default: NextConfig;
}

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
}
export interface AppScanResult extends ScanResult {
  akanConfig: AppConfigResult;
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
