import { Lib, LibExecutor, Workspace } from "@akanjs/devkit";
import { compareVersions } from "compare-versions";
import dotenv from "dotenv";

export class LibraryRunner {
  async createLibrary(libName: string, workspace: Workspace) {
    await workspace.exec(`mkdir -p libs/${libName}`);
    await workspace.applyTemplate({ basePath: `libs/${libName}`, template: "libRoot", dict: { libName } });
    workspace.setTsPaths("lib", libName);
    const lib = LibExecutor.from(workspace, libName);
    return lib;
  }
  async removeLibrary(lib: Lib) {
    await lib.workspace.exec(`rm -rf libs/${lib.name}`);
    lib.workspace.unsetTsPaths("lib", lib.name);
  }

  async installLibrary(workspace: Workspace, libName: string) {
    workspace.mkdir("node_modules/.akan");
    if (workspace.exists("node_modules/.akan/akanjs")) await workspace.removeDir("node_modules/.akan/akanjs");
    await workspace.exec(`cd node_modules/.akan && git clone git@github.com:akan-team/akanjs.git`);
    await workspace.cp(`node_modules/.akan/akanjs/libs/${libName}`, `libs/${libName}`);
    await workspace.cp(`libs/${libName}/env/env.server.example.ts`, `libs/${libName}/env/env.server.testing.ts`);
    workspace.setTsPaths("lib", libName);
    await workspace.commit(`Add ${libName} library`);
    return LibExecutor.from(workspace, libName);
  }
  async mergeLibraryDependencies(lib: Lib) {
    const libPackageJson = lib.getPackageJson();
    const rootPackageJson = lib.workspace.getPackageJson();
    const dependencies: Record<string, string> = {};
    const devDependencies: Record<string, string> = {};
    const libDependencies = { ...libPackageJson.dependencies, ...libPackageJson.devDependencies };
    const rootDependencies = { ...rootPackageJson.dependencies, ...rootPackageJson.devDependencies };
    const allDependencies = Object.fromEntries(
      Object.keys({ ...libDependencies, ...rootDependencies }).map((dep) => {
        const libVersion = libDependencies[dep] ?? "0.0.0";
        const rootVersion = rootDependencies[dep] ?? "0.0.0";
        const newerVersion = compareVersions(rootVersion, libVersion) > 0 ? rootVersion : libVersion;
        return [dep, newerVersion];
      })
    );
    Object.keys(allDependencies)
      .sort()
      .forEach((dep) => {
        if (!!libPackageJson.dependencies?.[dep] || !!rootPackageJson.dependencies?.[dep])
          dependencies[dep] = allDependencies[dep];
        else devDependencies[dep] = allDependencies[dep];
      });
    const newRootPackageJson = { ...rootPackageJson, dependencies, devDependencies };
    lib.workspace.setPackageJson(newRootPackageJson);
    await lib.workspace.spawn("pnpm", ["install", "--reporter=silent"]);
    await lib.workspace.commit(`Merge ${lib.name} library dependencies`);
  }

  #getEnv(lib: Lib, env: Record<string, string> = {}) {
    const rootEnv = dotenv.parse(lib.workspace.readFile(".env"));
    return {
      ...process.env,
      ...rootEnv,
      NEXT_PUBLIC_APP_NAME: lib.name,
      AKAN_WORKSPACE_ROOT: lib.workspace.workspaceRoot,
      ...env,
    };
  }
  async testLibrary(lib: Lib) {
    await lib.workspace.spawn(
      "node",
      ["node_modules/jest/bin/jest.js", `libs/${lib.name}`, "-c", `libs/${lib.name}/jest.config.ts`],
      {
        env: {
          ...this.#getEnv(lib),
          NEXT_PUBLIC_ENV: "testing",
          NEXT_PUBLIC_OPERATION_MODE: "local",
          NEXT_PUBLIC_APP_NAME: lib.name,
          NODE_TLS_REJECT_UNAUTHORIZED: "0",
        },
      }
    );
  }
}
