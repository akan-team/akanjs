import type { PageEntry } from "../artifact/implicitRootLayout";

export interface CsrDevGraphModule {
  vendor: boolean;
  mtimeMs: number;
  hash: string;
  deps: string[];
  helpers?: string;
}

export interface CsrDevGraph {
  version: 1;
  configKey: string;
  refresh: string;
  entries: Record<string, string>;
  modules: Record<string, CsrDevGraphModule>;
  resolution: Record<string, Record<string, string>>;
  pending: string[];
}

export interface CsrDevContext {
  pageEntries: PageEntry[];
  basePaths: string[];
  htmlBasePaths: string[];
  define: Record<string, string>;
  optimizeImports: string[];
  configKey: string;
  refreshFile: string;
}

export interface CsrDevSharedHelpers {
  hash: string;
  definition: string;
}

export interface CsrDevCompiledModule {
  id: string;
  file: string;
  vendor: boolean;
  factory: string;
  helpers: CsrDevSharedHelpers | null;
  sourceMap?: string;
  deps: string[];
  mtimeMs: number;
  hash: string;
}

/** Module factories by id and helper definitions by hash, kept in memory so app.js is written without a pass over the disk. */
export interface CsrDevCode {
  modules: Map<string, string>;
  helpers: Map<string, string>;
}
