import { Commands, Option, Pkg, Target, Workspace } from "@akanjs/devkit";

import { PackageScript } from "./package.script";

@Commands()
export class PackageCommand {
  packageScript = new PackageScript();

  @Target.Public()
  async version(@Workspace() workspace: Workspace) {
    await this.packageScript.version(workspace);
  }

  @Target.Public()
  async createPackage(@Option("name", { desc: "name of package" }) name: string, @Workspace() workspace: Workspace) {
    await this.packageScript.createPackage(workspace, name.toLowerCase().replace(/ /g, "-"));
  }

  @Target.Public()
  async removePackage(@Pkg() pkg: Pkg) {
    await this.packageScript.removePackage(pkg);
  }

  @Target.Public()
  async syncPackage(@Pkg() pkg: Pkg) {
    await this.packageScript.syncPackage(pkg);
  }

  @Target.Public()
  async buildPackage(@Pkg() pkg: Pkg) {
    await this.packageScript.buildPackage(pkg);
  }
}
