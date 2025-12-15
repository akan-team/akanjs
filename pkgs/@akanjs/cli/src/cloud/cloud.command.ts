import { Commands, Option, Target, Workspace } from "@akanjs/devkit";

import { CloudScript } from "./cloud.script";

@Commands()
export class CloudCommand {
  cloudScript = new CloudScript();

  @Target.Public()
  async login(@Workspace() workspace: Workspace) {
    await this.cloudScript.login(workspace);
  }

  @Target.Public()
  logout(@Workspace() workspace: Workspace) {
    this.cloudScript.logout(workspace);
  }

  @Target.Public()
  async setLlm(@Workspace() workspace: Workspace) {
    await this.cloudScript.setLlm(workspace);
  }

  @Target.Public()
  resetLlm(@Workspace() workspace: Workspace) {
    this.cloudScript.resetLlm(workspace);
  }

  @Target.Public()
  async ask(@Option("question", { ask: "question to ask" }) question: string, @Workspace() workspace: Workspace) {
    await this.cloudScript.ask(question, workspace);
  }

  @Target.Public({ devOnly: true })
  async deployAkan(@Workspace() workspace: Workspace) {
    await this.cloudScript.deployAkan(workspace);
  }

  @Target.Public()
  async update(
    @Workspace() workspace: Workspace,
    @Option("tag", {
      desc: "tag of the update",
      default: "latest",
      enum: ["latest", "dev", "canary", "beta", "rc", "alpha"],
    })
    tag: string
  ) {
    await this.cloudScript.update(workspace, tag);
  }
}
