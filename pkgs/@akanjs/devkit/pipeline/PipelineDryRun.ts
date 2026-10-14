import type {
  PipelineDiagnostic,
  PipelinePlan,
  PipelinePlanPhase,
  PipelinePlanResult,
  PipelinePlanStage,
} from "akanjs/common";

/** A plan as a person reads it: one line per phase in run order, the executor's own work included. */
export class PipelineDryRun {
  static render(result: PipelinePlanResult) {
    const lines = result.ok ? PipelineDryRun.#plan(result.plan) : ["no plan: the definition has errors"];
    const diagnostics = PipelineDryRun.diagnostics(result.diagnostics);
    return [...lines, ...(diagnostics.length ? ["", ...diagnostics] : [])].join("\n");
  }

  static #plan(plan: PipelinePlan) {
    const { context } = plan;
    const order = plan.appOrder.join() === context.apps.join() ? "" : ` · order ${plan.appOrder.join(" → ")}`;
    const rows: [string, string, string, string][] = [
      ["prepare", "(executor)", "", "checkout · env · install · plan"],
      ...plan.phases.map((phase): [string, string, string, string] => [
        phase.milestone,
        phase.id,
        phase.name,
        PipelineDryRun.#stages(phase),
      ]),
      ...(["success", "failure", "canceled", "always"] as const).flatMap(
        (result): [string, string, string, string][] => {
          const steps = plan.post[result];
          if (!steps.length) return [];
          return [["finish", `post.${result}`, "", steps.map((step) => step.name).join(" · ")]];
        },
      ),
      ["finish", "(executor)", "", "cleanup"],
    ];
    const widths = [0, 1, 2].map((column) => Math.max(...rows.map((row) => row[column]?.length ?? 0)));
    const sources = [
      ...(plan.sources.workspace ? [plan.sources.workspace] : []),
      ...Object.values(plan.sources.apps),
    ].map((source) => `${source.file}${source.declared ? "" : " (default)"}`);
    return [
      `plan v${plan.schemaVersion} · branch ${context.branch} · env ${context.env} · trigger ${context.trigger} · apps ${context.apps.join(", ") || "(none)"}${order}`,
      `from ${sources.join(", ") || "(no files)"}`,
      "",
      ...rows.map((row) =>
        row
          .map((cell, column) => (column < 3 ? cell.padEnd(widths[column] ?? 0) : cell))
          .join("  ")
          .trimEnd(),
      ),
      ...(plan.requiredSecrets.length ? ["", `secrets required: ${plan.requiredSecrets.join(", ")}`] : []),
    ];
  }

  static #stages(phase: PipelinePlanPhase) {
    const labels = phase.stages.map((stage) => PipelineDryRun.#stage(phase, stage));
    if (phase.order === "sequential") return `→ ${labels.join(", ")} (one at a time)`;
    if (phase.stages.length === 1) {
      const [stage] = phase.stages;
      const command = stage?.steps
        .map((step) => (step.kind === "sh" ? step.name : `action ${step.action}`))
        .join(" · ");
      return [labels[0], command].filter((part) => part && part !== phase.name).join("  ");
    }
    return `‖ ${labels.join(" · ")}`;
  }

  static #stage(phase: PipelinePlanPhase, stage: PipelinePlanStage) {
    const label = stage.app && !phase.action && stage.name !== stage.app ? `${stage.app}:${stage.name}` : stage.name;
    const ota = stage.steps.find((step) => step.kind === "action" && step.action === "ota");
    const notes = [
      ota?.kind === "action" && ota.action === "ota"
        ? `${ota.with.targets.join(", ")} × ${ota.with.platforms.join(", ")}`
        : null,
      stage.skip ? `skipped: ${stage.skip.reason}` : null,
      stage.allowFailure ? "may fail" : null,
      stage.runtimeWhen ? `if changed: ${stage.runtimeWhen.changed.join(", ")}` : null,
    ].filter(Boolean);
    return notes.length ? `${label} (${notes.join("; ")})` : label;
  }

  static diagnostics(diagnostics: readonly PipelineDiagnostic[]) {
    return diagnostics.map((diagnostic) => {
      const where = [diagnostic.file, diagnostic.path].filter(Boolean).join(" · ");
      return `${diagnostic.severity} ${diagnostic.code}${where ? ` (${where})` : ""}: ${diagnostic.message}`;
    });
  }
}
