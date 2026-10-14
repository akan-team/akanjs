import { script, type Workspace } from "@akanjs/devkit/commandDecorators";
import { PipelineDryRun } from "@akanjs/devkit/pipeline";
import { Logger, type PipelinePlanResult, toError } from "akanjs/common";
import { type PipelineFlags, PipelineRunner } from "./pipeline.runner";

export type PipelineAction = "plan" | "validate" | "dry-run";

//* Exit codes are the executor's contract: 0 a plan, 1 a definition with errors (its envelope written), 2 anything else.
export class PipelineScript extends script("pipeline", [PipelineRunner]) {
  async run(
    workspace: Workspace,
    action: PipelineAction,
    { flags, out, format }: { flags: PipelineFlags; out: string | null; format: "text" | "json" },
  ) {
    const json = format === "json" || (action === "plan" && !out);
    const restoreLogs = json ? PipelineScript.#logToStderr() : null;
    try {
      await this.#run(workspace, action, { flags, out, json });
    } finally {
      restoreLogs?.();
    }
  }

  async #run(
    workspace: Workspace,
    action: PipelineAction,
    { flags, out, json }: { flags: PipelineFlags; out: string | null; json: boolean },
  ) {
    let result: PipelinePlanResult;
    try {
      const context = await this.pipelineRunner.context(workspace, flags);
      result = await this.pipelineRunner.plan(workspace, context, { sampled: action === "validate" });
      if (out) await this.pipelineRunner.writeResult(out, result);
    } catch (error) {
      Logger.rawLog(`akan pipeline ${action}: ${toError(error).message}`, undefined, "error");
      process.exitCode = 2;
      return;
    }
    if (json) process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    else
      Logger.rawLog(
        action === "dry-run" ? PipelineDryRun.render(result) : PipelineScript.#summary(action, result, out),
      );
    if (!result.ok) process.exitCode = 1;
  }

  static #logToStderr() {
    const consoleOutput = Logger.consoleOutput;
    Logger.consoleOutput = false;
    const removeSink = Logger.addSink((entry) => void process.stderr.write(entry.message), { minLevel: Logger.level });
    return () => {
      removeSink();
      Logger.consoleOutput = consoleOutput;
    };
  }

  static #summary(action: PipelineAction, result: PipelinePlanResult, out: string | null) {
    const head = result.ok
      ? `${action === "plan" ? "planned" : "valid"}: ${result.plan.phases.length} phases, ${result.plan.phases.reduce((sum, phase) => sum + phase.stages.length, 0)} stages`
      : `${action === "plan" ? "no plan" : "invalid"}: ${result.diagnostics.filter((diagnostic) => diagnostic.severity === "error").length} error(s)`;
    return [`${head}${out ? ` → ${out}` : ""}`, ...PipelineDryRun.diagnostics(result.diagnostics)].join("\n");
  }
}
