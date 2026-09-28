import type { FontOptimizer } from "@akanjs/devkit/frontendBuild";
import type { BaseBuildArtifact, CssPayload, HmrTrace, PagesBundlePayload } from "akanjs/server";

export type OptimizedFonts = Awaited<ReturnType<FontOptimizer["optimize"]>>;

// `base` is the boot build: it always runs alone, before the builder can serve anything.
export type BuildBatchNeed = "base" | "pages" | "css" | "csr" | "ssr";

// JSON only: the worker is spawned per batch and receives this in its argv.
export interface BuildBatchRequest {
  appName: string;
  workspaceRoot: string;
  repoName: string;
  generation: number;
  needs: BuildBatchNeed[];
  changedFiles: string[];
  pageKeys: string[] | null; // null: the worker discovers them itself
  optimizedFonts: OptimizedFonts | null; // reused unless this batch touched one of its files
  cssAssets: PagesBatchCssAssets | null; // an unchanged compile skips the broadcast instead of busting hashes
  artifactDir: string;
  trace?: HmrTrace;
}

export type PagesBatchCssAssets = CssPayload["cssAssets"];

// Browser payloads stream as each need finishes; only state the next batch needs travels back here.
export interface BuildBatchResult {
  generation: number;
  cssAssets?: PagesBatchCssAssets;
  optimizedFonts?: OptimizedFonts;
  artifact?: BaseBuildArtifact; // `base` batches only
  errors: Partial<Record<BuildBatchNeed, string>>;
  crashed?: boolean; // died before reporting its result
  /** Of a crashed batch, the needs it died before reporting: the others streamed their build-status first. */
  crashedNeeds?: BuildBatchNeed[];
}

export type BuildBatchMessage = { type: "build-batch-result"; data: BuildBatchResult };
export type { PagesBundlePayload };
