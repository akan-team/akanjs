import {
  type AppConfigResult,
  type AppScanResult,
  type FileConventionScanResult,
  type LibConfigResult,
  type LibScanResult,
  type PkgScanResult,
  type ScanResult,
} from "@akanjs/config";
import path from "path";

import { TypeScriptDependencyScanner } from "./dependencyScanner";
import { AppExecutor, LibExecutor, PkgExecutor, type WorkspaceExecutor } from "./executors";

const scalarFileTypes = ["constant", "dictionary", "document", "template", "unit", "util", "view", "zone"] as const;
type ScalarFileType = (typeof scalarFileTypes)[number];
const serviceFileTypes = [
  "dictionary",
  "service",
  "signal",
  "store",
  "template",
  "unit",
  "util",
  "view",
  "zone",
] as const;
type ServiceFileType = (typeof serviceFileTypes)[number];
const databaseFileTypes = [
  "constant",
  "dictionary",
  "document",
  "service",
  "signal",
  "store",
  "template",
  "unit",
  "util",
  "view",
  "zone",
] as const;
type DatabaseFileType = (typeof databaseFileTypes)[number];

class ScanInfo {
  protected scanResult: ScanResult;

  readonly name: string;
  readonly scalar = new Map<string, Set<ScalarFileType>>();
  readonly service = new Map<string, Set<ServiceFileType>>();
  readonly database = new Map<string, Set<DatabaseFileType>>();
  readonly file = Object.fromEntries(
    databaseFileTypes.map((type) => [
      type,
      { all: new Set(), databases: new Set(), services: new Set(), scalars: new Set() },
    ])
  ) as {
    [key in DatabaseFileType]: {
      all: Set<string>;
      databases: Set<string>;
      services: Set<string>;
      scalars: Set<string>;
    };
  };

  static async getScanResult(exec: AppExecutor | LibExecutor) {
    const akanConfig = await exec.getConfig();
    const tsconfig = exec.getTsConfig();
    const rootPackageJson = exec.workspace.getPackageJson();
    const gitignorePatterns = exec.workspace.getGitignorePatterns();
    const scanner = new TypeScriptDependencyScanner(exec.cwdPath, {
      workspaceRoot: exec.workspace.cwdPath,
      tsconfig,
      rootPackageJson,
      gitignorePatterns,
    });
    const { pkgDeps, libDeps, npmDeps } = await scanner.getMonorepoDependencies(exec.name);
    const files: FileConventionScanResult = {
      constant: { databases: [], scalars: [] },
      dictionary: { databases: [], services: [], scalars: [] },
      document: { databases: [], scalars: [] },
      service: { databases: [], services: [] },
      signal: { databases: [], services: [] },
      store: { databases: [], services: [] },
      template: { databases: [], services: [], scalars: [] },
      unit: { databases: [], services: [], scalars: [] },
      util: { databases: [], services: [], scalars: [] },
      view: { databases: [], services: [], scalars: [] },
      zone: { databases: [], services: [], scalars: [] },
    };
    const [{ dirs: dirnames }, scalarDirs] = await Promise.all([
      exec.getFilesAndDirs("lib"),
      exec.readdir("lib/__scalar"),
    ]);
    const databaseDirs: string[] = [];
    const serviceDirs: string[] = [];
    dirnames.forEach((name) => {
      if (name.startsWith("_")) {
        if (name.startsWith("__")) return;
        else serviceDirs.push(name);
      } else databaseDirs.push(name);
    });

    await Promise.all([
      ...databaseDirs.map(async (name) => {
        const filenames = await exec.readdir(path.join("lib", name));
        filenames.forEach((filename) => {
          if (filename.endsWith(".constant.ts")) files.constant.databases.push(name);
          else if (filename.endsWith(".dictionary.ts")) files.dictionary.databases.push(name);
          else if (filename.endsWith(".document.ts")) files.document.databases.push(name);
          else if (filename.endsWith(".service.ts")) files.service.databases.push(name);
          else if (filename.endsWith(".signal.ts")) files.signal.databases.push(name);
          else if (filename.endsWith(".store.ts")) files.store.databases.push(name);
          else if (filename.endsWith(".Template.tsx")) files.template.databases.push(name);
          else if (filename.endsWith(".Unit.tsx")) files.unit.databases.push(name);
          else if (filename.endsWith(".Util.tsx")) files.util.databases.push(name);
          else if (filename.endsWith(".View.tsx")) files.view.databases.push(name);
          else if (filename.endsWith(".Zone.tsx")) files.zone.databases.push(name);
        });
      }),
      ...serviceDirs.map(async (dirname) => {
        const name = dirname.slice(1);
        const filenames = await exec.readdir(path.join("lib", dirname));
        filenames.forEach((filename) => {
          if (filename.endsWith(".dictionary.ts")) files.dictionary.services.push(name);
          else if (filename.endsWith(".service.ts")) files.service.services.push(name);
          else if (filename.endsWith(".signal.ts")) files.signal.services.push(name);
          else if (filename.endsWith(".store.ts")) files.store.services.push(name);
          else if (filename.endsWith(".Template.tsx")) files.template.services.push(name);
          else if (filename.endsWith(".Unit.tsx")) files.unit.services.push(name);
          else if (filename.endsWith(".Util.tsx")) files.util.services.push(name);
          else if (filename.endsWith(".View.tsx")) files.view.services.push(name);
          else if (filename.endsWith(".Zone.tsx")) files.zone.services.push(name);
        });
      }),
      ...scalarDirs.map(async (name) => {
        const filenames = await exec.readdir(path.join("lib/__scalar", name));
        filenames.forEach((filename) => {
          if (filename.endsWith(".constant.ts")) files.constant.scalars.push(name);
          else if (filename.endsWith(".dictionary.ts")) files.dictionary.scalars.push(name);
          else if (filename.endsWith(".document.ts")) files.document.scalars.push(name);
          else if (filename.endsWith(".Template.tsx")) files.template.scalars.push(name);
          else if (filename.endsWith(".Unit.tsx")) files.unit.scalars.push(name);
          else if (filename.endsWith(".Util.tsx")) files.util.scalars.push(name);
          else if (filename.endsWith(".View.tsx")) files.view.scalars.push(name);
          else if (filename.endsWith(".Zone.tsx")) files.zone.scalars.push(name);
        });
      }),
    ]);
    const scanResult: AppScanResult | LibScanResult = {
      name: exec.name,
      type: exec.type,
      repoName: exec.workspace.repoName,
      serveDomain: exec.workspace.getBaseDevEnv().serveDomain,
      akanConfig,
      files,
      libDeps,
      pkgDeps,
      dependencies: npmDeps.filter((dep) => !dep.startsWith("@akanjs")),
    };
    return scanResult;
  }

