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
  /** Additional Bun plugins applied to the client bundle build. */
  plugins?: BunPlugin[];
  /**
   * Legacy fallback: additional directories to filesystem-scan for
   * `"use client"` entry points. Only used when `workspaceRoot` /
   * `tsconfigPaths` are not provided (in which case we fall back to the old
   * filesystem-scan strategy). Prefer the graph-based discovery.
   */
  extraClientScanRoots?: string[];
  /**
   * Environment variables to inline into the browser bundle via `define`.
   * Keys are the original `process.env` names. Each key is emitted as
   * `process.env.<KEY>` so existing server/client shared code that reads
   * `process.env.AKAN_PUBLIC_*` keeps working unchanged.
   */
  publicEnv?: Record<string, string>;
  /**
   * Workspace root used by the graph-based client-entry discovery to resolve
   * tsconfig-aliased specifiers (`@libs/shared/ui`, `@apps/<name>/client`,
   * ...). When provided together with `tsconfigPaths`, discovery traverses
   * the import graph starting from `appDir` instead of doing a filesystem
   * scan, so `"use client"` files that no route transitively imports (e.g.
   * unused editor components in a shared UI package) stay out of the client
   * bundle.
   */
  workspaceRoot?: string;
  /** Workspace tsconfig `compilerOptions.paths`. See `workspaceRoot`. */
  tsconfigPaths?: Record<string, string[]>;
  /**
   * Barrel specifiers whose imports are flattened by `barrelImportsPlugin`.
   * Discovery rewrites barrel imports with the same analyzer before scanning,
   * so the traversal sees the same leaf files the bundler will see.
   */
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
  /**
   * Future Fast Refresh hook. Bun only injects the React Refresh transform;
   * the browser runtime/update protocol still needs to be provided by Akan.
   */
  reactFastRefresh?: boolean;
}

export interface BundleClientEntriesInternalOptions extends BundleClientEntriesOptions {
  external?: readonly string[];
  externalSubpaths?: readonly string[];
  externalAliases?: Partial<Record<string, string>>;
  command?: "build" | "start";
}

export interface BundleClientEntriesResult {
  manifest: ClientManifest;
  ssrManifest: SsrManifest;
  /** Absolute path → serve URL for every entry point we produced. */
  entryUrlsByAbsPath: Map<string, string>;
  /** Absolute source entry path → emitted entry file absolute path. */
  entryOutputAbsByAbsPath: Map<string, string>;
  /** Absolute source files that Bun included for each client entry bundle. */
  entryDepsByAbsPath: Map<string, string[]>;
  /** Absolute source entry path → workspace-relative client reference id. */
  clientReferenceIdByAbsPath: Map<string, string>;
}

export type AkanConfig = Awaited<ReturnType<App["getConfig"]>>;
export type ScannedImport = { path: string; kind?: string };
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
