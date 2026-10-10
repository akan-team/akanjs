import { mkdir, open, rename } from "node:fs/promises";
import path from "node:path";
import { runner, type Workspace } from "@akanjs/devkit/commandDecorators";
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
  /** A flag given is echoed as is; only a missing one is filled, from git and the workspace. */
  async context(workspace: Workspace, flags: PipelineFlags): Promise<PipelinePlanContext> {
    if (!Number.isInteger(flags.buildNum) || flags.buildNum < 0)
      throw new Error(`--build-num ${flags.buildNum} is not a whole number of 0 or more`);
    const branch =
      flags.branch ?? (await PipelineRunner.#git(workspace, ["rev-parse", "--abbrev-ref", "HEAD"])) ?? "main";
    return {
      branch,
      env: flags.env ?? branch,
      apps:
        flags.apps === null ? (await workspace.getApps()).sort((a, b) => a.localeCompare(b)) : flags.apps.split(","),
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
    const target = path.resolve(out);
    await mkdir(path.dirname(target), { recursive: true });
    const temp = `${target}.${process.pid}.${crypto.randomUUID()}.tmp`;
    const handle = await open(temp, "wx");
    try {
      await handle.writeFile(`${JSON.stringify(result, null, 2)}\n`);
    } finally {
      await handle.close();
    }
    await rename(temp, target);
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
