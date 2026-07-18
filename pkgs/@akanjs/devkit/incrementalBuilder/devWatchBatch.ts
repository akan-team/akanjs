import type { BuilderEvent, ChangeBatch } from "akanjs/server";
import type { DevChangePlanner, GeneratedIndexSyncResult } from "../frontendBuild";

export interface PrepareDevWatchBatchOptions {
  generation: number;
  batch: ChangeBatch;
  indexSync: GeneratedIndexSyncResult;
  changePlanner: DevChangePlanner;
}

export interface PreparedDevWatchBatch {
  files: string[];
  kinds: ("code" | "css" | "config")[];
  expandedBatch: ChangeBatch;
  event: Extract<BuilderEvent, { type: "invalidate" }>;
  hasSyncErrors: boolean;
}

export const prepareDevWatchBatch = ({
  generation,
  batch,
  indexSync,
  changePlanner,
}: PrepareDevWatchBatchOptions): PreparedDevWatchBatch => {
  const files = [...new Set([...batch.files, ...indexSync.changedFiles])].sort();
  const kindSet = new Set(batch.kinds);
  if (indexSync.changedFiles.length > 0) kindSet.add("code");
  const kinds = [...kindSet] as ("code" | "css" | "config")[];
  const expandedBatch: ChangeBatch = { files, kinds: kindSet };
  const devPlan = changePlanner.plan({
    generation,
    files,
    kinds,
    generatedFiles: indexSync.changedFiles,
  });

  if (indexSync.errors.length > 0 && !devPlan.actions.includes("report-error")) {
    devPlan.actions = [...devPlan.actions, "report-error"].sort();
  }

  return {
    files,
    kinds,
    expandedBatch,
    event: { type: "invalidate", kinds, files, generation, devPlan },
    hasSyncErrors: indexSync.errors.length > 0,
  };
};
