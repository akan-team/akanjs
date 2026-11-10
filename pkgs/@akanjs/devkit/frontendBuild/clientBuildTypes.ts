import type { ClientManifest, ClientManifestEntry, SsrManifest } from "akanjs/server";
import type { BunPlugin } from "bun";
import type { App } from "../commandDecorators";

export type { ClientManifest, ClientManifestEntry };

export interface BuildClientOptions {
  appDir: string;
  rscClientEntry: string;
  outputDir?: string;
  servePrefix?: string;
  mode?: "production" | "test";
  plugins?: BunPlugin[];
  /** Legacy filesystem-scan roots, used only when `workspaceRoot` / `tsconfigPaths` are absent. */
  extraClientScanRoots?: string[];
  /** Inlined via `define` as `process.env.<KEY>`. */
  publicEnv?: Record<string, string>;
  /** With `tsconfigPaths`, discovery walks the import graph from `appDir` instead of scanning the filesystem. */
  workspaceRoot?: string;
  tsconfigPaths?: Record<string, string[]>;
  barrelImports?: string[];
}

export interface BuildClientResult {
  manifest: ClientManifest;
  ssrManifest: SsrManifest;
  outputDir: string;
  servePrefix: string;
  entries: string[];
  rscClientUrl: string;
}

export type ClientBundleTarget = "browser" | "bun";

export const CLIENT_BUNDLE_NAMING = {
  entry: "[name]-[hash].[ext]",
  chunk: "chunks/[hash].[ext]",
  asset: "assets/[hash].[ext]",
} as const;

export interface ClientEntryDiscovery {
  discover(seeds: string[]): Promise<string[]>;
  invalidate?(files: string[]): void;
}

export interface BundleClientEntriesOptions {
  app: App;
  entries: string[];
  plugins?: BunPlugin[];
  outputSubdir?: string;
  /** Bun only injects the React Refresh transform; the browser runtime and update protocol are Akan's. */
  reactFastRefresh?: boolean;
}

export interface BundleClientEntriesInternalOptions extends BundleClientEntriesOptions {
  /** Module-resolution target. `"bun"` for the server-executed `client-ssr` bundle, `"browser"` otherwise. */
  target?: ClientBundleTarget;
  external?: readonly string[];
  externalSubpaths?: readonly string[];
  externalAliases?: Partial<Record<string, string>>;
  command?: "build" | "start";
  entryExports?: Partial<Record<string, readonly string[]>>;
}

export interface BundleClientEntriesResult {
  manifest: ClientManifest;
  ssrManifest: SsrManifest;
  entryUrlsByAbsPath: Map<string, string>;
  entryOutputAbsByAbsPath: Map<string, string>;
  entryDepsByAbsPath: Map<string, string[]>;
  /** Each entry's served URL and the chunks it imports statically, the entry first. */
  entryChunkUrlsByAbsPath: Map<string, string[]>;
  externalsByChunkUrl: Map<string, string[]>;
  /** Workspace-relative client reference id per absolute source entry. */
  clientReferenceIdByAbsPath: Map<string, string>;
}

export type AkanConfig = Awaited<ReturnType<App["getConfig"]>>;
export type ScannedImport = { path: string; kind?: string; external?: boolean };
export type MetafileInput = { imports?: ScannedImport[] };
export type MetafileOutput = {
  imports: ScannedImport[];
  entryPoint?: string;
  exports?: string[];
  inputs?: Record<string, unknown>;
};

export interface OpaqueEntryAliases {
  entries: string[];
  originalByAlias: Map<string, string>;
  aliasDir: string;
}
