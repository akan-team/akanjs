import { Logger } from "@akanjs/common";
import { Builder, type PackageJson, type Pkg, type Workspace } from "@akanjs/devkit";
import fsPromise from "fs/promises";

export class PackageRunner {
  async version(workspace: Workspace) {
    const pkgJson = JSON.parse(await fsPromise.readFile("package.json", "utf-8")) as PackageJson;
    const version = pkgJson.version;
    Logger.rawLog(`${pkgJson.name}@${version}`);
  }
  async createPackage(workspace: Workspace, pkgName: string) {
    await workspace.applyTemplate({ basePath: `pkgs/${pkgName}`, template: "pkgRoot", dict: { pkgName } });
    workspace.setTsPaths("pkg", pkgName);
  }
  async removePackage(pkg: Pkg) {
    await pkg.workspace.exec(`rm -rf pkgs/${pkg.name}`);
    pkg.workspace.unsetTsPaths("pkg", pkg.name);
  }
  async scanSync(pkg: Pkg) {
    const scanResult = await pkg.scan();
    return scanResult;
  }
  async buildPackage(pkg: Pkg) {
    const rootPackageJson = pkg.workspace.getPackageJson();
    const pkgJson = pkg.getPackageJson();
    const builder = new Builder({ executor: pkg, distExecutor: pkg.dist, pkgJson, rootPackageJson });
    if (pkg.name === "@akanjs/cli")
      await builder.build({
        bundle: true,
        additionalEntryPoints: [`${pkg.cwdPath}/src/templates/**/*`, `${pkg.cwdPath}/src/guidelines/**/*`],
      });
    else await builder.build();
  }
}
