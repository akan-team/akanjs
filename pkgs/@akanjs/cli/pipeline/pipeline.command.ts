import { command, Workspace } from "@akanjs/devkit/commandDecorators";
import { pipelineTriggers } from "akanjs/common";
import { type PipelineAction, PipelineScript } from "./pipeline.script";

export class PipelineCommand extends command("pipeline", [PipelineScript], ({ public: target }) => ({
  pipeline: target({
    desc: "Plan the build pipeline declared in akan.config.ts (the workspace root's and each app's) without running it",
    failureExitCode: 2,
  })
    .arg("action", String, {
      desc: "plan: the JSON plan an executor runs · validate: check the definitions · dry-run: show the plan",
      default: "dry-run",
      enum: ["plan", "validate", "dry-run"],
    })
    .option("branch", String, { desc: "the branch the run builds (default: the current git branch)", nullable: true })
    .option("env", String, { desc: "the AKAN_PUBLIC_ENV the run is for (default: the branch)", nullable: true })
    .option("apps", String, { desc: "the apps the run builds, comma-separated (default: every app)", nullable: true })
    .option("trigger", String, { desc: "what started the run", default: "manual", enum: [...pipelineTriggers] })
    .option("buildNum", Number, { flag: "n", desc: "the run's build number", default: 0 })
    .option("commit", String, { desc: "the commit the run builds (default: HEAD)", nullable: true })
    .option("out", String, {
      desc: "also write the result envelope, { ok, plan, diagnostics }, to this file",
      nullable: true,
    })
    .option("format", String, { desc: "output format", default: "text", enum: ["text", "json"] })
    .with(Workspace)
    .exec(async function (action, branch, env, apps, trigger, buildNum, commit, out, format, workspace) {
      await this.pipelineScript.run(workspace, action as PipelineAction, {
        flags: { branch, env, apps, trigger, buildNum, commit },
        out,
        format: format as "text" | "json",
      });
    }),
})) {}
