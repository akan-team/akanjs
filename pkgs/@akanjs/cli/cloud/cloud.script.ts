import { AiSession, CloudApi, GlobalConfig, PkgExecutor, script, type Workspace } from "@akanjs/devkit";
import { Logger } from "akanjs/common";
import { ApplicationScript } from "../application/application.script";
import { PackageScript } from "../package/package.script";
import { CloudRunner } from "./cloud.runner";

export class CloudScript extends script("cloud", [CloudRunner, ApplicationScript, PackageScript]) {
  async login(workspace: Workspace, host = GlobalConfig.akanCloudHost) {
    await this.cloudRunner.login(host, workspace);
  }
  async logout(workspace: Workspace, host = GlobalConfig.akanCloudHost) {
    await this.cloudRunner.logout(host);
  }
  async setLlm(workspace: Workspace) {
    await this.cloudRunner.setLlm();
  }
  resetLlm(workspace: Workspace) {
    this.cloudRunner.resetLlm();
  }
  async ask(question: string, workspace: Workspace) {
    const session = new AiSession("general", { workspace, isContinued: true });
    await session.ask(question);
  }
  async downloadEnv(
    workspace: Workspace,
    workspaceId = workspace.getWorkspaceId({ allowEmpty: true }),
    { host = GlobalConfig.akanCloudHost }: { host?: string } = {},
  ) {
    if (workspaceId) {
      await this.login(workspace, host);
      const cloudApi = await CloudApi.fromHost(workspace, host);
      await this.cloudRunner.downloadEnv(cloudApi, workspace, workspaceId);
      return;
    }
    await this.cloudRunner.downloadEnvByScp(workspace);
  }
  async uploadEnv(workspace: Workspace, { host = GlobalConfig.akanCloudHost }: { host?: string } = {}) {
    const workspaceId = workspace.getWorkspaceId({ allowEmpty: true });
    const { path } = await this.cloudRunner.gatherEnvFiles(workspace);
    if (workspaceId) {
      await this.login(workspace, host);
      const cloudApi = await CloudApi.fromHost(workspace, host);
      await this.cloudRunner.uploadEnv(cloudApi, workspaceId, path);
      return;
    }
    await this.cloudRunner.uploadEnvByScp(workspace, path);
  }

  async deployAkan(workspace: Workspace, { test = true, registryUrl }: { test?: boolean; registryUrl?: string } = {}) {
    const akanPkgs = await this.cloudRunner.getAkanPkgs(workspace);
    await this.packageScript.updateWorskpaceRootPackageJson(workspace);
    const pkgs = akanPkgs.map((pkgName) => PkgExecutor.from(workspace, pkgName));
    if (test) for (const pkg of pkgs) await this.applicationScript.test(pkg);
    for (const pkg of pkgs) await this.packageScript.buildPackage(pkg);
    await this.packageScript.verifyAkanPublishPackages(workspace);
    await this.cloudRunner.deployAkan(workspace, akanPkgs, { registryUrl });
  }
  async update(workspace: Workspace, tag: string = "latest", { registryUrl }: { registryUrl?: string } = {}) {
    const spinner = workspace.spinning("Updating Akan.js packages and CLI...");
    await this.cloudRunner.update(workspace, tag, { registryUrl });
    spinner.succeed("Akan.js packages and CLI updated, global version is below");
    Logger.raw("> Akan version: ");
    await workspace.spawn("akan", ["--version"], { stdio: "inherit" });
  }
}