  constructor(scanResult: ScanResult) {
    this.name = scanResult.name;
    this.scanResult = scanResult;
    Object.entries(scanResult.files).forEach(([_key, value]) => {
      const key = _key as DatabaseFileType;
      const { databases, services, scalars } = value as {
        databases: string[];
        services?: string[];
        scalars?: string[];
      };
      databases.forEach((modelName) => {
        const model = this.database.get(modelName) ?? new Set<DatabaseFileType>();
        model.add(key);
        this.database.set(modelName, model);
        this.file[key].all.add(modelName);
        this.file[key].databases.add(modelName);
      });
      services?.forEach((serviceName) => {
        const service = this.service.get(serviceName) ?? new Set<ServiceFileType>();
        service.add(key as ServiceFileType);
        this.service.set(serviceName, service);
        this.file[key].all.add(serviceName);
        this.file[key].services.add(serviceName);
      });
      scalars?.forEach((scalarName) => {
        const scalar = this.scalar.get(scalarName) ?? new Set<ScalarFileType>();
        scalar.add(key as ScalarFileType);
        this.scalar.set(scalarName, scalar);
        this.file[key].all.add(scalarName);
        this.file[key].scalars.add(scalarName);
      });
    });
  }
  getScanResult() {
    return this.scanResult;
  }
  getDatabaseModules() {
    return [...this.database.keys()];
  }
  getServiceModules() {
    return [...this.service.keys()];
  }
  getScalarModules() {
    return [...this.scalar.keys()];
  }
}
export class AppInfo extends ScanInfo {
  readonly type = "app";
  readonly exec: AppExecutor;
  readonly akanConfig: AppConfigResult;

  static appInfos = new Map<string, AppInfo>();
  static async fromExecutor(exec: AppExecutor, options: { refresh?: boolean } = {}) {
    // cache check
    const existingAppInfo = this.appInfos.get(exec.name);
    if (existingAppInfo && !options.refresh) return existingAppInfo;
    const scanResult = await super.getScanResult(exec);

    await Promise.all(
      scanResult.libDeps.map(async (libName) => {
        LibInfo.loadedLibs.add(libName);
        const libExecutor = LibExecutor.from(exec, libName);
        LibInfo.libInfos.set(libName, await LibInfo.fromExecutor(libExecutor));
      })
    );
    const appInfo = new AppInfo(exec, scanResult as AppScanResult);
    this.appInfos.set(exec.name, appInfo);
    return appInfo;
  }

