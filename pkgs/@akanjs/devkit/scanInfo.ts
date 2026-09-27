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
import { AkanAppConfig } from "./akanConfig";
import { AppExecutor, LibExecutor, PkgExecutor, WorkspaceExecutor } from "./executors";
import { isAllowedLibFacetRootFile, rootAllowedDirs, rootAllowedFiles, rootEntryHintOf } from "./workspaceLayout";

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
const databaseFileTypes = ["constant", "dictionary", "document", ...serviceFileTypes.slice(1)] as const;
type DatabaseFileType = (typeof databaseFileTypes)[number];
const uiFileTypes = new Set<DatabaseFileType>(["template", "unit", "util", "view", "zone"]);
const fileTypeOf = (filename: string) =>
  databaseFileTypes.find((type) =>
    filename.endsWith(uiFileTypes.has(type) ? `.${type[0].toUpperCase()}${type.slice(1)}.tsx` : `.${type}.ts`),
  );

type ModuleKind = "database" | "service" | "scalar";

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

// Lazy: the dependency scanner pulls in `typescript` (~65MB resident), which only scan and sync need.
const createDependencyScanner = async (exec: AppExecutor | LibExecutor | PkgExecutor) =>
  (await import("./dependencyScanner")).TypeScriptDependencyScanner.from(exec);

const getScanPath = (exec: AppExecutor | LibExecutor, relativePath: string) =>
  path.posix.join(`${exec.type}s`, exec.name, relativePath.split(path.sep).join("/"));
const getModuleNameFromPath = (kind: ModuleKind, modulePath: string) => {
  const dirname = path.basename(modulePath);
  return kind === "service" ? dirname.replace(/^_+/, "") : dirname;
};

