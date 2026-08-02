import type { FontOptimizer } from "@akanjs/devkit/frontendBuild";
import type { BaseBuildArtifact, CssPayload, PagesBundlePayload } from "akanjs/server";

export type OptimizedFonts = Awaited<ReturnType<FontOptimizer["optimize"]>>;

/**
 * `base` is the boot build (`SsrBaseArtifactBuilder`) and is never batched with the others: it is what a
 * builder runs before it can serve anything, where the rest are per-save work. It earns its place here
 * for the same reason as the others — measured on `apps/akan`, it retains **+1143 MB** of bundler arena
 * that only a process exit returns, which was 65 % of the builder's whole idle footprint.
 */
export type BuildBatchNeed = "base" | "pages" | "css" | "csr";

/**
 * One generation of build work, handed to a process that exits when it is done.
 *
 * Everything here is JSON: the worker is spawned per batch, so state that the long-lived watcher
 * caches for the session has to travel by value. Two fields exist purely to keep behaviour identical
 * to the in-process version — `pageKeys` because rediscovering them costs ~220ms on a 177-route app
 * (route-export validation), and `optimizedFonts` because fonts are only re-optimized when a font file
 * actually changed.
 */
export interface BuildBatchRequest {
  appName: string;
  workspaceRoot: string;
  repoName: string;
  generation: number;
  needs: BuildBatchNeed[];
  changedFiles: string[];
  /** Page keys the watcher already validated, or null to make the worker discover them itself. */
  pageKeys: string[] | null;
  /** Previous font optimization, reused unless this batch touched one of its files. */
  optimizedFonts: OptimizedFonts | null;
  /** Previous css assets, so an unchanged compile skips the broadcast instead of busting hashes. */
  cssAssets: PagesBatchCssAssets | null;
  /** Absolute artifact directory; the worker writes css assets under it. */
  artifactDir: string;
}

export type PagesBatchCssAssets = CssPayload["cssAssets"];

/**
 * What the watcher folds back into its own state once the worker is done.
 *
 * Deliberately small: the payloads browsers are waiting on are *streamed* as each need finishes
 * (`pages-updated`, `css-updated`, `build-status`, relayed straight through), so a page reload is not
 * held back by a css compile that has not started yet. Only state the next batch needs travels here.
 */
export interface BuildBatchResult {
  generation: number;
  cssAssets?: PagesBatchCssAssets;
  optimizedFonts?: OptimizedFonts;
  /**
   * Present only for a `base` batch. The same object the worker wrote to `base-artifact.json`, returned
   * here so the watcher does not have to read its own boot build back off disk.
   */
  artifact?: BaseBuildArtifact;
  errors: Partial<Record<BuildBatchNeed, string>>;
  /** The worker died before reporting, so it streamed no `build-status` of its own for these needs. */
  crashed?: boolean;
}

export type BuildBatchMessage = { type: "build-batch-result"; data: BuildBatchResult };
export type { PagesBundlePayload };
