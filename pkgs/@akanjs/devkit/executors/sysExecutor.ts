import { existsSync } from "node:fs";
import path from "node:path";
import { capitalize, getPageSourceFileViolation } from "akanjs/common";
import { AkanAppConfig, AkanLibConfig } from "../akanConfig";
import {
  renderScopeAgentBlock,
  renderScopeAgentsMd,
  renderScopeClaudeMd,
  scanScopeRecipes,
  upsertAgentBlock,
} from "../guideline/agentsIndex";
import { CodegenLock } from "../workspace/codegenLock";
import { EnvSeed } from "../workspace/envSeed";
import { ManifestDependencies } from "../workspace/manifestDependencies";
import { AppInfo, isAkanFrameworkDependency, LibInfo } from "../workspace/scanInfo";
import type { FileContent } from "../workspace/types";
import { barrelFacetDirs } from "../workspace/workspaceLayout";
import type { AppExecutor } from "./appExecutor";
import { Executor, execEmoji } from "./executor";
import type { LibExecutor } from "./libExecutor";
import { WorkspaceExecutor } from "./workspaceExecutor";

export interface NamedExecutorOptions {
  workspace?: WorkspaceExecutor;
  name: string;
}
interface SysExecutorOptions extends NamedExecutorOptions {
  type: "app" | "lib";
}

