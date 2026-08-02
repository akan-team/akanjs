import { type Pkg, script, type Workspace } from "@akanjs/devkit/commandDecorators";
import { PackageRunner } from "./package.runner";

export class PackageScript extends script("package", [PackageRunner]) {
  async version(workspace: Workspace | null, { log = true }: { log?: boolean } = {}) {
    return await this.packageRunner.version(workspace, { log });
  }
  async createPackage(workspace: Workspace, pkgName: string) {
    const spinner = workspace.spinning(`Creating package in pkgs/${pkgName}...`);
    await this.packageRunner.createPackage(workspace, pkgName);
    spinner.succeed(`Package in pkgs/${pkgName} is created`);
  }
  async removePackage(pkg: Pkg) {
    const spinner = pkg.spinning(`Removing package in pkgs/${pkg.name}...`);
    await this.packageRunner.removePackage(pkg);
    spinner.succeed("Package removed");
  }
  async syncPackage(pkg: Pkg) {
    const spinner = pkg.spinning("Scanning package...");
    const scanResult = await this.packageRunner.scanSync(pkg);
    spinner.succeed("Package scanned");
    return scanResult;
  }

  async buildPackage(pkg: Pkg, { showSpinner = true }: { showSpinner?: boolean } = {}) {
    const spinner = showSpinner ? pkg.spinning("Building package...") : undefined;
    await this.packageRunner.buildPackage(pkg);
    if (spinner) spinner.succeed("Package built");
  }
  async verifyDistPackage(pkg: Pkg) {
    const spinner = pkg.spinning("Verifying dist package...");
    const result = await this.packageRunner.verifyDistPackage(pkg);
    spinner.succeed(`Package verified (${result.files} files, ${result.size} bytes packed)`);
    return result;
  }
  async verifyAkanPublishPackages(workspace: Workspace) {
    const spinner = workspace.spinning("Verifying Akan publish packages...");
    const results = await this.packageRunner.verifyAkanPublishPackages(workspace);
    spinner.succeed(`Akan publish packages verified (${results.length} packages)`);
    return results;
  }
  async updateWorskpaceRootPackageJson(workspace: Workspace) {
    const rootPackageJson = await workspace.getPackageJson();
    await this.packageRunner.updateWorskpaceRootPackageJson(workspace, rootPackageJson);
  }
}
