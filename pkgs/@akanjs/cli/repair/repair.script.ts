import { script, type Workspace } from "@akanjs/devkit/commandDecorators";
import type { WorkflowFormat } from "@akanjs/devkit/workflow";
import { Logger } from "akanjs/common";
import { type RepairKind, RepairRunner } from "./repair.runner";

export class RepairScript extends script("repair", [RepairRunner]) {
  async repair(
    kind: string,
    {
      workspace,
      app = null,
      module = null,
      target = null,
      format = "markdown",
    }: {
      workspace: Workspace;
      app?: string | null;
      module?: string | null;
      target?: string | null;
      format?: WorkflowFormat;
    },
  ) {
    Logger.rawLog(
      await this.repairRunner.repair(kind as RepairKind, {
        workspace,
        app,
        module,
        target,
        format,
      }),
    );
  }
}
