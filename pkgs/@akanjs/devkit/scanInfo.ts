import { rm } from "node:fs/promises";
import path from "node:path";
import type {
  AppConfigResult,
  AppScanResult,
  FileConventionScanResult,
  LibConfigResult,
  LibScanResult,
  PkgScanResult,
  ScanResult,
} from "./akanConfig";

import { TypeScriptDependencyScanner } from "./dependencyScanner";
import { AppExecutor, LibExecutor, PkgExecutor, WorkspaceExecutor } from "./executors";

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

type ModuleKind = "database" | "service" | "scalar";

const appRootAllowedFiles = new Set([
  "akan.app.json",
  "akan.config.ts",
  "capacitor.config.ts",
  "client.ts",
  "main.ts",
  "package.json",
  "server.ts",
  "tsconfig.json",
  "tsconfig.tsbuildinfo",
]);
const generatedRootCapacitorConfigFiles = ["capacitor.config.js", "capacitor.config.json"] as const;
const appRootAllowedDirs = new Set([
  ".akan",
  "android",
  "env",
  "ios",
  "lib",
  "mobile",
  "page",
  "private",
  "public",
  "script",
  "ui",
  "srvkit",
  "webkit",
  "common",
  "secrets",
]);
const libRootAllowedFiles = new Set([
  "cnst.ts",
  "db.ts",
  "dict.ts",
  "option.ts",
  "sig.ts",
  "srv.ts",
  "st.ts",
  "useClient.ts",
  "useServer.ts",
]);
const internalLibDirs = new Set(["__lib", "__scalar"]);
const moduleNonUiFileTypes = {
  database: new Set(["constant", "dictionary", "document", "service", "signal", "store"]),
  service: new Set(["dictionary", "service", "signal", "store"]),
  scalar: new Set(["constant", "dictionary", "document"]),
} satisfies Record<ModuleKind, Set<string>>;
const moduleUiFileTypes = {
  database: new Set(["Template", "Unit", "Util", "View", "Zone"]),
  service: new Set(["Util", "Zone"]),
  scalar: new Set(["Template", "Unit"]),
} satisfies Record<ModuleKind, Set<string>>;
const testFilePattern = /\.(test|spec)\.(ts|tsx)$/;
const rootSignalTestFilePattern = /^[A-Za-z][A-Za-z0-9_-]*\.signal\.(test|spec)\.(ts|tsx)$/;

const isAllowedTestFile = (filename: string) => testFilePattern.test(filename);
const isAllowedLibRootFile = (filename: string) =>
  libRootAllowedFiles.has(filename) || rootSignalTestFilePattern.test(filename);
const getScanPath = (exec: AppExecutor | LibExecutor, relativePath: string) =>
  path.posix.join(`${exec.type}s`, exec.name, relativePath.split(path.sep).join("/"));
async function clearGeneratedRootCapacitorConfigs(exec: AppExecutor | LibExecutor) {
  if (exec.type !== "app") return;
  await Promise.all(generatedRootCapacitorConfigFiles.map((filename) => rm(exec.getPath(filename), { force: true })));
}
const getModuleNameFromPath = (kind: ModuleKind, modulePath: string) => {
  const dirname = path.basename(modulePath);
  return kind === "service" ? dirname.replace(/^_+/, "") : dirname;
};

