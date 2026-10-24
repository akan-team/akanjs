import { type Lib, runner, type Workspace } from "@akanjs/devkit/commandDecorators";
import { CommandExecutionError, LibExecutor } from "@akanjs/devkit/executors";
import { LibSource } from "@akanjs/devkit/libSource";
import { compareSemver } from "@akanjs/devkit/semver";

export class LibraryRunner extends runner("library") {
  static readonly libraryRepository = "https://github.com/akan-team/akanjs.git";
  static readonly #cloneDir = "node_modules/.akan/akanjs";
  readonly #clones = new Map<string, { origin: string; sha: string }>();
  async createLibrary(libName: string, workspace: Workspace) {
    await workspace.mkdir(`libs/${libName}`);
    await workspace.applyTemplate({ basePath: `libs/${libName}`, template: "libRoot", dict: { libName } });
    return LibExecutor.from(workspace, libName);
  }
  async removeLibrary(lib: Lib) {
    await lib.workspace.removeDir(`libs/${lib.name}`);
  }

  async #copyInstalledLibrary(workspace: Workspace, libName: string) {
    const installedPackageJson = `node_modules/akanjs/libs/${libName}/package.json`;
    if (!(await workspace.exists(installedPackageJson))) return null;
    await workspace.cp(`node_modules/akanjs/libs/${libName}`, `libs/${libName}`);
    return { origin: "akanjs", sha: await this.#installedAkanVersion(workspace) };
  }

  async #installedAkanVersion(workspace: Workspace) {
    const manifestPath = "node_modules/akanjs/package.json";
    if (!(await workspace.exists(manifestPath))) return "unknown";
    const { version } = (await workspace.readJson(manifestPath)) as { version?: string };
    return version ?? "unknown";
  }

  //? `--exit-code` exits 2 only for a missing ref; an unreachable remote exits 128, as `clone --branch` does for both.
  async #hasTag(workspace: Workspace, tag: string) {
    try {
      await workspace.spawn("git", ["ls-remote", "--exit-code", LibraryRunner.libraryRepository, `refs/tags/${tag}`]);
      return true;
    } catch (error) {
      if (error instanceof CommandExecutionError && error.code === 2) return false;
      throw error;
    }
  }

  async #cloneRepository(workspace: Workspace) {
    const repository = LibraryRunner.libraryRepository;
    const version = await this.#installedAkanVersion(workspace);
    const tag = version === "unknown" ? null : `v${version}`;
    const branch = tag && (await this.#hasTag(workspace, tag)) ? ["--branch", tag] : [];
    if (!branch.length) {
      const reason = tag ? `akanjs ${version} has no ${tag} tag` : "akanjs is not installed in this workspace";
      workspace.logger.warn(
        `${reason}; installing libraries from the default branch of ${repository}, which may expect a newer akanjs`,
      );
    }
    if (await workspace.exists(LibraryRunner.#cloneDir)) await workspace.removeDir(LibraryRunner.#cloneDir);
    await workspace.spawn("git", ["clone", "--depth", "1", ...branch, repository, LibraryRunner.#cloneDir]);
    const sha = await workspace.spawn("git", ["-C", LibraryRunner.#cloneDir, "rev-parse", "HEAD"]);
    return { origin: repository, sha: sha.trim().slice(0, 12) };
  }

  async #copyLibraryFromRepository(workspace: Workspace, libName: string) {
    const cloned = this.#clones.get(workspace.workspaceRoot);
    const source =
      cloned && (await workspace.exists(LibraryRunner.#cloneDir)) ? cloned : await this.#cloneRepository(workspace);
    this.#clones.set(workspace.workspaceRoot, source);
    await workspace.cp(`${LibraryRunner.#cloneDir}/libs/${libName}`, `libs/${libName}`);
    return source;
  }

  // Re-runnable: the source is overwritten, the testing env (the installer's own values) is kept, and an empty
  // index skips the commit.
  async installLibrary(workspace: Workspace, libName: string) {
    const source =
      (await this.#copyInstalledLibrary(workspace, libName)) ??
      (await this.#copyLibraryFromRepository(workspace, libName));
    const testingEnv = `libs/${libName}/env/env.server.testing.ts`;
    if (!(await workspace.exists(testingEnv)))
      await workspace.cp(`libs/${libName}/env/env.server.example.ts`, testingEnv);
    const lib = LibExecutor.from(workspace, libName);
    const stamp = await new LibSource(lib).write(source);
    if (await workspace.hasChanges()) await workspace.commit(`Install ${libName} library from ${stamp.origin}`);
    return lib;
  }

  async libraryStatuses(workspace: Workspace) {
    const libNames = await workspace.getLibs();
    return await Promise.all(libNames.map((libName) => new LibSource(LibExecutor.from(workspace, libName)).status()));
  }
  //* The root wins: a lib's manifest carries the versions of the workspace it was copied from, not this one's.
  async mergeLibraryDependencies(lib: Lib) {
    const [libPackageJson, rootPackageJson] = await Promise.all([lib.getPackageJson(), lib.workspace.getPackageJson()]);
    const rootVersionOf = (dep: string) =>
      rootPackageJson.dependencies?.[dep] ?? rootPackageJson.devDependencies?.[dep];
    const missingFrom = (deps: Record<string, string> = {}) =>
      Object.entries(deps).filter(([dep]) => !rootVersionOf(dep));
    const dependencies = missingFrom(libPackageJson.dependencies);
    const devDependencies = missingFrom(libPackageJson.devDependencies).filter(
      ([dep]) => !libPackageJson.dependencies?.[dep],
    );
    const behind = Object.entries({ ...libPackageJson.devDependencies, ...libPackageJson.dependencies }).flatMap(
      ([dep, version]) => {
        const rootVersion = rootVersionOf(dep);
        return rootVersion && compareSemver(version, rootVersion) > 0
          ? [`${dep} ${rootVersion} (lib: ${version})`]
          : [];
      },
    );
    if (behind.length)
      lib.logger.warn(`Kept the root versions of packages libs/${lib.name} lists newer: ${behind.join(", ")}`);
    if (dependencies.length || devDependencies.length) {
      await lib.workspace.setPackageJson({
        ...rootPackageJson,
        dependencies: this.#withAdded(rootPackageJson.dependencies, dependencies),
        devDependencies: this.#withAdded(rootPackageJson.devDependencies, devDependencies),
      });
      await lib.workspace.spawn("bun", ["install"]);
    }
    if (await lib.workspace.hasChanges()) await lib.workspace.commit(`Merge ${lib.name} library dependencies`);
  }
  #withAdded(deps: Record<string, string> | undefined, added: [string, string][]) {
    if (!added.length) return deps;
    return Object.fromEntries([...Object.entries(deps ?? {}), ...added].sort(([a], [b]) => (a < b ? -1 : 1)));
  }
}
