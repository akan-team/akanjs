import { type AppBinaryDistribution, CloudApi, GlobalConfig } from "@akanjs/devkit/cloud";
import { type App, script, type Workspace } from "@akanjs/devkit/commandDecorators";
import { PkgExecutor } from "@akanjs/devkit/executors";
import type { RemoteTestPlatform } from "@akanjs/devkit/platformTest/PlatformTestTarget";
import { Logger } from "akanjs/common";
import { ApplicationScript } from "../application/application.script";
import { PackageScript } from "../package/package.script";
import { CloudRunner, type EnvScope } from "./cloud.runner";

export class CloudScript extends script("cloud", [CloudRunner, ApplicationScript, PackageScript]) {
  async login(workspace: Workspace, host?: string | null) {
    await this.cloudRunner.login(await GlobalConfig.hostFor(workspace, host), workspace);
  }
  async logout(workspace: Workspace, host?: string | null) {
    await this.cloudRunner.logout(await GlobalConfig.hostFor(workspace, host));
  }
  async downloadEnv(
    workspace: Workspace,
    workspaceId = workspace.getWorkspaceId({ allowEmpty: true }),
    { host: given }: { host?: string | null } = {},
  ) {
    if (workspaceId) {
      const host = await GlobalConfig.hostFor(workspace, given);
      await this.login(workspace, host);
      const cloudApi = await CloudApi.fromHost(workspace, host);
      await this.cloudRunner.downloadEnv(cloudApi, workspace, workspaceId);
      return;
    }
    await this.cloudRunner.downloadEnvByScp(workspace);
  }
  async uploadEnv(
    workspace: Workspace,
    {
      host: given,
      workspaceId = workspace.getWorkspaceId({ allowEmpty: true }),
      scope,
      archivePath,
    }: { host?: string | null; workspaceId?: string; scope?: EnvScope; archivePath?: string } = {},
  ) {
    //* The scp target is one path per repo, so a slice archive would replace the workspace's values with a subset.
    if (scope && !workspaceId)
      throw new Error("A scoped env upload needs a cloud workspace id — the scp target is workspace-wide.");
    const { files, path } = await this.cloudRunner.gatherEnvFiles(workspace, { scope, archivePath });
    if (workspaceId) {
      const host = await GlobalConfig.hostFor(workspace, given);
      await this.login(workspace, host);
      const cloudApi = await CloudApi.fromHost(workspace, host);
      await this.cloudRunner.uploadEnv(cloudApi, workspaceId, path);
      return { workspaceId, files };
    }
    await this.cloudRunner.uploadEnvByScp(workspace, path);
    return { workspaceId: null, files };
  }

  async uploadSecret(
    workspace: Workspace,
    {
      name,
      branch,
      file,
      subspace,
      host: given,
    }: { name: string; branch: string | null; file: string | null; subspace: string | null; host?: string | null },
  ) {
    const devProjectId = await this.cloudRunner.secretProject(workspace, subspace);
    const value = await this.cloudRunner.readSecretValue(name, file);
    const host = await GlobalConfig.hostFor(workspace, given);
    await this.login(workspace, host);
    const cloudApi = await CloudApi.fromHost(workspace, host);
    await this.cloudRunner.uploadSecret(cloudApi, devProjectId, { name, branch, value });
  }
  async listSecrets(
    workspace: Workspace,
    { branch, subspace, host: given }: { branch: string | null; subspace: string | null; host?: string | null },
  ) {
    const devProjectId = await this.cloudRunner.secretProject(workspace, subspace);
    const host = await GlobalConfig.hostFor(workspace, given);
    await this.login(workspace, host);
    const cloudApi = await CloudApi.fromHost(workspace, host);
    await this.cloudRunner.listSecrets(cloudApi, devProjectId, branch);
  }
  async removeSecret(
    workspace: Workspace,
    {
      name,
      branch,
      subspace,
      host: given,
    }: { name: string; branch: string | null; subspace: string | null; host?: string | null },
  ) {
    const devProjectId = await this.cloudRunner.secretProject(workspace, subspace);
    const host = await GlobalConfig.hostFor(workspace, given);
    await this.login(workspace, host);
    const cloudApi = await CloudApi.fromHost(workspace, host);
    await this.cloudRunner.removeSecret(cloudApi, devProjectId, { name, branch });
  }