async function assertScanConvention(exec: AppExecutor | LibExecutor, libRoot: { files: string[]; dirs: string[] }) {
  await clearGeneratedRootCapacitorConfigs(exec);
  const violations: string[] = [];
  const addViolation = (relativePath: string, reason: string) => {
    violations.push(`${getScanPath(exec, relativePath)}: ${reason}`);
  };

  if (exec.type === "app") {
    const { files, dirs } = await exec.getFilesAndDirs(".");
    files
      .filter((filename) => !appRootAllowedFiles.has(filename))
      .forEach((filename) => {
        addViolation(filename, "unsupported app root file");
      });
    dirs
      .filter((dirname) => !appRootAllowedDirs.has(dirname))
      .forEach((dirname) => {
        addViolation(dirname, "unsupported app root folder");
      });
  }

  libRoot.files
    .filter((filename) => !isAllowedLibRootFile(filename))
    .forEach((filename) => {
      addViolation(path.join("lib", filename), "unsupported lib root file");
    });

  libRoot.dirs
    .filter((dirname) => dirname.startsWith("__") && !internalLibDirs.has(dirname))
    .forEach((dirname) => {
      addViolation(path.join("lib", dirname), "unsupported internal lib folder");
    });

  const databaseDirs = libRoot.dirs.filter((dirname) => !dirname.startsWith("_"));
  const serviceDirs = libRoot.dirs.filter((dirname) => dirname.startsWith("_") && !dirname.startsWith("__"));
  const scalarDirs = await exec.readdir("lib/__scalar");
  await Promise.all([
    ...databaseDirs.map((dirname) => validateModuleFiles(exec, violations, "database", path.join("lib", dirname))),
    ...serviceDirs.map((dirname) => validateModuleFiles(exec, violations, "service", path.join("lib", dirname))),
    ...scalarDirs.map((dirname) => validateModuleFiles(exec, violations, "scalar", path.join("lib/__scalar", dirname))),
  ]);

  if (violations.length > 0) {
    throw new Error(
      `[scan-convention]\n${violations
        .sort()
        .map((violation) => `- ${violation}`)
        .join("\n")}`,
    );
  }
}