  constructor(exec: AppExecutor, scanResult: AppScanResult) {
    super(scanResult);
    this.exec = exec;
    this.akanConfig = scanResult.akanConfig;
  }
  getScanResult(): AppScanResult {
    return this.scanResult as AppScanResult;
  }

  #sortedLibs: string[] | null = null;
  #getSortedLibs() {
    if (this.#sortedLibs) return this.#sortedLibs;
    const libIndices = LibInfo.getSortedLibIndices();
    this.#sortedLibs = this.getScanResult().libDeps.sort((libNameA, libNameB) => {
      const indexA = libIndices.get(libNameA);
      const indexB = libIndices.get(libNameB);
      if (indexA === undefined || indexB === undefined)
        throw new Error(`LibInfo not found: ${libNameA} or ${libNameB}`);
      return indexA - indexB;
    });
    return this.#sortedLibs;
  }
  getLibs() {
    return this.#getSortedLibs();
  }
  getLibInfo(libName: string) {
    const libSet = new Set(this.#getSortedLibs());
    if (!libSet.has(libName)) throw new Error(`LibInfo is invalid: ${libName}`);
    return LibInfo.libInfos.get(libName);
  }
  getLibInfos() {
    return new Map(
      this.#getSortedLibs().map((libName) => {
        const libInfo = LibInfo.libInfos.get(libName);
        if (!libInfo) throw new Error(`LibInfo not found: ${libName}`);
        return [libName, libInfo];
      })
    );
  }
}
export class LibInfo extends ScanInfo {
  readonly type = "lib";
  readonly exec: LibExecutor;
  readonly akanConfig: LibConfigResult;

  static loadedLibs = new Set<string>();
  static readonly libInfos = new Map<string, LibInfo>();
  static #sortedLibIndices: Map<string, number> | null = null;

  static getSortedLibIndices() {
    if (this.#sortedLibIndices) return this.#sortedLibIndices;
    this.#sortedLibIndices = new Map(
      [...this.libInfos.entries()]
        .sort(([_, libInfoA], [__, libInfoB]) => (libInfoA.getScanResult().libDeps.includes(libInfoB.name) ? 1 : -1))
        .map(([libName], index) => [libName, index])
    );
    return this.#sortedLibIndices;
  }

  static async fromExecutor(exec: LibExecutor, { refresh }: { refresh?: boolean } = {}) {
    const existingLibInfo = this.libInfos.get(exec.name);
    if (existingLibInfo && !refresh) return existingLibInfo;

    const scanResult = await super.getScanResult(exec);
    await Promise.all(
      scanResult.libDeps
        .filter((libName) => !this.loadedLibs.has(libName))
        .map(async (libName) => {
          this.loadedLibs.add(libName);
          const libExecutor = LibExecutor.from(exec, libName);
          this.libInfos.set(libName, await LibInfo.fromExecutor(libExecutor));
        })
    );
    const libInfo = new LibInfo(exec, scanResult);
    this.libInfos.set(exec.name, libInfo);
    this.#sortedLibIndices = null;
    return libInfo;
  }

  constructor(exec: LibExecutor, scanResult: LibScanResult) {
    super(scanResult);
    this.exec = exec;
    this.akanConfig = scanResult.akanConfig;
  }
  getScanResult(): LibScanResult {
    return this.scanResult as LibScanResult;
  }

  #sortedLibs: string[] | null = null;
  #getSortedLibs() {
    if (this.#sortedLibs) return this.#sortedLibs;
    const libs = LibInfo.getSortedLibIndices();
    this.#sortedLibs = this.scanResult.libDeps.sort((libNameA, libNameB) => {
      const indexA = libs.get(libNameA);
      const indexB = libs.get(libNameB);
      if (indexA === undefined || indexB === undefined)
        throw new Error(`LibInfo not found: ${libNameA} or ${libNameB}`);
      return indexA - indexB;
    });
    return this.#sortedLibs;
  }
  getLibs() {
    return this.#getSortedLibs();
  }
  getLibInfo(libName: string) {
    if (!this.getScanResult().libDeps.includes(libName)) return undefined;
    const libSet = new Set(this.#getSortedLibs());
    if (!libSet.has(libName)) throw new Error(`LibInfo is invalid: ${libName}`);
    return LibInfo.libInfos.get(libName);
  }
  getLibInfos() {
    return new Map(
      this.#getSortedLibs().map((libName) => {
        const libInfo = LibInfo.libInfos.get(libName);
        if (!libInfo) throw new Error(`LibInfo not found: ${libName}`);
        return [libName, libInfo];
      })
    );
  }
}