  async pushUpdate(
    workspace: Workspace,
    app: App,
    {
      platform,
      target,
      env,
      channel,
      notes,
      subspace,
      host: given,
      write,
      allowLocalRelease,
    }: {
      platform: "ios" | "android";
      target?: string;
      env: string;
      channel: string | null;
      notes: string | null;
      subspace: string | null;
      host?: string | null;
      write: boolean;
      allowLocalRelease: boolean;
    },
  ) {
    const devProjectId = await this.cloudRunner.secretProject(workspace, subspace);
    const pack = await this.applicationScript.packUpdate(app, platform, {
      target,
      env: env as "main",
      write,
      allowLocalRelease,
    });
    const host = await GlobalConfig.hostFor(workspace, given);
    await this.login(workspace, host);
    return await this.cloudRunner.pushUpdate(await CloudApi.fromHost(workspace, host), devProjectId, pack, {
      channel,
      notes,
    });
  }
  async registerBinary(
    workspace: Workspace,
    app: App,
    {
      platform,
      distribution,
      target,
      env,
      subspace,
      host: given,
      write,
      allowLocalRelease,
    }: {
      platform: "ios" | "android";
      distribution: AppBinaryDistribution;
      target?: string;
      env: string;
      subspace: string | null;
      host?: string | null;
      write: boolean;
      allowLocalRelease: boolean;
    },
  ) {
    const devProjectId = await this.cloudRunner.secretProject(workspace, subspace);
    const pack = await this.applicationScript.packUpdate(app, platform, {
      target,
      env: env as "main",
      write,
      allowLocalRelease,
    });
    const host = await GlobalConfig.hostFor(workspace, given);
    await this.login(workspace, host);
    return await this.cloudRunner.registerBinary(await CloudApi.fromHost(workspace, host), devProjectId, app, pack, {
      distribution,
      env,
    });
  }

  async deployAkan(
    workspace: Workspace,
    {
      test = true,
      registryUrl,
      platforms = [],
    }: { test?: boolean; registryUrl?: string; platforms?: RemoteTestPlatform[] } = {},
  ) {
    const akanPkgs = await this.cloudRunner.getAkanPkgs(workspace);
    await this.packageScript.updateWorskpaceRootPackageJson(workspace);
    const pkgs = akanPkgs.map((pkgName) => PkgExecutor.from(workspace, pkgName));
    if (test) {
      const platformRun = platforms.length
        ? await this.cloudRunner.startPlatformTests(workspace, platforms, akanPkgs)
        : null;
      let localFailure: unknown = null;
      try {
        for (const pkg of pkgs) await this.applicationScript.test(pkg);
      } catch (error) {
        localFailure = error;
      }
      //? Settled even after a local failure: the remote run owns a container and a VM directory to clean up.
      if (platformRun)
        await this.cloudRunner.settlePlatformTests(platformRun, {
          interactive: !localFailure,
          recordStreaks: !localFailure,
          checkDrift: true,
        });
      if (localFailure) throw localFailure;
    }
    for (const pkg of pkgs) await this.packageScript.buildPackage(pkg);
    await this.packageScript.verifyAkanPublishPackages(workspace);
    await this.cloudRunner.deployAkan(workspace, akanPkgs, { registryUrl });
  }
  async testPlatforms(workspace: Workspace, { platforms, pkgs }: { platforms: RemoteTestPlatform[]; pkgs?: string[] }) {
    if (!platforms.length) throw new Error("No platform to test on — pass --platforms linux,windows");
    const run = await this.cloudRunner.startPlatformTests(
      workspace,
      platforms,
      pkgs ?? (await this.cloudRunner.getAkanPkgs(workspace)),
    );
    await this.cloudRunner.settlePlatformTests(run, { interactive: false, recordStreaks: false, checkDrift: false });
  }
  async update(workspace: Workspace, tag: string = "latest", { registryUrl }: { registryUrl?: string } = {}) {
    const spinner = workspace.spinning("Updating Akan.js packages and CLI...");
    await this.cloudRunner.update(workspace, tag, { registryUrl });
    spinner.succeed("Akan.js packages and CLI updated, global version is below");
    Logger.raw("> Akan version: ");
    await workspace.spawn("akan", ["--version"], { stdio: "inherit" });
  }
}
