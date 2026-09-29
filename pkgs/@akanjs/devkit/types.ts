export interface PackageJson {
  name: string;
  type?: "module" | "commonjs";
  version: string;
  main?: string;
  description: string;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  peerDependenciesMeta?: Record<string, { optional?: boolean }>;
  optionalDependencies?: Record<string, string>;
  trustedDependencies?: string[];
  overrides?: Record<string, string>;
  engines?: Record<string, string>;
  exports?: Record<string, string | Record<string, string>>;
  bun?: {
    platform?: "node" | "browser" | "bun";
  };
  publishConfig?: { access?: "public" | "restricted"; registry?: string; tag?: string };
  [key: string]: unknown;
}

export interface TsConfigJson {
  extends?: string;
  compilerOptions: {
    target: string;
    paths?: Record<string, string[]>;
  };
  references?: {
    path: string;
  }[];
}

export interface FileContent {
  filePath: string;
  content: string;
}

export interface BaseDevEnv {
  workspaceRoot: string | undefined;
  repoName: string;
  serveDomain: string;
  env: "testing" | "debug" | "develop" | "main" | "local";
  portOffset: number;
  appName?: string | undefined;
}
