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
  engines?: Record<string, string>;
  exports?: Record<string, Record<string, string>>;
  esbuild?: {
    platform?: "node" | "browser" | "neutral";
  };
  [key: string]: any;
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
