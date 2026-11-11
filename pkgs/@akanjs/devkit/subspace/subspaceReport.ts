import {
  Subspace,
  type SubspaceDiffResult,
  type SubspaceEnvUploadResult,
  type SubspacePlan,
  type SubspacePullResult,
  type SubspacePushResult,
  type SubspaceStatus,
} from "./subspace";

export class SubspaceReport {
  static statuses(statuses: SubspaceStatus[]) {
    const sections = [
      "Akan Subspace Status",
      `branch: ${statuses[0]?.branch ?? "(none)"}`,
      "",
      ...statuses.flatMap((status) => {
        if (!status.hasBranch) return [`  ${status.name}: no such branch in the subspace — push is refused`];
        const behind = status.behindPaths.length ? `${status.behindPaths.length} file(s) behind` : "up to date";
        const incoming = status.anchor.incoming.length
          ? `${status.anchor.incoming.length} customer commit(s) to pull`
          : "no customer commits";
        const drift = status.driftedLibs.length ? `  DRIFTED LIBS: ${status.driftedLibs.join(", ")}` : null;
        return [
          `  ${status.name}: ${behind}, ${incoming}`,
          ...status.anchor.incoming.map((commit) => `    ${commit.sha}  ${commit.author}  ${commit.subject}`),
          ...(drift ? [drift] : []),
        ];
      }),
    ];
    return sections.join("\n");
  }

  static pushResults(results: SubspacePushResult[]) {
    const sections = [
      "Akan Subspace Push",
      "",
      ...results.flatMap((result) => {
        const detail =
          result.outcome === "pushed" ? `${result.commit} (${result.changedFiles} files)` : (result.reason ?? "");
        const [first = "", ...rest] = detail.split("\n");
        const pruned = result.prunedDependencies?.length
          ? [`    ${result.prunedDependencies.length} unused root dependenc(ies) left out of package.json`]
          : [];
        return [
          `  ${result.outcome.padEnd(8)} ${result.name}  ${first}`,
          ...rest.map((line) => `    ${line}`),
          ...pruned,
        ];
      }),
    ];
    return sections.join("\n");
  }

  static pullResult(result: SubspacePullResult) {
    const sections = [
      `Akan Subspace Pull — ${result.name}`,
      "",
      `Customer commits since the last push (${result.incoming.length}):`,
      "",
      ...(result.incoming.length
        ? result.incoming.map((commit) => `  ${commit.sha}  ${commit.author}  ${commit.subject}`)
        : ["  (none — nothing to pull)"]),
      "",
      `Applied to the working tree, uncommitted (${result.applied.length}):`,
      "",
      ...(result.applied.length ? result.applied.map((file) => `  ${file}`) : ["  (none)"]),
      ...(result.libPatch
        ? [
            "",
            `Library edits NOT applied (${result.libPatch.files.length}) — review before adopting:`,
            "",
            ...result.libPatch.files.map((file) => `  ${file}`),
            "",
            `  patch: ${result.libPatch.path}`,
            "  adopt with: akan subspace pull <name> --adopt-libs",
          ]
        : []),
      ...(result.ignored.length
        ? ["", `Ignored (workspace-owned or subspace-owned): ${result.ignored.length} file(s)`]
        : []),
    ];
    return sections.join("\n");
  }

  static envUpload(result: SubspaceEnvUploadResult) {
    const sections = [
      `Akan Subspace Env Upload — ${result.name}`,
      `cloud workspace: ${result.workspaceId} · host: ${result.host}`,
      "",
      ...(result.outcome === "cancelled"
        ? ["  cancelled — the subspace's env archive is untouched."]
        : [
            `Uploaded (${result.files.length}), replacing that workspace's whole archive:`,
            "",
            ...result.files.map((file) => `  ${file}`),
            "",
            `  apps: ${result.apps.join(", ")}`,
            `  libs: ${result.libs.join(", ") || "(none)"}`,
          ]),
    ];
    return sections.join("\n");
  }

  static diff(result: SubspaceDiffResult) {
    const total = result.app.files.length + result.libs.files.length;
    const sections = [
      `Akan Subspace Diff — ${result.name} (${result.branch})`,
      "what `akan subspace push` would change in the subspace",
      "",
      ...(total ? [] : ["  subspace is identical to the workspace for this slice."]),
      ...(result.libs.files.length
        ? [
            `LIBRARY changes (${result.libs.files.length}) — the subspace edited shared code:`,
            "",
            ...result.libs.files.map((file) => `  ${file}`),
            "",
            result.libs.patch,
          ]
        : []),
      ...(result.app.files.length
        ? [
            `App changes (${result.app.files.length}):`,
            "",
            ...result.app.files.map((file) => `  ${file}`),
            "",
            result.app.patch,
          ]
        : []),
    ];
    return sections.join("\n");
  }

  static plan(plan: SubspacePlan) {
    const list = (entries: string[]) => (entries.length ? entries.join(", ") : "(none)");
    const blockers = Subspace.planBlockers(plan);
    const sections = [
      `Akan Subspace Plan — ${plan.name} (${plan.branch})`,
      `repo: ${plan.repo}`,
      "what `akan subspace push` would ship, worked out from this checkout alone",
      "",
      `apps: ${list(plan.apps)}`,
      `libs: ${plan.libs.length ? "" : "(none)"}`.trimEnd(),
      ...plan.libs.map((lib) => `  - ${lib.name} (from ${lib.apps.join(", ")})`),
      `files under apps/ and libs/: ${plan.files}`,
      "",
      `root entries pushed: ${list(plan.rootEntries)}`,
      `root entries excluded: ${list(plan.excludedRootEntries)}`,
      `root entries the subspace keeps its own: ${list(plan.subspaceOwnedRootEntries)}`,
      "",
      `Root dependencies left out of package.json (${plan.prunedDependencies.length}):`,
      ...(plan.prunedDependencies.length ? plan.prunedDependencies.map((dep) => `  - ${dep}`) : ["  (none)"]),
      "",
      blockers.length ? "A push would be refused:" : "Nothing here would make a push refuse.",
      ...blockers.map((reason) => `  - ${reason}`),
      ...(plan.warnings.length
        ? ["", `Warnings (${plan.warnings.length}):`, ...plan.warnings.map((w) => `  - ${w}`)]
        : []),
    ];
    return sections.join("\n");
  }
}
