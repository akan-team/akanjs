import { command, Pkg, Workspace } from "@akanjs/devkit";

import { PackageScript } from "./package.script";

export class PackageCommand extends command("package", [PackageScript], ({ public: target }) => ({
  version: target({ desc: "Show version information for all packages" })
    .with(Workspace)
    .exec(async function (workspace) {
      await this.packageScript.version(workspace);
    }),
  createPackage: target({ desc: "Create a new package in pkgs/akanjs/" })
    .option("name", String, { desc: "name of package" })
    .with(Workspace)
    .exec(async function (name, workspace) {
      await this.packageScript.createPackage(workspace, name.toLowerCase().replace(/ /g, "-"));
    }),
  removePackage: target({ desc: "Remove a package from the workspace" })
    .with(Pkg)
    .exec(async function (pkg) {
      await this.packageScript.removePackage(pkg);
    }),
  syncPackage: target({ desc: "Sync dependencies and configuration for a package" })
    .with(Pkg)
    .exec(async function (pkg) {
      await this.packageScript.syncPackage(pkg);
    }),
  buildPackage: target({ desc: "Build a package for distribution" })
    .with(Pkg)
    .exec(async function (pkg) {
      await this.packageScript.buildPackage(pkg);
    }),
  verifyDistPackage: target({ desc: "Verify a built dist package with npm pack dry-run" })
    .with(Pkg)
    .exec(async function (pkg) {
      await this.packageScript.verifyDistPackage(pkg);
    }),
  verifyAkanPublishPackages: target({ devOnly: true, desc: "Verify all Akan publish dist packages" })
    .with(Workspace)
    .exec(async function (workspace) {
      await this.packageScript.verifyAkanPublishPackages(workspace);
    }),
})) {}
