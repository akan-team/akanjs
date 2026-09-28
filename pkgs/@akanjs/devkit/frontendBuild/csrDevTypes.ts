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
  /** Specifiers per importer id `resolution` holds from Bun's runtime resolver rather than the browser build. */
  runtimeResolved?: Record<string, string[]>;
  pending: string[];
  /** A build worker's failed round: the ids it built, and the files it failed in or named, by hash. */
  failed?: { roots: string[]; files: Record<string, string> };
  /** The stamp of the signal and dictionary sources the last whole build inlined; see `RegistryMetadataFingerprint`. */
  metadata?: string;
}

export interface CsrDevContext {
  pageEntries: PageEntry[];
  basePaths: string[];
  htmlBasePaths: string[];
  define: Record<string, string>;
  optimizeImports: string[];
  configKey: string;
  /** Null when the page already loads the React Refresh runtime (an SSR page's import map). */
  refreshFile: string | null;
  /** Bare specifiers the page already loads (an SSR page's import map): required as `vendor:<specifier>`, not compiled. */
  externals?: readonly string[];
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
