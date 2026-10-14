import path from "node:path";
import { runner, type Workspace } from "@akanjs/devkit/commandDecorators";
import { FileSys } from "@akanjs/devkit/fileSys";
import { PipelineDefinition } from "@akanjs/devkit/pipeline";
import type { PipelinePlanContext, PipelinePlanResult, PipelineTrigger } from "akanjs/common";

export interface PipelineFlags {
  branch: string | null;
  env: string | null;
  apps: string | null;
  trigger: string;
  buildNum: number;
  commit: string | null;
}

export class PipelineRunner extends runner("pipeline") {
  //? PipelinePlanSchema refuses a longer context string, which would surface as a plan error instead of a bad flag.
  static readonly #flagChars = 1024;

  async context(workspace: Workspace, flags: PipelineFlags): Promise<PipelinePlanContext> {
    if (!Number.isSafeInteger(flags.buildNum) || flags.buildNum < 0)
      throw new Error(`--build-num ${flags.buildNum} is not a whole number of 0 or more`);
    for (const flag of ["branch", "env", "commit"] as const) PipelineRunner.#assertFlag(flag, flags[flag]);
    const branch = flags.branch ?? (await PipelineRunner.#git(workspace, ["rev-parse", "--abbrev-ref", "HEAD"]));
    //* Never a default: a feature build planned as `main` would pass every `when: { branch: "main" }` deploy stage.
    if (!branch) throw new Error("git names no branch here (a detached HEAD, or no checkout): name it with --branch");
    return {
      branch,
      env: flags.env ?? branch,
      apps:
        flags.apps === null
          ? (await workspace.getApps()).sort()
          : flags.apps
              .split(",")
              .map((app) => app.trim())
              .filter(Boolean),
      trigger: flags.trigger as PipelineTrigger,
      buildNum: flags.buildNum,
      commit: flags.commit ?? (await PipelineRunner.#git(workspace, ["rev-parse", "HEAD"])),
    };
  }

  async plan(workspace: Workspace, context: PipelinePlanContext, { sampled = false }: { sampled?: boolean } = {}) {
    return (await PipelineDefinition.load(workspace, context.apps)).compile(context, { sampled });
  }

  //* Written whole or not at all, and a link already at `out` is replaced rather than followed: a checkout may hold one.
  async writeResult(out: string, result: PipelinePlanResult) {
    await FileSys.writeTextAtomic(path.resolve(out), `${JSON.stringify(result, null, 2)}\n`);
  }

  static #assertFlag(flag: "branch" | "env" | "commit", value: string | null) {
    if (value === null) return;
    if (!value.trim()) throw new Error(`--${flag} is blank`);
    if (value.length > PipelineRunner.#flagChars)
      throw new Error(`--${flag} is longer than ${PipelineRunner.#flagChars} characters`);
  }

  static async #git(workspace: Workspace, args: string[]) {
    try {
      const output = (await workspace.spawn("git", args)).trim();
      return output && output !== "HEAD" ? output : null;
    } catch {
      return null;
    }
  }
}