async function assertScanConvention(exec: AppExecutor | LibExecutor, libRoot: { files: string[]; dirs: string[] }) {
  const violations: string[] = [];
  const addViolation = (relativePath: string, reason: string) => {
    violations.push(`${getScanPath(exec, relativePath)}: ${reason}`);
  };

  const allowedRootFiles: ReadonlySet<string> = rootAllowedFiles[exec.type];
  const allowedRootDirs: ReadonlySet<string> = rootAllowedDirs[exec.type];
  const { files, dirs } = await exec.getFilesAndDirs(".");
  for (const filename of files)
    if (!allowedRootFiles.has(filename))
      addViolation(filename, rootEntryHintOf(exec.type, filename) ?? `unsupported ${exec.type} root file`);
  for (const dirname of dirs)
    if (!allowedRootDirs.has(dirname))
      addViolation(dirname, rootEntryHintOf(exec.type, dirname) ?? `unsupported ${exec.type} root folder`);

  //* A lib has no `getPageKeys`, so its own route files are validated here.
  if (exec.type === "lib")
    for (const { relativePath, reason } of await exec.getPageConventionViolations()) addViolation(relativePath, reason);

  for (const filename of libRoot.files)
    if (!isAllowedLibFacetRootFile(filename))
      addViolation(path.join("lib", filename), "unsupported lib facet root file");
  for (const dirname of libRoot.dirs)
    if (dirname.startsWith("__") && !internalLibDirs.has(dirname))
      addViolation(path.join("lib", dirname), "unsupported internal lib folder");

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

  for (const filename of files) {
    const scanPath = getScanPath(exec, path.join(modulePath, filename));
    if (filename === "index.ts" || filename === "index.tsx" || /\.(test|spec)\.(ts|tsx)$/.test(filename)) continue;
    if (filename === `${moduleName}.abstract.md`) continue;
    const uiMatch = filename.match(/^([A-Z][A-Za-z0-9]+)\.([A-Z][A-Za-z0-9]*)\.tsx$/);
    const match = uiMatch ?? filename.match(/^([a-z][a-zA-Z0-9]*)\.([a-z][a-z0-9]*)\.ts$/);
    if (!match) {
      violations.push(`${scanPath}: unsupported module file`);
      continue;
    }
    const [, fileModuleName, fileType] = match;
    const expectedName = uiMatch ? uiModuleName : moduleName;
    if (fileModuleName !== expectedName)
      violations.push(`${scanPath}: module name mismatch: expected '${expectedName}', got '${fileModuleName}'`);
    if (!(uiMatch ? moduleUiFileTypes : moduleNonUiFileTypes)[kind].has(fileType))
      violations.push(`${scanPath}: unsupported ${kind}${uiMatch ? " UI" : ""} file`);
  }
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
      createDependencyScanner(exec),
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

    const collect = async (dir: string, name: string, kind: "databases" | "services" | "scalars") => {
      for (const filename of await exec.readdir(dir)) {
        const type = fileTypeOf(filename);
        if (type) (files[type] as { [key in typeof kind]?: string[] })[kind]?.push(name);
      }
    };
    await Promise.all([
      ...databaseDirs.map((name) => collect(path.join("lib", name), name, "databases")),
      ...serviceDirs.map((dirname) => collect(path.join("lib", dirname), dirname.slice(1), "services")),
      ...scalarDirs.map((name) => collect(path.join("lib/__scalar", name), name, "scalars")),
    ]);
    const routes = exec.type === "lib" ? [] : await (exec as AppExecutor).getPageKeys();
    const common = {
      name: exec.name,
      type: exec.type,
      repoName: exec.workspace.repoName,
      serveDomain: WorkspaceExecutor.getBaseDevEnv(path.join(exec.workspace.workspaceRoot, ".env")).serveDomain,
      files,
      libDeps,
      pkgDeps,
      dependencies: npmDeps.filter((dep) => !isAkanFrameworkDependency(dep)),
      devDependencies: npmDevDeps.filter((dep) => !isAkanFrameworkDependency(dep)),
      routes,
    };
    //? `exec.type` and the resolved config class are correlated, which the union alone cannot express.
    const scanResult: AppScanResult | LibScanResult =
      akanConfig instanceof AkanAppConfig
        ? ({ ...common, akanConfig } satisfies AppScanResult)
        : ({ ...common, akanConfig } satisfies LibScanResult);
    return scanResult;
  }

  constructor(scanResult: ScanResult) {
    this.name = scanResult.name;
    this.scanResult = scanResult;
    const modulesOf = { databases: this.database, services: this.service, scalars: this.scalar } as {
      [key in "databases" | "services" | "scalars"]: Map<string, Set<DatabaseFileType>>;
    };
    for (const [key, groups] of Object.entries(scanResult.files) as [DatabaseFileType, { [kind: string]: string[] }][])
      for (const kind of ["databases", "services", "scalars"] as const)
        for (const name of groups[kind] ?? []) {
          modulesOf[kind].set(name, (modulesOf[kind].get(name) ?? new Set()).add(key));
          this.file[key].all.add(name);
          this.file[key][kind].add(name);
        }
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

  #sortedLibs: string[] | null = null;
  protected sortedLibs(libDeps: string[]) {
    if (this.#sortedLibs) return this.#sortedLibs;
    const libIndices = LibInfo.getSortedLibIndices();
    this.#sortedLibs = libDeps.sort((libNameA, libNameB) => {
      const indexA = libIndices.get(libNameA);
      const indexB = libIndices.get(libNameB);
      if (indexA === undefined || indexB === undefined)
        throw new Error(`LibInfo not found: ${libNameA} or ${libNameB}`);
      return indexA - indexB;
    });
    return this.#sortedLibs;
  }
  protected sortedLibInfos(libDeps: string[]) {
    return new Map(
      this.sortedLibs(libDeps).map((libName) => {
        const libInfo = LibInfo.libInfos.get(libName);
        if (!libInfo) throw new Error(`LibInfo not found: ${libName}`);
        return [libName, libInfo];
      }),
    );
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

  setRoutes(routes: string[]) {
    (this.scanResult as AppScanResult).routes = routes;
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

  getLibs() {
    return this.sortedLibs(this.libDeps);
  }
  getLibInfos() {
    return this.sortedLibInfos(this.libDeps);
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
    const libInfo = new LibInfo(exec, scanResult as LibScanResult);
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

  getLibs() {
    return this.sortedLibs(this.scanResult.libDeps);
  }
  getLibInfo(libName: string) {
    if (!this.getScanResult().libDeps.includes(libName)) return undefined;
    if (!this.getLibs().includes(libName)) throw new Error(`LibInfo is invalid: ${libName}`);
    return LibInfo.libInfos.get(libName);
  }
  getLibInfos() {
    return this.sortedLibInfos(this.scanResult.libDeps);
  }
}

export class PkgInfo {
  readonly exec: PkgExecutor;
  readonly name: string;
  #scanResult: PkgScanResult;

  static async scanExecutor(exec: PkgExecutor) {
    const [tsconfig, rootPackageJson] = await Promise.all([exec.getTsConfig(), exec.workspace.getPackageJson()]);
    const scanner = await createDependencyScanner(exec);
    const npmSet = new Set(Object.keys({ ...rootPackageJson.dependencies, ...rootPackageJson.devDependencies }));
    const workspacePathOf = (resolve: string) => resolve.replace(/^\.\//, "");
    const pkgPathSet = new Set(
      Object.keys(tsconfig.compilerOptions.paths ?? {})
        .filter((path) =>
          tsconfig.compilerOptions.paths?.[path]?.some((resolve) => workspacePathOf(resolve).startsWith("pkgs/")),
        )
        .map((path) => path.replace("/*", "")),
    );
    const [npmDepSet, pkgPathDepSet] = await scanner.getImportSets([npmSet, pkgPathSet]);
    const pkgDeps = [...pkgPathDepSet]
      .map((path) => {
        const pathSplitLength = path.split("/").length;
        return workspacePathOf(tsconfig.compilerOptions.paths?.[path]?.[0] ?? "*")
          .split("/")
          .slice(1, 1 + pathSplitLength)
          .join("/");
      })
      .filter((pkg) => pkg !== exec.name);
    return { name: exec.name, pkgDeps, dependencies: [...npmDepSet] };
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
    this.#scanResult = scanResult;
  }
  getScanResult() {
    return this.#scanResult;
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
      Promise.all(appNames.map(async (appName) => await AppExecutor.from(exec, appName).scan())),
      Promise.all(libNames.map(async (libName) => await LibExecutor.from(exec, libName).scan())),
      Promise.all(pkgNames.map(async (pkgName) => await PkgExecutor.from(exec, pkgName).scan())),
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