async function validateModuleFiles(
  exec: AppExecutor | LibExecutor,
  violations: string[],
  kind: ModuleKind,
  modulePath: string,
) {
  const { files, dirs } = await exec.getFilesAndDirs(modulePath);
  const moduleName = getModuleNameFromPath(kind, modulePath);
  dirs.forEach((dirname) => {
    violations.push(`${getScanPath(exec, path.join(modulePath, dirname))}: unsupported module folder`);
  });

  const uiModuleName = moduleName[0].toUpperCase() + moduleName.slice(1);

  files.forEach((filename) => {
    const filePath = path.join(modulePath, filename);
    if (filename === "index.ts" || filename === "index.tsx" || isAllowedTestFile(filename)) return;
    if (filename === `${moduleName}.abstract.md`) return;

    const uiMatch = filename.match(/^([A-Z][A-Za-z0-9]+)\.([A-Z][A-Za-z0-9]*)\.tsx$/);
    if (uiMatch) {
      const fileModuleName = uiMatch[1];
      const fileType = uiMatch[2];
      if (fileModuleName !== uiModuleName) {
        violations.push(
          `${getScanPath(exec, filePath)}: module name mismatch: expected '${uiModuleName}', got '${fileModuleName}'`,
        );
      }
      if (!moduleUiFileTypes[kind].has(fileType)) {
        violations.push(`${getScanPath(exec, filePath)}: unsupported ${kind} UI file`);
      }
      return;
    }

    const nonUiMatch = filename.match(/^([a-z][a-zA-Z0-9]*)\.([a-z][a-z0-9]*)\.ts$/);
    if (nonUiMatch) {
      const fileModuleName = nonUiMatch[1];
      const fileType = nonUiMatch[2];
      if (fileModuleName !== moduleName) {
        violations.push(
          `${getScanPath(exec, filePath)}: module name mismatch: expected '${moduleName}', got '${fileModuleName}'`,
        );
      }
      if (!moduleNonUiFileTypes[kind].has(fileType)) {
        violations.push(`${getScanPath(exec, filePath)}: unsupported ${kind} file`);
      }
      return;
    }

    violations.push(`${getScanPath(exec, filePath)}: unsupported module file`);
  });
}

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
    ]),
  ) as {
    [key in DatabaseFileType]: {
      all: Set<string>;
      databases: Set<string>;
      services: Set<string>;
      scalars: Set<string>;
    };
  };

  static async getScanResult(exec: AppExecutor | LibExecutor) {
    const [akanConfig, scanner, pkgs, libs] = await Promise.all([
      exec.getConfig(),
      TypeScriptDependencyScanner.from(exec),
      exec.workspace.getPkgs(),
      exec.workspace.getLibs(),
    ]);
    const { pkgDeps, libDeps, npmDeps, npmDevDeps } = await scanner.getMonorepoDependencies(exec.name, { pkgs, libs });
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
    const [libRoot, scalarDirs] = await Promise.all([exec.getFilesAndDirs("lib"), exec.readdir("lib/__scalar")]);
    await assertScanConvention(exec, libRoot);
    const { dirs: dirnames } = libRoot;
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
    const routes = exec.type === "lib" ? [] : await (exec as AppExecutor).getPageKeys();
    const scanResult: AppScanResult | LibScanResult = {
      name: exec.name,
      type: exec.type,
      repoName: exec.workspace.repoName,
      serveDomain: WorkspaceExecutor.getBaseDevEnv(path.join(exec.workspace.workspaceRoot, ".env")).serveDomain,
      akanConfig,
      files,
      libDeps,
      pkgDeps,
      dependencies: npmDeps.filter((dep) => !isAkanFrameworkDependency(dep)),
      devDependencies: npmDevDeps.filter((dep) => !isAkanFrameworkDependency(dep)),
      routes,
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

const isAkanFrameworkDependency = (dep: string) => dep === "akanjs" || dep.startsWith("akanjs/");
export class AppInfo extends ScanInfo {
  readonly type = "app";
  readonly exec: AppExecutor;
  readonly akanConfig: AppConfigResult;
  readonly libDeps: string[];

  static appInfos = new Map<string, AppInfo>();
  static async fromExecutor(exec: AppExecutor, options: { refresh?: boolean } = {}) {
    // cache check
    const existingAppInfo = AppInfo.appInfos.get(exec.name);
    if (existingAppInfo && !options.refresh) return existingAppInfo;
    const scanResult = await ScanInfo.getScanResult(exec);

    await Promise.all(
      scanResult.libDeps.map(async (libName) => {
        LibInfo.loadedLibs.add(libName);
        const libExecutor = LibExecutor.from(exec, libName);
        LibInfo.libInfos.set(libName, await LibInfo.fromExecutor(libExecutor));
      }),
    );
    const libDeps = await AppInfo.#getAllLibDeps(exec, scanResult.libDeps);
    const appInfo = new AppInfo(exec, scanResult as AppScanResult, libDeps);
    AppInfo.appInfos.set(exec.name, appInfo);
    return appInfo;
  }

  constructor(exec: AppExecutor, scanResult: AppScanResult, libDeps: string[]) {
    super(scanResult);
    this.exec = exec;
    this.akanConfig = scanResult.akanConfig;
    this.libDeps = libDeps;
  }
  override getScanResult(): AppScanResult {
    return this.scanResult as AppScanResult;
  }

  static async #getAllLibDeps(exec: AppExecutor, libDeps: string[], libSet = new Set<string>()) {
    await Promise.all(
      libDeps.map(async (libName) => {
        if (libSet.has(libName)) return;
        libSet.add(libName);
        const libExecutor = LibExecutor.from(exec, libName);
        const libInfo = await LibInfo.fromExecutor(libExecutor);
        const libScanResult = libInfo.getScanResult();
        if (libScanResult.libDeps.length > 0) await AppInfo.#getAllLibDeps(exec, libScanResult.libDeps, libSet);
      }),
    );
    return [...libSet];
  }

  #sortedLibs: string[] | null = null;
  #getSortedLibs() {
    if (this.#sortedLibs) return this.#sortedLibs;
    const libIndices = LibInfo.getSortedLibIndices();
    this.#sortedLibs = this.libDeps.sort((libNameA, libNameB) => {
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
  getLibInfos() {
    return new Map(
      this.#getSortedLibs().map((libName) => {
        const libInfo = LibInfo.libInfos.get(libName);
        if (!libInfo) throw new Error(`LibInfo not found: ${libName}`);
        return [libName, libInfo];
      }),
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
    if (LibInfo.#sortedLibIndices) return LibInfo.#sortedLibIndices;
    LibInfo.#sortedLibIndices = new Map(
      [...LibInfo.libInfos.entries()]
        .sort(([_, libInfoA], [__, libInfoB]) => (libInfoA.getScanResult().libDeps.includes(libInfoB.name) ? 1 : -1))
        .map(([libName], index) => [libName, index]),
    );
    return LibInfo.#sortedLibIndices;
  }

  static async fromExecutor(exec: LibExecutor, { refresh }: { refresh?: boolean } = {}) {
    const existingLibInfo = LibInfo.libInfos.get(exec.name);
    if (existingLibInfo && !refresh) return existingLibInfo;

    const scanResult = await ScanInfo.getScanResult(exec);
    await Promise.all(
      scanResult.libDeps
        .filter((libName) => !LibInfo.loadedLibs.has(libName))
        .map(async (libName) => {
          LibInfo.loadedLibs.add(libName);
          const libExecutor = LibExecutor.from(exec, libName);
          LibInfo.libInfos.set(libName, await LibInfo.fromExecutor(libExecutor));
        }),
    );
    const libInfo = new LibInfo(exec, scanResult);
    LibInfo.libInfos.set(exec.name, libInfo);
    LibInfo.#sortedLibIndices = null;
    return libInfo;
  }

  constructor(exec: LibExecutor, scanResult: LibScanResult) {
    super(scanResult);
    this.exec = exec;
    this.akanConfig = scanResult.akanConfig;
  }
  override getScanResult(): LibScanResult {
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
      }),
    );
  }
}

