import { type Pkg, type Workspace } from "@akanjs/devkit";

import { PackageRunner } from "./package.runner";

export class PackageScript {
  #runner = new PackageRunner();
  async version(workspace: Workspace) {
    await this.#runner.version(workspace);
  }
  async createPackage(workspace: Workspace, pkgName: string) {
    const spinner = workspace.spinning(`Creating package in pkgs/${pkgName}...`);
    await this.#runner.createPackage(workspace, pkgName);
    spinner.succeed(`Package in pkgs/${pkgName} is created`);
  }
  async removePackage(pkg: Pkg) {
    const spinner = pkg.spinning(`Removing package in pkgs/${pkg.name}...`);
    await this.#runner.removePackage(pkg);
    spinner.succeed("Package removed");
  }
  async syncPackage(pkg: Pkg) {
    const spinner = pkg.spinning("Scanning package...");
    const scanResult = await this.#runner.scanSync(pkg);
    spinner.succeed("Package scanned");
    return scanResult;
  }

  async buildPackage(pkg: Pkg) {
    const spinner = pkg.spinning("Building package...");
    await this.#runner.buildPackage(pkg);
    spinner.succeed("Package built");
  }
}
