import path from "node:path";
import { ExitCodeError, markCliErrorPrinted, script, type Workspace } from "@akanjs/devkit/commandDecorators";
import { Logger } from "akanjs/common";
import { ApplicationRunner } from "../application/application.runner";
import { WorkspaceRunner } from "../workspace/workspace.runner";
import { VerifyPipeline } from "./verifyPipeline";
import { VerifyReport } from "./verifyReport";
import { VerifyScope } from "./verifyScope";

export interface VerifyOptions {
  files?: string[];
  lintOnly?: boolean;
  build?: boolean;
  max?: number;
  format?: "text" | "json";
}

export class VerifyScript extends script("verify", [WorkspaceRunner, ApplicationRunner]) {
  async verify(workspace: Workspace, requested: string[], options: VerifyOptions = {}) {
    const [apps, libs, pkgs] = await workspace.getExecs();
    const names = { apps, libs, pkgs };
    const changes = options.files?.length
      ? options.files.map((file) => ({ code: " M", file: VerifyScript.#relative(workspace, file) }))
      : ((await VerifyScope.changesIn(workspace.workspaceRoot)) ?? []);
    const scope = VerifyScope.resolve(changes, names, requested);
    //? Every step logs through Logger (sync alone writes ~90 VERBOSE lines); the report is the only output.
    const consoleOutput = Logger.consoleOutput;
    Logger.consoleOutput = false;
    const result = await new VerifyPipeline(workspace, this.workspaceRunner, this.applicationRunner)
      .run(scope, { lintOnly: options.lintOnly, build: options.build })
      .finally(() => {
        Logger.consoleOutput = consoleOutput;
      });
    Logger.rawLog(
      options.format === "json" ? VerifyReport.json(result) : VerifyReport.text(result, { max: options.max }),
    );
    if (result.ok) return;
    const failure = new ExitCodeError("verify failed", 1);
    markCliErrorPrinted(failure);
    throw failure;
  }

  static #relative(workspace: Workspace, file: string) {
    const absolute = path.isAbsolute(file) ? file : path.resolve(workspace.workspaceRoot, file);
    return path.relative(workspace.workspaceRoot, absolute).split(path.sep).join("/");
  }
}