export class PkgInfo {
  readonly exec: PkgExecutor;
  readonly name: string;
  private scanResult: PkgScanResult;

  static async scanExecutor(exec: PkgExecutor) {
    const [tsconfig, rootPackageJson] = await Promise.all([exec.getTsConfig(), exec.workspace.getPackageJson()]);
    const scanner = await TypeScriptDependencyScanner.from(exec);
    const npmSet = new Set(Object.keys({ ...rootPackageJson.dependencies, ...rootPackageJson.devDependencies }));
    const pkgPathSet = new Set(
      Object.keys(tsconfig.compilerOptions.paths ?? {})
        .filter((path) => tsconfig.compilerOptions.paths?.[path]?.some((resolve) => resolve.startsWith("pkgs/")))
        .map((path) => path.replace("/*", "")),
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
      .filter((pkg) => pkg !== exec.name);
    const pkgScanResult = {
      name: exec.name,
      pkgDeps,
      dependencies: [...npmDepSet],
    };
    return pkgScanResult;
  }

  static #pkgInfos = new Map<string, PkgInfo>();
  static async fromExecutor(exec: PkgExecutor, options: { refresh?: boolean } = {}) {
    const existingPkgInfo = PkgInfo.#pkgInfos.get(exec.name);
    if (existingPkgInfo && !options.refresh) return existingPkgInfo;

    const scanResult = await PkgInfo.scanExecutor(exec);
    const pkgInfo = new PkgInfo(exec, scanResult);
    PkgInfo.#pkgInfos.set(exec.name, pkgInfo);
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
    public readonly pkgInfos: Map<string, PkgInfo> = new Map(),
  ) {}

  static #workspaceInfos = new Map<string, WorkspaceInfo>();
  static async fromExecutor(exec: WorkspaceExecutor, options: { refresh?: boolean } = {}) {
    const existingWorkspaceInfo = WorkspaceInfo.#workspaceInfos.get(exec.name);
    if (existingWorkspaceInfo && !options.refresh) return existingWorkspaceInfo;

    const [appNames, libNames, pkgNames] = await Promise.all([exec.getApps(), exec.getLibs(), exec.getPkgs()]);
    // TODO: prevent duplicate scan by resolving the dependency graph
    const [appInfos, libInfos, pkgInfos] = await Promise.all([
      Promise.all(
        appNames.map(async (appName) => {
          const app = AppExecutor.from(exec, appName);
          return await app.scan();
        }),
      ),
      Promise.all(
        libNames.map(async (libName) => {
          const lib = LibExecutor.from(exec, libName);
          return await lib.scan();
        }),
      ),
      Promise.all(
        pkgNames.map(async (pkgName) => {
          return await PkgExecutor.from(exec, pkgName).scan();
        }),
      ),
    ]);
    const workspaceInfo = new WorkspaceInfo(
      new Map(appInfos.map((app) => [app.exec.name, app as AppInfo])),
      new Map(libInfos.map((lib) => [lib.exec.name, lib as LibInfo])),
      new Map(pkgInfos.map((pkg: PkgInfo) => [pkg.exec.name, pkg])),
    );
    WorkspaceInfo.#workspaceInfos.set(exec.name, workspaceInfo);
    return workspaceInfo;
  }
}