export class SysExecutor extends Executor {
  workspace: WorkspaceExecutor;
  override name: string;
  type: "app" | "lib";
  override emoji: string;
  constructor({ workspace = WorkspaceExecutor.fromRoot(), name, type }: SysExecutorOptions) {
    super(name, `${workspace.workspaceRoot}/${type}s/${name}`);
    this.workspace = workspace;
    this.name = name;
    this.type = type;
    this.emoji = execEmoji[type];
  }
  #akanConfig: AkanAppConfig | AkanLibConfig | null = null;
  async getConfig({ refresh }: { refresh?: boolean } = {}) {
    if (this.#akanConfig && !refresh) return this.#akanConfig;
    this.#akanConfig =
      this.type === "app"
        ? await AkanAppConfig.from(this as unknown as AppExecutor)
        : await AkanLibConfig.from(this as unknown as LibExecutor);
    return this.#akanConfig;
  }
  async getModules() {
    const path = this.type === "app" ? `apps/${this.name}/lib` : `libs/${this.name}/lib`;
    return await this.workspace.getDirInModule(path, this.name);
  }
  async getPageConventionViolations(): Promise<{ relativePath: string; reason: string }[]> {
    if (!(await this.exists("page"))) return [];
    const violations: { relativePath: string; reason: string }[] = [];
    for (const entry of await this.getAllFiles("**/*", { cwd: this.getPath("page") })) {
      const relativePath = entry.split(path.sep).join("/");
      const reason = getPageSourceFileViolation(relativePath);
      if (reason) violations.push({ relativePath: `page/${relativePath}`, reason });
    }
    return violations;
  }

  #scanInfo: AppInfo | LibInfo | null = null;
  hasScanInfo() {
    return this.#scanInfo !== null;
  }
  getScanInfo<AllowEmpty extends boolean = false>({
    allowEmpty,
  }: {
    allowEmpty?: AllowEmpty;
  } = {}): AllowEmpty extends true ? AppInfo | LibInfo | null : AppInfo | LibInfo {
    if (!this.hasScanInfo() && !allowEmpty) throw new Error("Scan info is not available");
    return this.#scanInfo as AllowEmpty extends true ? AppInfo | LibInfo | null : AppInfo | LibInfo;
  }
  async #seedEnvFiles(): Promise<FileContent[]> {
    const envDir = path.join(this.cwdPath, "env");
    const missing = await new EnvSeed(envDir).missing();
    if (!missing.length) return [];
    const written = await Promise.all(
      missing.map(({ fileName, content }) =>
        this.writeFile(path.join(envDir, fileName), content, { overwrite: false, silent: true }),
      ),
    );
    this.logger.info(
      `${missing.map(({ fileName }) => `env/${fileName}`).join(", ")} were missing (gitignored, so a clone has none) and now hold local defaults: put this machine's values in them, or fetch the team's with \`akan download-env\`.`,
    );
    return written;
  }
  #getScanTemplateTasks(scanInfo: AppInfo | LibInfo): (Promise<FileContent[]> | null)[] {
    return [
      this.#seedEnvFiles(),
      this._applyTemplate({ basePath: "env", template: "env", scanInfo }),
      this._applyTemplate({ basePath: "lib", template: "lib", scanInfo }),
      this._applyTemplate({ basePath: ".", template: "server.ts", scanInfo }),
      this._applyTemplate({ basePath: ".", template: "client.ts", scanInfo }),
      this.type === "lib" ? this._applyTemplate({ basePath: ".", template: "index.ts", scanInfo }) : null,
      ...barrelFacetDirs.map((facet) =>
        this._applyTemplate({
          basePath: facet,
          template: "facetIndex/index.ts",
          scanInfo,
          options: { exec: this, facet },
        }),
      ),
      ...[
        ...scanInfo.getDatabaseModules().map((model) => [model, `lib/${model}`]),
        ...scanInfo.getServiceModules().map((model) => [model, `lib/_${model}`]),
        ...scanInfo.getScalarModules().map((model) => [model, `lib/__scalar/${model}`]),
      ].map(([model, basePath]) =>
        this._applyTemplate({ basePath, template: "moduleRoot", scanInfo, dict: { model, Model: capitalize(model) } }),
      ),
    ];
  }
  async scan({
    refresh = false,
    write = true,
    writeLib = write,
  }: {
    refresh?: boolean;
    write?: boolean;
    writeLib?: boolean;
  } = {}): Promise<AppInfo | LibInfo> {
    if (this.#scanInfo && !refresh) return this.#scanInfo;
    const scanInfo =
      this.type === "app"
        ? await AppInfo.fromExecutor(this as unknown as AppExecutor, {
            refresh,
          })
        : await LibInfo.fromExecutor(this as unknown as LibExecutor, {
            refresh,
          });
    //* Locked: `writeLib` rewrites dependency-lib barrels that other dev servers regenerate and watch too.
    if (write)
      await CodegenLock.run(this.workspace.workspaceRoot, `scan:${this.name}`, async () => {
        await Promise.all(this.#getScanTemplateTasks(scanInfo));
        await this.writeJson(`akan.${this.type}.json`, scanInfo.getScanResult());
        await this.#updateDependencies(scanInfo);
        if (writeLib) {
          const libInfos = [...scanInfo.getLibInfos().values()];
          await Promise.all(libInfos.flatMap((libInfo) => libInfo.exec.#getScanTemplateTasks(libInfo)));
        }
        await this.syncAgentsIndex(scanInfo);
      });
    this.#scanInfo = scanInfo;
    return scanInfo;
  }
  /** Rewrites only the marker block of the scoped AGENTS.md; content outside the markers belongs to the user. */
  async syncAgentsIndex(scanInfo?: AppInfo | LibInfo) {
    const info = scanInfo ?? (await this.scan({ write: false }));
    const scope = { type: this.type, name: this.name };
    const recipes = await scanScopeRecipes(this.workspace.workspaceRoot, scope, info.getScanResult().libDeps);
    const block = renderScopeAgentBlock(scope, recipes);
    const existing = (await this.exists("AGENTS.md")) ? await this.readFile("AGENTS.md") : null;
    await this.writeFile(
      "AGENTS.md",
      existing?.trim() ? upsertAgentBlock(existing, block) : renderScopeAgentsMd(scope, block),
    );
    // CLAUDE.md 는 얇은 포인터라 최초 1회만 깔아준다 — 사용자가 지우거나 고친 것을 되살리지 않는다.
    if (!(await this.exists("CLAUDE.md"))) await this.writeFile("CLAUDE.md", renderScopeClaudeMd(scope));
  }
  //* The root is the cached copy the dependency scan read, so a name it declares is judged by the same snapshot.
  async #updateDependencies(scanInfo: AppInfo | LibInfo) {
    const [rootPackageJson, packageJson] = await Promise.all([
      this.workspace.getPackageJson(),
      this.getPackageJson({ refresh: true }),
    ]);
    const { dependencies: runtime, devDependencies: typeOnly, akanConfig } = scanInfo.getScanResult();
    const kept = new Set([
      ...ManifestDependencies.keptBy(packageJson),
      ...akanConfig.externalLibs,
      ...akanConfig.trustedDependencies,
    ]);
    //? The scan leaves the framework out of its imports on purpose, so it is never a prune candidate.
    const isKept = (dep: string) => kept.has(dep) || isAkanFrameworkDependency(dep);
    const { dependencies, devDependencies, removed, unverifiable } = new ManifestDependencies(
      rootPackageJson,
      { runtime, typeOnly },
      isKept,
    ).realign(packageJson);
    const manifestPath = `${this.type}s/${this.name}/package.json`;
    if (removed.length)
      this.logger.info(
        `Removed from ${manifestPath}, declared by the root and imported nowhere: ${removed.join(", ")} (list one in akan.keepDependencies to keep it)`,
      );
    if (unverifiable.length)
      this.logger.warn(
        `${manifestPath} lists ${unverifiable.join(", ")}, which the root package.json does not declare, so sync cannot tell whether it is used; kept as is`,
      );
    await this.setPackageJson({ ...packageJson, dependencies, devDependencies });
  }
  override async getLocalFile(targetPath: string) {
    const filePath = path.isAbsolute(targetPath) ? targetPath : `${this.type}s/${this.name}/${targetPath}`;
    const content = await this.workspace.readFile(filePath);
    return { filePath, content };
  }

  async getDatabaseModules() {
    return (await this.readdir("lib"))
      .filter((name) => !name.startsWith("_") && !name.endsWith(".ts"))
      .filter((name) => existsSync(`${this.cwdPath}/lib/${name}/${name}.constant.ts`));
  }

  async getServiceModules() {
    return (await this.readdir("lib"))
      .filter((name) => name.startsWith("_") && !name.startsWith("__"))
      .filter((name) => existsSync(`${this.cwdPath}/lib/${name}/${name.slice(1)}.service.ts`));
  }

  async getScalarModules() {
    return (await this.readdir("lib/__scalar"))
      .filter((name) => !name.startsWith("_"))
      .filter((name) => existsSync(`${this.cwdPath}/lib/__scalar/${name}/${name}.constant.ts`));
  }

  async #getComponentModules(role: "View" | "Unit" | "Template") {
    return (await this.readdir("lib"))
      .filter((name) => !name.startsWith("_") && !name.endsWith(".ts"))
      .filter((name) => existsSync(`${this.cwdPath}/lib/${name}/${capitalize(name)}.${role}.tsx`));
  }
  async #getComponentSources(role: "View" | "Unit" | "Template") {
    const modules = await this.#getComponentModules(role);
    return Promise.all(modules.map((name) => this.getLocalFile(`lib/${name}/${capitalize(name)}.${role}.tsx`)));
  }
  async getViewComponents() {
    return await this.#getComponentModules("View");
  }
  async getUnitComponents() {
    return await this.#getComponentModules("Unit");
  }
  async getTemplateComponents() {
    return await this.#getComponentModules("Template");
  }
  async getViewsSourceCode() {
    return await this.#getComponentSources("View");
  }
  async getUnitsSourceCode() {
    return await this.#getComponentSources("Unit");
  }
  async getTemplatesSourceCode() {
    return await this.#getComponentSources("Template");
  }

  async getScalarConstantFiles() {
    const scalarModules = await this.getScalarModules();
    return Promise.all(
      scalarModules.map((scalarModule) =>
        this.getLocalFile(`lib/__scalar/${scalarModule}/${scalarModule}.constant.ts`),
      ),
    );
  }

  async getScalarDictionaryFiles() {
    const scalarModules = await this.getScalarModules();
    return Promise.all(
      scalarModules.map((scalarModule) =>
        this.getLocalFile(`lib/__scalar/${scalarModule}/${scalarModule}.dictionary.ts`),
      ),
    );
  }

  async getConstantFiles() {
    const modules = await this.getModules();
    return Promise.all(modules.map((module) => this.getLocalFile(`lib/${module}/${module}.constant.ts`)));
  }
  async getConstantFilesWithLibs() {
    const scanInfo =
      this.type === "app"
        ? await AppInfo.fromExecutor(this as unknown as AppExecutor)
        : await LibInfo.fromExecutor(this as unknown as LibExecutor);
    const sysContantFiles = await this.getConstantFiles();
    const sysScalarConstantFiles = await this.getScalarConstantFiles();
    const libDeps = scanInfo.getLibs();
    const libConstantFiles = await Promise.all(
      //? Not LibExecutor.from: libExecutor.ts extends this file's class, so importing it here would load it first.
      libDeps.map(async (lib) => {
        const libSys = new SysExecutor({ workspace: this.workspace, name: lib, type: "lib" });
        return [...(await libSys.getConstantFiles()), ...(await libSys.getScalarConstantFiles())];
      }),
    );
    return [...sysContantFiles, ...sysScalarConstantFiles, ...libConstantFiles.flat()];
  }
  async getDictionaryFiles() {
    const modules = await this.getModules();
    return Promise.all(modules.map((module) => this.getLocalFile(`lib/${module}/${module}.dictionary.ts`)));
  }
  override async applyTemplate(options: {
    basePath: string;
    template: string;
    dict?: { [key: string]: string };
    overwrite?: boolean;
  }): Promise<FileContent[]> {
    const scanInfo = await this.scan();
    const fileContents = await super.applyTemplate({ ...options, scanInfo });
    await this.scan();
    return fileContents;
  }
}
