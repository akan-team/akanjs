import { type Lib, runner, type Workspace } from "@akanjs/devkit/commandDecorators";
import { LibExecutor } from "@akanjs/devkit/executors";
import { compareSemver } from "../semver";

export class LibraryRunner extends runner("library") {
  async createLibrary(libName: string, workspace: Workspace) {
    await workspace.exec(`mkdir -p libs/${libName}`);
    await workspace.applyTemplate({ basePath: `libs/${libName}`, template: "libRoot", dict: { libName } });
    const lib = LibExecutor.from(workspace, libName);
    return lib;
  }
  async removeLibrary(lib: Lib) {
    await lib.workspace.exec(`rm -rf libs/${lib.name}`);
  }

  async #copyInstalledLibrary(workspace: Workspace, libName: string) {
    const installedPackageJson = `node_modules/akanjs/libs/${libName}/package.json`;
    if (!(await workspace.exists(installedPackageJson))) return false;
    await workspace.cp(`node_modules/akanjs/libs/${libName}`, `libs/${libName}`);
    return true;
  }

  async #copyLibraryFromRepository(workspace: Workspace, libName: string) {
    await workspace.mkdir("node_modules/.akan");
    if (await workspace.exists("node_modules/.akan/akanjs")) await workspace.removeDir("node_modules/.akan/akanjs");
    await workspace.exec(`cd node_modules/.akan && git clone https://github.com/akan-team/akanjs.git`);
    await workspace.cp(`node_modules/.akan/akanjs/libs/${libName}`, `libs/${libName}`);
  }

  async installLibrary(workspace: Workspace, libName: string) {
    const copiedFromInstalledPackage = await this.#copyInstalledLibrary(workspace, libName);
    if (!copiedFromInstalledPackage) await this.#copyLibraryFromRepository(workspace, libName);
    await workspace.cp(`libs/${libName}/env/env.server.example.ts`, `libs/${libName}/env/env.server.testing.ts`);
    await workspace.commit(`Add ${libName} library`);
    return LibExecutor.from(workspace, libName);
  }
  async mergeLibraryDependencies(lib: Lib) {
    const libPackageJson = await lib.getPackageJson();
    const rootPackageJson = await lib.workspace.getPackageJson();
    const dependencies: Record<string, string> = {};
    const devDependencies: Record<string, string> = {};
    const libDependencies = { ...libPackageJson.dependencies, ...libPackageJson.devDependencies };
    const rootDependencies = { ...rootPackageJson.dependencies, ...rootPackageJson.devDependencies };
    const allDependencies = Object.fromEntries(
      Object.keys({ ...libDependencies, ...rootDependencies }).map((dep) => {
        const libVersion = libDependencies[dep] ?? "0.0.0";
        const rootVersion = rootDependencies[dep] ?? "0.0.0";
        const newerVersion = compareSemver(rootVersion, libVersion) > 0 ? rootVersion : libVersion;
        return [dep, newerVersion];
      }),
    );
    Object.keys(allDependencies)
      .sort()
      .forEach((dep) => {
        if (!!libPackageJson.dependencies?.[dep] || !!rootPackageJson.dependencies?.[dep])
          dependencies[dep] = allDependencies[dep];
        else devDependencies[dep] = allDependencies[dep];
      });
    const newRootPackageJson = { ...rootPackageJson, dependencies, devDependencies };
    await lib.workspace.setPackageJson(newRootPackageJson);
    await lib.workspace.spawn("bun", ["install"]);
    await lib.workspace.commit(`Merge ${lib.name} library dependencies`);
  }

  async testLibrary(lib: Lib) {
    // await lib.workspace.spawn(
    //   "node",
    //   ["node_modules/jest/bin/jest.js", `libs/${lib.name}`, "-c", `libs/${lib.name}/jest.config.ts`],
    //   {
    //     env: {
    //       ...this.#getEnv(lib),
    //       AKAN_PUBLIC_ENV: "testing",
    //       AKAN_PUBLIC_OPERATION_MODE: "local",
    //       AKAN_PUBLIC_APP_NAME: lib.name,
    //       NODE_TLS_REJECT_UNAUTHORIZED: "0",
    //     },
    //   }
    // );
  }
}
