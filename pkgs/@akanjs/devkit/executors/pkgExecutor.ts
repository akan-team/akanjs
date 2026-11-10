import path from "node:path";
import { PkgInfo } from "../scanInfo";
import type { PackageJson, TsConfigJson } from "../types";
import { Executor, execEmoji } from "./executor";
import type { NamedExecutorOptions, SysExecutor } from "./sysExecutor";
import { WorkspaceExecutor } from "./workspaceExecutor";

export class PkgExecutor extends Executor {
  workspace: WorkspaceExecutor;
  override name: string;
  dist: Executor;
  override emoji = execEmoji.pkg;
  constructor({ workspace = WorkspaceExecutor.fromRoot(), name }: NamedExecutorOptions) {
    super(name, `${workspace.workspaceRoot}/pkgs/${name}`);
    this.workspace = workspace;
    this.name = name;
    this.dist = new Executor(`dist/${name}`, `${this.workspace.workspaceRoot}/dist/pkgs/${name}`);
  }
  static from(executor: SysExecutor | WorkspaceExecutor, name: string) {
    return new PkgExecutor({ workspace: executor instanceof WorkspaceExecutor ? executor : executor.workspace, name });
  }

  #scanInfo: PkgInfo | null = null;
  async scan({ refresh }: { refresh?: boolean } = {}): Promise<PkgInfo> {
    if (this.#scanInfo && !refresh) return this.#scanInfo;
    const scanInfo = await PkgInfo.fromExecutor(this, { refresh });
    this.#scanInfo = scanInfo;
    return scanInfo;
  }
  async #getDependencyVersion(rootPackageJson: PackageJson, dep: string): Promise<string | undefined> {
    const rootDeps = {
      ...rootPackageJson.dependencies,
      ...rootPackageJson.devDependencies,
    };
    const rootVersion = rootDeps[dep];
    if (rootVersion) return rootVersion;
    // Overrides never reach a consumer's install, so a pinned transitive dep is published as a dependency.
    const overrideVersion = rootPackageJson.overrides?.[dep];
    if (typeof overrideVersion === "string") return overrideVersion;

    try {
      const packageJsonPath = `pkgs/${dep}/package.json`;
      if (!(await Bun.file(path.join(this.workspace.workspaceRoot, packageJsonPath)).exists())) return undefined;
      const packageJson = await this.workspace.readJson(packageJsonPath);
      if ((packageJson as PackageJson).name === dep) return (packageJson as PackageJson).version;
    } catch {
      return undefined;
    }
  }
  async #toDependencyMap(
    rootPackageJson: PackageJson,
    dependencies: string[] = [],
    devDependencies: string[] = [],
  ): Promise<Pick<PackageJson, "dependencies" | "devDependencies">> {
    const dependencyNames = [...new Set(dependencies)].sort();
    const devDependencyNames = [...new Set(devDependencies)]
      .filter((dep) => !dependencyNames.includes(dep))
      .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    const dependencyVersions = new Map<string, string>();
    const missingDeps: string[] = [];
    for (const dep of [...dependencyNames, ...devDependencyNames]) {
      const version = await this.#getDependencyVersion(rootPackageJson, dep);
      if (version) dependencyVersions.set(dep, version);
      else missingDeps.push(dep);
    }
    if (missingDeps.length > 0)
      throw new Error(`Missing dependency versions in root package.json: ${missingDeps.join(", ")}`);

    const toDependencyMap = (names: string[]) =>
      Object.fromEntries(names.map((dep) => [dep, dependencyVersions.get(dep) as string]));
    return { dependencies: toDependencyMap(dependencyNames), devDependencies: toDependencyMap(devDependencyNames) };
  }
  async updatePackageJsonDependencies(
    dependencies: string[] = [],
    devDependencies: string[] = [],
  ): Promise<PackageJson> {
    const [rootPackageJson, pkgJson] = await Promise.all([this.workspace.getPackageJson(), this.getPackageJson()]);
    const dependencyMaps = await this.#toDependencyMap(rootPackageJson, dependencies, devDependencies);
    const newPkgJson = {
      ...pkgJson,
      ...dependencyMaps,
    };
    await this.writeJson("package.json", newPkgJson);
    return newPkgJson;
  }
  async generateDistPackageJson(dependencies: string[] = [], devDependencies: string[] = []): Promise<PackageJson> {
    const [rootPackageJson, pkgJson] = await Promise.all([this.workspace.getPackageJson(), this.getPackageJson()]);
    const dependencyMaps = await this.#toDependencyMap(rootPackageJson, dependencies, devDependencies);
    const distPkgJson: PackageJson = {
      ...pkgJson,
      type: "module",
      exports: {
        ...pkgJson.exports,
        ".": {
          import: "./index.ts",
          types: "./index.ts",
          default: "./index.ts",
        },
      },
      engines: { bun: ">=1.4.4" },
      ...dependencyMaps,
    };
    await Promise.all([this.dist.writeJson("package.json", distPkgJson), this.writeJson("package.json", distPkgJson)]);
    return distPkgJson;
  }
  async build(): Promise<void> {
    await Bun.build({
      root: this.cwdPath,
      entrypoints: [`${this.cwdPath}/index.ts`],
      splitting: false,
      target: "bun",
    });
    await this.cp(`${this.cwdPath}/dist`, this.dist.cwdPath);
  }
  async generateTsconfigJson(): Promise<TsConfigJson> {
    const [rootTsconfig, pkgTsconfig] = await Promise.all([this.workspace.getTsConfig(), this.getTsConfig()]);
    const tsconfig: TsConfigJson = {
      ...rootTsconfig,
      ...pkgTsconfig,
      compilerOptions: {
        ...rootTsconfig.compilerOptions,
        ...pkgTsconfig.compilerOptions,
        paths: {},
      },
    };
    await this.dist.writeJson("tsconfig.json", tsconfig);
    return tsconfig;
  }
}
