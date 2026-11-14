import path from "node:path";
import type { WorkspaceExecutor } from "../../executors";
import {
  barrelFacetDirs,
  facetIndexShadowOf,
  isScannedRootEntry,
  rootAllowedDirs,
  rootAllowedFiles,
  rootEntryHintOf,
} from "../../workspace/workspaceLayout";
import type { AkanSysContext } from "../akanContext";
import { safeReadDir } from "../safeRead";
import { type DoctorFindings, repairAction } from "./doctorFindings";

export class RootShapeCheck {
  static async run(workspace: WorkspaceExecutor, systems: AkanSysContext[], findings: DoctorFindings) {
    for (const sys of systems) {
      const sysPath = path.join(workspace.workspaceRoot, sys.path);
      for (const entry of await safeReadDir(sysPath)) {
        if (!isScannedRootEntry(sys.type, entry.name)) continue;
        const allowed = entry.isDirectory()
          ? rootAllowedDirs[sys.type].has(entry.name)
          : rootAllowedFiles[sys.type].has(entry.name);
        const rootEntryHint = rootEntryHintOf(sys.type, entry.name);
        if (!allowed)
          findings.report(
            {
              severity: "error",
              code: `${sys.type}-root-unknown-entry`,
              path: `${sys.path}/${entry.name}`,
              message: `Unexpected ${entry.isDirectory() ? "folder" : "file"} in ${sys.type} root: ${sys.path}/${entry.name}${
                rootEntryHint ? ` (${rootEntryHint})` : ""
              }`,
            },
            repairAction(
              "module-shape",
              `akan repair module-shape --app ${sys.name}`,
              `Review ${sys.type} root shape and remove or move the unknown entry.`,
              false,
            ),
          );
      }
      for (const facet of barrelFacetDirs)
        for (const entry of await safeReadDir(path.join(sysPath, facet))) {
          const shadow = entry.isDirectory() ? null : facetIndexShadowOf(`${facet}/${entry.name}`);
          if (!shadow) continue;
          const entryPath = `${sys.path}/${facet}/${entry.name}`;
          findings.report(
            { severity: "error", code: "facet-index-shadowed", path: entryPath, message: `${entryPath} ${shadow}` },
            repairAction("generated", `akan sync ${sys.name}`, `Delete ${entryPath} by hand, then sync.`, false),
          );
        }
    }
  }
}
