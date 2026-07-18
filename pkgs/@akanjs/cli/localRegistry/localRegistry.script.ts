import { PkgExecutor, script, type Workspace } from "@akanjs/devkit";
import { ApplicationScript } from "../application/application.script";
import { CloudRunner } from "../cloud/cloud.runner";
import { PackageScript } from "../package/package.script";
import { LocalRegistryRunner } from "./localRegistry.runner";

export class LocalRegistryScript extends script("localRegistry", [
  LocalRegistryRunner,
  CloudRunner,
  ApplicationScript,
  PackageScript,
]) {
  async start(workspace: Workspace, { registryUrl }: { registryUrl?: string } = {}) {
    const spinner = workspace.spinning("Starting local npm registry...");
    const registry = await this.localRegistryRunner.start(workspace, { registryUrl });
    spinner.succeed(`Local npm registry is ready at ${registry}`);
  }

  async reset(workspace: Workspace) {
    const spinner = workspace.spinning("Resetting local npm registry...");
    await this.localRegistryRunner.reset(workspace);
    spinner.succeed("Local npm registry reset");
  }

  async smoke(
    workspace: Workspace,
    { tag = "rc", test = true, registryUrl }: { tag?: string; test?: boolean; registryUrl?: string } = {},
  ) {
    const registry = await this.localRegistryRunner.start(workspace, { registryUrl });
    const akanPkgs = await this.cloudRunner.getAkanPkgs(workspace);
    await this.#preparePackages(workspace, akanPkgs, { test });
    await this.cloudRunner.deployAkan(workspace, akanPkgs, {
      registryUrl: registry,
      confirmPublish: false,
      tag,
    });
    await this.localRegistryRunner.smoke(workspace, { registryUrl: registry });
  }

  async #preparePackages(workspace: Workspace, akanPkgs: string[], { test = true }: { test?: boolean } = {}) {
    await this.packageScript.updateWorskpaceRootPackageJson(workspace);
    const pkgs = akanPkgs.map((pkgName) => PkgExecutor.from(workspace, pkgName));
    if (test) for (const pkg of pkgs) await this.applicationScript.test(pkg);
    for (const pkg of pkgs) await this.packageScript.buildPackage(pkg, { showSpinner: false });
    await this.packageScript.verifyAkanPublishPackages(workspace);
  }
}
