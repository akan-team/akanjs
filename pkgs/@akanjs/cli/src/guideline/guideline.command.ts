import { Argument, Commands, Option, Target, Workspace } from "@akanjs/devkit";

import { GuidelineScript } from "./guideline.script";

@Commands()
export class GuidelineCommand {
  guidelineScript = new GuidelineScript();

  @Target.Public()
  async generateInstruction(
    @Argument("name", { ask: "name of the instruction", nullable: true }) name: string | null,
    @Workspace() workspace: Workspace
  ) {
    await this.guidelineScript.generateInstruction(workspace, name);
  }
  @Target.Public()
  async updateInstruction(
    @Argument("name", { ask: "name of the instruction", nullable: true }) name: string | null,
    @Option("request", { ask: "What do you want to update?" }) request: string,
    @Workspace() workspace: Workspace
  ) {
    await this.guidelineScript.updateInstruction(workspace, name, request);
  }
  @Target.Public()
  async generateDocument(
    @Argument("name", { ask: "name of the instruction", nullable: true }) name: string | null,
    @Workspace() workspace: Workspace
  ) {
    await this.guidelineScript.generateDocument(workspace, name);
  }
  @Target.Public()
  async reapplyInstruction(
    @Argument("name", { ask: "name of the instruction", nullable: true }) name: string | null,
    @Workspace() workspace: Workspace
  ) {
    await this.guidelineScript.reapplyInstruction(workspace, name);
  }
}
