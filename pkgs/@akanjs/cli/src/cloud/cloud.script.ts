import { Logger } from "@akanjs/common";
import { AiSession, PkgExecutor, type Workspace } from "@akanjs/devkit";

import { PackageScript } from "../package/package.script";
import { CloudRunner } from "./cloud.runner";

export class CloudScript {
  #runner = new CloudRunner();
  #packageScript = new PackageScript();

  async login(workspace: Workspace) {
    await this.#runner.login();
  }
  logout(workspace: Workspace) {
    this.#runner.logout();
  }
  async setLlm(workspace: Workspace) {
    await this.#runner.setLlm();
  }
  resetLlm(workspace: Workspace) {
    this.#runner.resetLlm();
  }
  async ask(question: string, workspace: Workspace) {
    const session = new AiSession("general", { workspace, isContinued: true });
    await session.ask(question);
  }
  async deployAkan(workspace: Workspace) {
    const akanPkgs = await this.#runner.getAkanPkgs(workspace);
    await Promise.all(
      akanPkgs.map((pkgName) => this.#packageScript.buildPackage(PkgExecutor.from(workspace, pkgName)))
    );
    await this.#runner.deployAkan(workspace, akanPkgs);
  }
  async update(workspace: Workspace, tag: string = "latest") {
    const spinner = workspace.spinning("Updating Akan.js packages and CLI...");
    await this.#runner.update(workspace, tag);
    spinner.succeed("Akan.js packages and CLI updated, global version is below");
    Logger.raw("> Akan version: ");
    await workspace.spawn("akan", ["--version"], { stdio: "inherit" });
  }
}
