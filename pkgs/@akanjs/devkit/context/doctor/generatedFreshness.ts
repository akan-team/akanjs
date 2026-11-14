import path from "node:path";
import type { WorkspaceExecutor } from "../../executors";
import { type GeneratedSyncState, workflowSyncDir } from "../../workflow";
import type { GeneratedFilesFreshness } from "../akanContext";
import { safeReadDir, safeReadJson } from "../safeRead";

const unknownGeneratedFilesFreshness: GeneratedFilesFreshness = {
  status: "unknown" as const,
  message: "Run sync before validation so generated Akan files match the current source conventions.",
  refreshCommand: "akan sync <app-or-lib>",
  verifyingCommands: ["akan verify <app-or-lib>"],
};

const readGeneratedSyncStates = async (workspace: WorkspaceExecutor) => {
  const syncDir = path.join(workspace.workspaceRoot, workflowSyncDir);
  const entries = await safeReadDir(syncDir);
  const states = await Promise.all(
    entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
      .map((entry) => safeReadJson<GeneratedSyncState>(path.join(syncDir, entry.name))),
  );
  return states.filter(
    (state): state is GeneratedSyncState =>
      !!state && state.schemaVersion === 1 && typeof state.target === "string" && typeof state.syncedAt === "string",
  );
};

export const generatedFreshnessFromStates = async (workspace: WorkspaceExecutor): Promise<GeneratedFilesFreshness> => {
  const states = await readGeneratedSyncStates(workspace);
  if (states.length === 0) return unknownGeneratedFilesFreshness;
  const targets = states
    .sort((a, b) => a.target.localeCompare(b.target))
    .map((state) => ({
      target: state.target,
      status: state.status === "passed" ? ("fresh" as const) : ("stale" as const),
      lastSyncedAt: state.syncedAt,
      runId: state.runId,
      generatedFiles: state.generatedFiles.map((file) => file.path),
      reason:
        state.status === "passed"
          ? `Generated files were refreshed by ${state.command}.`
          : `Last generated repair command failed: ${state.command}.`,
    }));
  const lastFresh = targets
    .filter((target) => target.status === "fresh" && target.lastSyncedAt)
    .sort((a, b) => (b.lastSyncedAt ?? "").localeCompare(a.lastSyncedAt ?? ""))[0];
  return {
    status: targets.some((target) => target.status === "fresh") ? "fresh" : "stale",
    message: lastFresh
      ? `Generated files were refreshed for ${lastFresh.target} at ${lastFresh.lastSyncedAt}.`
      : "Generated sync state exists, but the last recorded repair did not pass.",
    refreshCommand: "akan sync <app-or-lib>",
    verifyingCommands: ["akan verify <app-or-lib>"],
    targets,
  };
};