export class PkgInfo {
  readonly exec: PkgExecutor;
  readonly name: string;
  private scanResult: PkgScanResult;

  static async getScanResult(exec: PkgExecutor) {
    const tsconfig = exec.getTsConfig();
    const rootPackageJson = exec.workspace.getPackageJson();
    const gitignorePatterns = exec.workspace.getGitignorePatterns();
    const scanner = new TypeScriptDependencyScanner(exec.cwdPath, {
      workspaceRoot: exec.workspace.cwdPath,
      tsconfig,
      rootPackageJson,
      gitignorePatterns,
    });
    const npmSet = new Set(Object.keys({ ...rootPackageJson.dependencies, ...rootPackageJson.devDependencies }));
    const pkgPathSet = new Set(
      Object.keys(tsconfig.compilerOptions.paths ?? {})
        .filter((path) => tsconfig.compilerOptions.paths?.[path]?.some((resolve) => resolve.startsWith("pkgs/")))
        .map((path) => path.replace("/*", ""))
    );
    const [npmDepSet, pkgPathDepSet] = await scanner.getImportSets([npmSet, pkgPathSet]);
    const pkgDeps = [...pkgPathDepSet]
      .map((path) => {
        const pathSplitLength = path.split("/").length;
        return (tsconfig.compilerOptions.paths?.[path]?.[0] ?? "*")
          .split("/")
          .slice(1, 1 + pathSplitLength)
          .join("/");
      })
      .filter((pkg) => pkg !== this.name);
    const pkgScanResult = {
      name: this.name,
      pkgDeps,
      dependencies: [...npmDepSet],
    };
    return pkgScanResult;
  }

  static #pkgInfos = new Map<string, PkgInfo>();
  static async fromExecutor(exec: PkgExecutor, options: { refresh?: boolean } = {}) {
    const existingPkgInfo = this.#pkgInfos.get(exec.name);
    if (existingPkgInfo && !options.refresh) return existingPkgInfo;

    const scanResult = await this.getScanResult(exec);
    const pkgInfo = new PkgInfo(exec, scanResult);
    this.#pkgInfos.set(exec.name, pkgInfo);
    return pkgInfo;
  }
  constructor(exec: PkgExecutor, scanResult: PkgScanResult) {
    this.exec = exec;
    this.name = exec.name;
    this.scanResult = scanResult;
  }
  getScanResult() {
    return this.scanResult;
  }
}

export class WorkspaceInfo {
  constructor(
    public readonly appInfos: Map<string, AppInfo> = new Map(),
    public readonly libInfos: Map<string, LibInfo> = new Map(),
    public readonly pkgInfos: Map<string, PkgInfo> = new Map()
  ) {}

  static #workspaceInfos = new Map<string, WorkspaceInfo>();
  static async fromExecutor(exec: WorkspaceExecutor, options: { refresh?: boolean } = {}) {
    const existingWorkspaceInfo = this.#workspaceInfos.get(exec.name);
    if (existingWorkspaceInfo && !options.refresh) return existingWorkspaceInfo;

    const [appNames, libNames, pkgNames] = await Promise.all([exec.getApps(), exec.getLibs(), exec.getPkgs()]);
    // TODO: prevent duplicate scan by resolving the dependency graph
    const [appInfos, libInfos, pkgInfos] = await Promise.all([
      Promise.all(
        appNames.map(async (appName) => {
          const app = AppExecutor.from(exec, appName);
          return await app.scan();
        })
      ),
      Promise.all(
        libNames.map(async (libName) => {
          const lib = LibExecutor.from(exec, libName);
          return await lib.scan();
        })
      ),
      Promise.all(
        pkgNames.map(async (pkgName) => {
          return await PkgExecutor.from(exec, pkgName).scan();
        })
      ),
    ]);
    const workspaceInfo = new WorkspaceInfo(
      new Map(appInfos.map((app) => [app.exec.name, app as AppInfo])),
      new Map(libInfos.map((lib) => [lib.exec.name, lib as LibInfo])),
      new Map(pkgInfos.map((pkg: PkgInfo) => [pkg.exec.name, pkg]))
    );
    this.#workspaceInfos.set(exec.name, workspaceInfo);
    return workspaceInfo;
  }
}
