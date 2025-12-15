import { capitalize, Logger } from "@akanjs/common";
import {
  type AppConfigResult,
  decreaseBuildNum,
  getAppConfig,
  getLibConfig,
  increaseBuildNum,
  type LibConfigResult,
} from "@akanjs/config";
import chalk from "chalk";
import { ChildProcess, exec, type ExecOptions, fork, type ForkOptions, spawn, type SpawnOptions } from "child_process";
import dotenv from "dotenv";
import { ESLint, Linter as ESLintLinter } from "eslint";
import fs from "fs";
import fsPromise from "fs/promises";
import path from "path";

import { getDirname } from "./getDirname";
import { Linter } from "./linter";
import { AppInfo, LibInfo, PkgInfo, WorkspaceInfo } from "./scanInfo";
import { Spinner } from "./spinner";
import { TypeChecker } from "./typeChecker";
import type { FileContent, PackageJson, TsConfigJson } from "./types";

export const execEmoji = {
  workspace: "🏠",
  app: "🚀",
  lib: "🔧",
  pkg: "📦",
  dist: "💿",
  module: "⚙️",
  default: "✈️", // for sys executor
};

export class Executor {
  static verbose = false;
  static setVerbose(verbose: boolean) {
    Executor.verbose = verbose;
  }

  name: string;
  logger: Logger;
  logs: string[];
  cwdPath: string;
  emoji = execEmoji.default;
  typeChecker: TypeChecker | null = null;
  linter: Linter | null = null;
  constructor(name: string, cwdPath: string) {
    this.name = name;
    this.logger = new Logger(name);
    this.logs = [] as string[];
    this.cwdPath = cwdPath;
    if (!fs.existsSync(cwdPath)) fs.mkdirSync(cwdPath, { recursive: true });
  }
  #stdout(data: Buffer) {
    if (Executor.verbose) Logger.raw(chalk.dim(data.toString()));
  }
  #stderr(data: Buffer) {
    Logger.raw(chalk.red(data.toString()));
  }
  exec(command: string, options: ExecOptions = {}) {
    const proc = exec(command, { cwd: this.cwdPath, ...options });
    proc.stdout?.on("data", (data: Buffer) => {
      this.#stdout(data);
    });
    proc.stderr?.on("data", (data: Buffer) => {
      this.#stdout(data); // 정상로그도 stderr로 나옴
    });
    return new Promise((resolve, reject) => {
      proc.on("exit", (code, signal) => {
        if (!!code || signal) reject({ code, signal });
        else resolve({ code, signal });
      });
    });
  }

  spawn(command: string, args: string[] = [], options: SpawnOptions = {}): Promise<string> {
    const proc = spawn(command, args, {
      cwd: this.cwdPath,
      // stdio: "inherit",
      ...options,
    });
    let stdout = "";
    let stderr = "";

    proc.stdout?.on("data", (data: Buffer) => {
      stdout += data.toString();
      this.logs.push(data.toString());
      this.#stdout(data);
    });
    proc.stderr?.on("data", (data: Buffer) => {
      stderr += data.toString();
      this.logs.push(data.toString());
      this.#stdout(data); // 정상로그도 stderr로 나옴
    });
    return new Promise((resolve, reject) => {
      proc.on("exit", (code, signal) => {
        if (code !== 0 || signal) reject(stdout);
        else resolve(stdout);
      });
    });
  }
  spawnSync(command: string, args: string[] = [], options: SpawnOptions = {}): ChildProcess {
    const proc = spawn(command, args, {
      cwd: this.cwdPath,
      // stdio: "inherit",
      ...options,
    });
    return proc;
  }
  fork(modulePath: string, args: string[] = [], options: ForkOptions = {}) {
    const proc = fork(modulePath, args, {
      cwd: this.cwdPath,
      // stdio: ["ignore", "inherit", "inherit", "ipc"],
      ...options,
    });
    proc.stdout?.on("data", (data: Buffer) => {
      this.#stdout(data);
    });
    proc.stderr?.on("data", (data: Buffer) => {
      this.#stderr(data);
    });
    return new Promise((resolve, reject) => {
      proc.on("exit", (code, signal) => {
        if (!!code || signal) reject({ code, signal });
        else resolve({ code, signal });
      });
    });
  }
  getPath(filePath: string) {
    if (path.isAbsolute(filePath)) return filePath;
    const baseParts = this.cwdPath.split("/").filter(Boolean);
    const targetParts = filePath.split("/").filter(Boolean);

    let overlapLength = 0;
    for (let i = 1; i <= Math.min(baseParts.length, targetParts.length); i++) {
      let isOverlap = true;
      for (let j = 0; j < i; j++)
        if (baseParts[baseParts.length - i + j] !== targetParts[j]) {
          isOverlap = false;
          break;
        }
      if (isOverlap) overlapLength = i;
    }
    const result =
      overlapLength > 0
        ? `/${[...baseParts, ...targetParts.slice(overlapLength)].join("/")}`
        : `${this.cwdPath}/${filePath}`;
    return result.replace(/\/+/g, "/");
  }
  mkdir(dirPath: string) {
    const writePath = this.getPath(dirPath);
    if (!fs.existsSync(writePath)) fs.mkdirSync(writePath, { recursive: true });
    this.logger.verbose(`Make directory ${writePath}`);
    return this;
  }
  async readdir(dirPath: string): Promise<string[]> {
    const readPath = this.getPath(dirPath);
    try {
      return await fsPromise.readdir(readPath);
    } catch (error) {
      return [];
    }
  }
  async getFilesAndDirs(dirPath: string): Promise<{ files: string[]; dirs: string[] }> {
    const paths = await this.readdir(dirPath);
    const files: string[] = [];
    const dirs: string[] = [];
    const fullDirPath = this.getPath(dirPath);
    await Promise.all(
      paths.map(async (p) => {
        const stats = await fsPromise.stat(path.join(fullDirPath, p));
        if (stats.isDirectory()) dirs.push(p);
        else files.push(p);
      })
    );
    return { files, dirs };
  }
  exists(filePath: string) {
    const readPath = this.getPath(filePath);
    return fs.existsSync(readPath);
  }
  remove(filePath: string) {
    const readPath = this.getPath(filePath);
    if (fs.existsSync(readPath)) fs.unlinkSync(readPath);
    this.logger.verbose(`Remove file ${readPath}`);
    return this;
  }
  async removeDir(dirPath: string) {
    const readPath = this.getPath(dirPath);
    if (fs.existsSync(readPath)) await fs.promises.rm(readPath, { recursive: true });
    this.logger.verbose(`Remove directory ${readPath}`);
    return this;
  }
  writeFile(
    filePath: string,
    content: string | object,
    { overwrite = true }: { overwrite?: boolean } = {}
  ): FileContent {
    const writePath = this.getPath(filePath);
    const dir = path.dirname(writePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    let contentStr = typeof content === "string" ? content : JSON.stringify(content, null, 2);

    if (fs.existsSync(writePath)) {
      const currentContent = fs.readFileSync(writePath, "utf8");
      if (currentContent === contentStr || !overwrite) {
        this.logger.verbose(`File ${writePath} is unchanged`);
        contentStr = fs.readFileSync(writePath, "utf-8");
      } else {
        fs.writeFileSync(writePath, contentStr, "utf8");
        if (Logger.isVerbose()) this.logger.rawLog(chalk.yellow(`File Update: ${filePath}`));
      }
    } else {
      fs.writeFileSync(writePath, contentStr, "utf8");
      this.logger.rawLog(chalk.green(`File Create: ${filePath}`));
    }
    return { filePath: writePath, content: contentStr };
  }
  writeJson(filePath: string, content: object) {
    this.writeFile(filePath, JSON.stringify(content, null, 2) + "\n");
    return this;
  }
  getLocalFile(targetPath: string) {
    const filePath = path.isAbsolute(targetPath) ? targetPath : targetPath.replace(this.cwdPath, "");
    const content = this.readFile(filePath);
    return { filePath, content };
  }
  readFile(filePath: string) {
    const readPath = this.getPath(filePath);
    return fs.readFileSync(readPath, "utf8");
  }
  readJson(filePath: string) {
    const readPath = this.getPath(filePath);
    return JSON.parse(fs.readFileSync(readPath, "utf8")) as object;
  }
  async cp(srcPath: string, destPath: string) {
    const src = this.getPath(srcPath);
    const dest = this.getPath(destPath);
    if (!fs.existsSync(src)) return;
    const isDirectory = fs.statSync(src).isDirectory();
    if (!fs.existsSync(dest) && isDirectory) await fsPromise.mkdir(dest, { recursive: true });
    await fsPromise.cp(src, dest, { recursive: true });
  }
  log(msg: string) {
    this.logger.info(msg);
    return this;
  }
  verbose(msg: string) {
    this.logger.verbose(msg);
    return this;
  }
  debug(msg: string) {
    this.logger.debug(msg);
    return this;
  }
  spinning(msg: string, { prefix = `${this.emoji}${this.name}`, indent = 0, enableSpin = !Executor.verbose } = {}) {
    return new Spinner(msg, { prefix, indent, enableSpin }).start();
  }

  #tsconfig: TsConfigJson | null = null;
  getTsConfig(pathname = "tsconfig.json", { refresh }: { refresh?: boolean } = {}): TsConfigJson {
    if (this.#tsconfig && !refresh) return this.#tsconfig;
    const tsconfig = this.readJson(pathname) as TsConfigJson;
    if (tsconfig.extends) {
      const extendsTsconfig = this.getTsConfig(tsconfig.extends);
      return {
        ...extendsTsconfig,
        ...tsconfig,
        compilerOptions: { ...extendsTsconfig.compilerOptions, ...tsconfig.compilerOptions },
      } as TsConfigJson;
    }
    this.#tsconfig = tsconfig;
    return tsconfig;
  }
  setTsConfig(tsconfig: TsConfigJson) {
    this.writeJson("tsconfig.json", tsconfig);
    this.#tsconfig = tsconfig;
  }

  #packageJson: PackageJson | null = null;
  getPackageJson({ refresh }: { refresh?: boolean } = {}): PackageJson {
    if (this.#packageJson && !refresh) return this.#packageJson;
    const packageJson = this.readJson("package.json") as PackageJson;
    this.#packageJson = packageJson;
    return packageJson;
  }
  setPackageJson(packageJson: PackageJson) {
    this.writeJson("package.json", packageJson);
    this.#packageJson = packageJson;
  }

  #gitignorePatterns: string[] = [];
  getGitignorePatterns() {
    if (this.#gitignorePatterns.length) return this.#gitignorePatterns;
    const gitignore = this.readFile(".gitignore");
    this.#gitignorePatterns = gitignore
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => !!line && !line.startsWith("#"));
    return this.#gitignorePatterns;
  }

  async #applyTemplateFile(
    {
      templatePath,
      targetPath,
      scanInfo,
      overwrite = true,
    }: {
      templatePath: string;
      targetPath: string;
      scanInfo?: AppInfo | LibInfo | null;
      overwrite?: boolean;
    },
    dict: { [key: string]: string } = {},
    options: { [key: string]: any } = {}
  ): Promise<FileContent | null> {
    if (targetPath.endsWith(".js") || targetPath.endsWith(".jsx")) {
      const getContent = (await import(templatePath)) as {
        default: (
          scanInfo: AppInfo | LibInfo | null,
          dict: { [key: string]: string },
          options?: { [key: string]: any }
        ) => string | null | { filename: string; content: string };
      };
      const result = getContent.default(scanInfo ?? null, dict, options);
      if (result === null) return null;
      const filename = typeof result === "object" ? result.filename : path.basename(targetPath).replace(".js", ".ts");
      const content = typeof result === "object" ? result.content : result;
      const dirname = path.dirname(targetPath);
      const convertedTargetPath = Object.entries(dict).reduce(
        (path, [key, value]) => path.replace(new RegExp(`__${key}__`, "g"), value),
        `${dirname}/${filename}`
      );
      this.logger.verbose(`Apply template ${templatePath} to ${convertedTargetPath}`);
      return this.writeFile(convertedTargetPath, content, { overwrite });
    } else if (targetPath.endsWith(".template")) {
      const content = await fsPromise.readFile(templatePath, "utf8");
      const convertedTargetPath = Object.entries(dict).reduce(
        (path, [key, value]) => path.replace(new RegExp(`__${key}__`, "g"), value),
        targetPath.slice(0, -9)
      );
      const convertedContent = Object.entries(dict).reduce(
        (data, [key, value]) => data.replace(new RegExp(`<%= ${key} %>`, "g"), value),
        content
      );
      this.logger.verbose(`Apply template ${templatePath} to ${convertedTargetPath}`);
      return this.writeFile(convertedTargetPath, convertedContent, { overwrite });
    } else return null;
  }
  async _applyTemplate({
    basePath,
    template,
    scanInfo,
    dict = {},
    options = {},
    overwrite = true,
  }: {
    basePath: string;
    template: string;
    scanInfo?: AppInfo | LibInfo | null;
    dict?: { [key: string]: string };
    options?: { [key: string]: any };
    overwrite?: boolean;
  }): Promise<FileContent[]> {
    const templatePath = `${getDirname(import.meta.url)}/src/templates${template ? `/${template}` : ""}`;

    const prefixTemplatePath = templatePath.endsWith(".tsx") ? templatePath : templatePath.replace(".ts", ".js");

    if (fs.statSync(prefixTemplatePath).isFile()) {
      const filename = path.basename(prefixTemplatePath);
      const fileContent = await this.#applyTemplateFile(
        { templatePath: prefixTemplatePath, targetPath: path.join(basePath, filename), scanInfo, overwrite },
        dict,
        options
      );
      return fileContent ? [fileContent] : ([] as FileContent[]);
    } else {
      const subdirs = await this.readdir(templatePath);
      const fileContents = (
        await Promise.all(
          subdirs.map(async (subdir) => {
            const subpath = path.join(templatePath, subdir);
            if (fs.statSync(subpath).isFile()) {
              const fileContent = await this.#applyTemplateFile(
                { templatePath: subpath, targetPath: path.join(basePath, subdir), scanInfo, overwrite },
                dict,
                options
              );
              return fileContent ? [fileContent] : ([] as FileContent[]);
            } else
              return await this._applyTemplate({
                basePath: path.join(basePath, subdir),
                template: path.join(template, subdir),
                scanInfo,
                dict,
                overwrite,
                options,
              });
          })
        )
      ).flat();
      return fileContents;
    }
  }
  async applyTemplate(options: {
    basePath: string;
    template: string;
    dict?: { [key: string]: string };
    options?: { [key: string]: any };
    overwrite?: boolean;
  }): Promise<FileContent[]> {
    const dict = {
      ...(options.dict ?? {}),
      ...Object.fromEntries(
        Object.entries(options.dict ?? {}).map(([key, value]) => [capitalize(key), capitalize(value)])
      ),
    };
    return this._applyTemplate({ ...options, dict });
  }
  getTypeChecker() {
    this.typeChecker ??= new TypeChecker(this);
    return this.typeChecker;
  }
  typeCheck(filePath: string) {
    const path = this.getPath(filePath);
    const typeChecker = this.getTypeChecker();
    const { fileDiagnostics, fileErrors, fileWarnings } = typeChecker.check(path);
    const message = typeChecker.formatDiagnostics(fileDiagnostics);
    return { fileDiagnostics, fileErrors, fileWarnings, message };
  }
  getLinter() {
    this.linter ??= new Linter(this.cwdPath);
    return this.linter;
  }
  async lint(
    filePath: string,
    { fix = false, dryRun = false }: { fix?: boolean; dryRun?: boolean } = {}
  ): Promise<{
    results: ESLint.LintResult[];
    message: string;
    errors: ESLintLinter.LintMessage[];
    warnings: ESLintLinter.LintMessage[];
  }> {
    const path = this.getPath(filePath);
    const linter = this.getLinter();
    const { results, errors, warnings } = await linter.lint(path, { fix, dryRun });
    const message = linter.formatLintResults(results);
    return { results, message, errors, warnings };
  }
}

interface ExecutorOptions {
  workspaceRoot: string;
  repoName: string;
}
export class WorkspaceExecutor extends Executor {
  workspaceRoot: string;
  repoName: string;
  emoji = execEmoji.workspace;
  constructor({ workspaceRoot, repoName }: ExecutorOptions) {
    super("workspace", workspaceRoot);
    this.workspaceRoot = workspaceRoot;
    this.repoName = repoName;
  }

  static #execs = new Map<string, WorkspaceExecutor>();
  static fromRoot({
    workspaceRoot = process.cwd(),
    repoName = path.basename(process.cwd()),
  }: { workspaceRoot?: string; repoName?: string } = {}) {
    return this.#execs.get(repoName) ?? new WorkspaceExecutor({ workspaceRoot, repoName });
  }
  getBaseDevEnv() {
    const envFile = dotenv.parse(this.readFile(".env"));
    const appName = process.env.NEXT_PUBLIC_APP_NAME ?? envFile.NEXT_PUBLIC_APP_NAME;

    const repoName = process.env.NEXT_PUBLIC_REPO_NAME ?? envFile.NEXT_PUBLIC_REPO_NAME;
    if (!repoName) throw new Error("NEXT_PUBLIC_REPO_NAME is not set");

    const serveDomain = process.env.NEXT_PUBLIC_SERVE_DOMAIN ?? envFile.NEXT_PUBLIC_SERVE_DOMAIN;
    if (!serveDomain) throw new Error("NEXT_PUBLIC_SERVE_DOMAIN is not set");

    const portOffset = parseInt(process.env.PORT_OFFSET ?? (envFile.PORT_OFFSET as string | undefined) ?? "0");

    const env = (process.env.NEXT_PUBLIC_ENV ?? (envFile.NEXT_PUBLIC_ENV as string | undefined) ?? "debug") as
      | "testing"
      | "debug"
      | "develop"
      | "main"
      | "local"
      | undefined;
    if (!env) throw new Error("NEXT_PUBLIC_ENV is not set");
    return { ...(appName ? { name: appName } : {}), repoName, serveDomain, env, portOffset };
  }
  async scan(): Promise<WorkspaceInfo> {
    return await WorkspaceInfo.fromExecutor(this);
  }
  async getApps() {
    if (!fs.existsSync(`${this.workspaceRoot}/apps`)) return [];
    return await this.#getDirHasFile(`${this.workspaceRoot}/apps`, "akan.config.ts");
  }
  async getLibs() {
    if (!fs.existsSync(`${this.workspaceRoot}/libs`)) return [];
    return await this.#getDirHasFile(`${this.workspaceRoot}/libs`, "akan.config.ts");
  }
  async getSyss() {
    const [appNames, libNames] = await Promise.all([this.getApps(), this.getLibs()]);
    return [appNames, libNames] as [string[], string[]];
  }
  async getPkgs() {
    if (!fs.existsSync(`${this.workspaceRoot}/pkgs`)) return [];
    return await this.#getDirHasFile(`${this.workspaceRoot}/pkgs`, "package.json");
  }
  async getExecs() {
    const [appNames, libNames, pkgNames] = await Promise.all([this.getApps(), this.getLibs(), this.getPkgs()]);
    return [appNames, libNames, pkgNames] as [string[], string[], string[]];
  }
  setTsPaths(type: "app" | "lib" | "pkg", name: string) {
    const rootTsConfig = this.readJson("tsconfig.json") as TsConfigJson;
    rootTsConfig.compilerOptions.paths ??= {};
    if (type === "lib" || type === "pkg")
      rootTsConfig.compilerOptions.paths[`@${name}`] = [`${type}s/${name}/index.ts`];
    rootTsConfig.compilerOptions.paths[`@${name}/*`] = [`${type}s/${name}/*`];
    if (rootTsConfig.references) {
      if (!rootTsConfig.references.some((ref) => ref.path === `./${type}s/${name}/tsconfig.json`))
        rootTsConfig.references.push({ path: `./${type}s/${name}/tsconfig.json` });
    }
    this.writeJson("tsconfig.json", rootTsConfig);
    return this;
  }
  unsetTsPaths(type: "app" | "lib" | "pkg", name: string) {
    const rootTsConfig = this.readJson("tsconfig.json") as TsConfigJson;
    const filteredKeys = Object.keys(rootTsConfig.compilerOptions.paths ?? {}).filter(
      (key) => !key.startsWith(`@${name}`)
    );
    rootTsConfig.compilerOptions.paths = Object.fromEntries(
      filteredKeys.map((key) => [key, rootTsConfig.compilerOptions.paths?.[key] ?? []])
    );
    if (rootTsConfig.references) {
      rootTsConfig.references = rootTsConfig.references.filter(
        (ref) => !ref.path.startsWith(`./${type}s/${name}`)
      ) as TsConfigJson["references"];
    }
    this.writeJson("tsconfig.json", rootTsConfig);
    return this;
  }
  async getDirInModule(basePath: string, name: string) {
    const AVOID_DIRS = ["__lib", "__scalar", `_`, `_${name}`];
    const getDirs = async (dirname: string, maxDepth = 3, results: string[] = [], prefix = "") => {
      const dirs = await this.readdir(dirname);
      await Promise.all(
        dirs.map(async (dir) => {
          if (dir.includes("_") || AVOID_DIRS.includes(dir)) return;
          const dirPath = path.join(dirname, dir);
          if (fs.lstatSync(dirPath).isDirectory()) {
            results.push(`${prefix}${dir}`);
            if (maxDepth > 0) await getDirs(dirPath, maxDepth - 1, results, `${prefix}${dir}/`);
          }
        })
      );
      return results;
    };
    return await getDirs(basePath);
  }
  async commit(message: string, { init = false, add = true }: { init?: boolean; add?: boolean } = {}) {
    if (init) await this.exec(`git init --quiet`);
    if (add) await this.exec(`git add .`);
    await this.exec(`git commit --quiet -m "${message}"`);
  }
  async #getDirHasFile(basePath: string, targetFilename: string) {
    const AVOID_DIRS = ["node_modules", "dist", "public", "./next"];
    const getDirs = async (dirname: string, maxDepth = 3, results: string[] = [], prefix = "") => {
      const dirs = await this.readdir(dirname);
      await Promise.all(
        dirs.map(async (dir) => {
          if (AVOID_DIRS.includes(dir)) return;
          const dirPath = path.join(dirname, dir);
          if (fs.lstatSync(dirPath).isDirectory()) {
            const hasTargetFile = fs.existsSync(path.join(dirPath, targetFilename));
            if (hasTargetFile) results.push(`${prefix}${dir}`);
            if (maxDepth > 0) await getDirs(dirPath, maxDepth - 1, results, `${prefix}${dir}/`);
          }
        })
      );
      return results;
    };
    return await getDirs(basePath);
  }

  async getScalarConstantFiles() {
    const [appNames, libNames] = await this.getSyss();
    const scalarConstantExampleFiles = [
      ...(
        await Promise.all(appNames.map((appName) => AppExecutor.from(this, appName).getScalarConstantFiles()))
      ).flat(),
      ...(
        await Promise.all(libNames.map((libName) => LibExecutor.from(this, libName).getScalarConstantFiles()))
      ).flat(),
    ];
    return scalarConstantExampleFiles;
  }
  async getConstantFiles() {
    const [appNames, libNames] = await this.getSyss();
    const moduleConstantExampleFiles = [
      ...(await Promise.all(appNames.map((appName) => AppExecutor.from(this, appName).getConstantFiles()))).flat(),
      ...(await Promise.all(libNames.map((libName) => LibExecutor.from(this, libName).getConstantFiles()))).flat(),
    ];
    return moduleConstantExampleFiles;
  }
  async getDictionaryFiles() {
    const [appNames, libNames] = await this.getSyss();
    const moduleDictionaryExampleFiles = [
      ...(await Promise.all(appNames.map((appName) => AppExecutor.from(this, appName).getDictionaryFiles()))).flat(),
      ...(await Promise.all(libNames.map((libName) => LibExecutor.from(this, libName).getDictionaryFiles()))).flat(),
    ];
    return moduleDictionaryExampleFiles;
  }
  async getViewFiles() {
    const [appNames, libNames] = await this.getSyss();
    const viewExampleFiles = [
      ...(await Promise.all(appNames.map((appName) => AppExecutor.from(this, appName).getViewsSourceCode()))).flat(),
      ...(await Promise.all(libNames.map((libName) => LibExecutor.from(this, libName).getViewsSourceCode()))).flat(),
    ];
    return viewExampleFiles;
  }
}

interface SysExecutorOptions {
  workspace?: WorkspaceExecutor;
  name: string;
  type: "app" | "lib";
}
export class SysExecutor extends Executor {
  workspace: WorkspaceExecutor;
  name: string;
  type: "app" | "lib";
  emoji: string;
  constructor({ workspace = WorkspaceExecutor.fromRoot(), name, type }: SysExecutorOptions) {
    super(name, `${workspace.workspaceRoot}/${type}s/${name}`);
    this.workspace = workspace;
    this.name = name;
    this.type = type;
    this.emoji = execEmoji[type];
  }
  #akanConfig: AppConfigResult | LibConfigResult | null = null;
  async getConfig({ refresh }: { refresh?: boolean } = {}) {
    if (this.#akanConfig && !refresh) return this.#akanConfig;
    const tsconfig = this.getTsConfig();
    this.#akanConfig =
      this.type === "app"
        ? await getAppConfig(
            this.cwdPath,
            { ...this.workspace.getBaseDevEnv(), type: "app", name: this.name },
            tsconfig
          )
        : await getLibConfig(this.cwdPath, { ...this.workspace.getBaseDevEnv(), type: "lib", name: this.name });
    return this.#akanConfig;
  }
  async getModules() {
    const path = this.type === "app" ? `apps/${this.name}/lib` : `libs/${this.name}/lib`;
    return await this.workspace.getDirInModule(path, this.name);
  }

  #scanInfo: AppInfo | LibInfo | null = null;
  async scan({
    refresh,
    write = true,
    writeLib = true,
  }: { refresh?: boolean; write?: boolean; writeLib?: boolean } = {}): Promise<AppInfo | LibInfo> {
    if (this.#scanInfo && !refresh) return this.#scanInfo;
    const scanInfo =
      this.type === "app"
        ? await AppInfo.fromExecutor(this as unknown as AppExecutor, { refresh })
        : await LibInfo.fromExecutor(this as unknown as LibExecutor, { refresh });
    if (write) {
      await Promise.all([
        this._applyTemplate({ basePath: "env", template: "env", scanInfo }),
        this._applyTemplate({ basePath: "lib", template: "lib", scanInfo }),
        this._applyTemplate({ basePath: ".", template: "server.ts", scanInfo }),
        this._applyTemplate({ basePath: ".", template: "client.ts", scanInfo }),
        this.type === "lib" ? this._applyTemplate({ basePath: ".", template: "index.ts", scanInfo }) : null,
        ...scanInfo.getDatabaseModules().map((model) =>
          this._applyTemplate({
            basePath: `lib/${model}`,
            template: "moduleRoot",
            scanInfo,
            dict: { model, Model: capitalize(model) },
          })
        ),
        ...scanInfo.getServiceModules().map((model) =>
          this._applyTemplate({
            basePath: `lib/_${model}`,
            template: "moduleRoot",
            scanInfo,
            dict: { model, Model: capitalize(model) },
          })
        ),
      ]);
      this.writeJson(`akan.${this.type}.json`, scanInfo.getScanResult());
      if (this.type === "lib") this.#updateDependencies(scanInfo);

      if (writeLib) {
        const libInfos = [...scanInfo.getLibInfos().values()];
        await Promise.all(
          libInfos
            .map((libInfo) => [
              libInfo.exec._applyTemplate({ basePath: "env", template: "env", scanInfo: libInfo }),
              libInfo.exec._applyTemplate({ basePath: "lib", template: "lib", scanInfo: libInfo }),
              libInfo.exec._applyTemplate({ basePath: ".", template: "server.ts", scanInfo: libInfo }),
              libInfo.exec._applyTemplate({ basePath: ".", template: "client.ts", scanInfo: libInfo }),
              libInfo.exec._applyTemplate({ basePath: ".", template: "index.ts", scanInfo: libInfo }),
              ...libInfo.getDatabaseModules().map((model) =>
                libInfo.exec._applyTemplate({
                  basePath: `lib/${model}`,
                  template: "moduleRoot",
                  scanInfo: libInfo,
                  dict: { model, Model: capitalize(model) },
                })
              ),
              ...libInfo.getServiceModules().map((model) =>
                libInfo.exec._applyTemplate({
                  basePath: `lib/_${model}`,
                  template: "moduleRoot",
                  scanInfo: libInfo,
                  dict: { model, Model: capitalize(model) },
                })
              ),
            ])
            .flat()
        );
      }
    }
    this.#scanInfo = scanInfo;
    return scanInfo;
  }
  #updateDependencies(scanInfo: AppInfo | LibInfo) {
    const rootPackageJson = this.workspace.getPackageJson();
    const libPackageJson = this.getPackageJson();
    const dependencies = scanInfo.getScanResult().dependencies;
    const libPkgJsonWithDeps: PackageJson = {
      ...libPackageJson,
      dependencies: {
        ...libPackageJson.dependencies,
        ...(Object.fromEntries(
          dependencies
            .filter((dep) => rootPackageJson.dependencies?.[dep])
            .sort()
            .map((dep) => [dep, rootPackageJson.dependencies?.[dep]])
        ) as Record<string, string>),
      },
      devDependencies: {
        ...libPackageJson.devDependencies,
        ...(Object.fromEntries(
          dependencies
            .filter((dep) => rootPackageJson.devDependencies?.[dep])
            .sort()
            .map((dep) => [dep, rootPackageJson.devDependencies?.[dep]])
        ) as Record<string, string>),
      },
    };
    this.setPackageJson(libPkgJsonWithDeps);
  }
  getLocalFile(targetPath: string) {
    const filePath = path.isAbsolute(targetPath) ? targetPath : `${this.type}s/${this.name}/${targetPath}`;
    const content = this.workspace.readFile(filePath);
    return { filePath, content };
  }

  async getDatabaseModules() {
    const databaseModules = (await this.readdir("lib"))
      .filter((name) => !name.startsWith("_") && !name.startsWith("__") && !name.endsWith(".ts"))
      .filter((name) => fs.existsSync(`${this.cwdPath}/lib/${name}/${name}.constant.ts`));
    return databaseModules;
  }

  async getServiceModules() {
    const serviceModules = (await this.readdir("lib"))
      .filter((name) => name.startsWith("_") && !name.startsWith("__"))
      .filter((name) => fs.existsSync(`${this.cwdPath}/lib/${name}/${name}.service.ts`));
    return serviceModules;
  }

  async getScalarModules() {
    const scalarModules = (await this.readdir("lib/__scalar"))
      .filter((name) => !name.startsWith("_"))
      .filter((name) => fs.existsSync(`${this.cwdPath}/lib/__scalar/${name}/${name}.constant.ts`));
    return scalarModules;
  }

  async getViewComponents() {
    const viewComponents = (await this.readdir("lib"))
      .filter((name) => !name.startsWith("_") && !name.startsWith("__") && !name.endsWith(".ts"))
      .filter((name) => fs.existsSync(`${this.cwdPath}/lib/${name}/${name}.View.tsx`));
    return viewComponents;
  }

  async getUnitComponents() {
    const unitComponents = (await this.readdir("lib"))
      .filter((name) => !name.startsWith("_") && !name.startsWith("__") && !name.endsWith(".ts"))
      .filter((name) => fs.existsSync(`${this.cwdPath}/lib/${name}/${name}.Unit.tsx`));
    return unitComponents;
  }
  async getTemplateComponents() {
    const templateComponents = (await this.readdir("lib"))
      .filter((name) => !name.startsWith("_") && !name.startsWith("__") && !name.endsWith(".ts"))
      .filter((name) => fs.existsSync(`${this.cwdPath}/lib/${name}/${name}.Template.tsx`));
    return templateComponents;
  }

  async getViewsSourceCode() {
    const viewComponents = await this.getViewComponents();
    return viewComponents.map((viewComponent) => this.getLocalFile(`lib/${viewComponent}/${viewComponent}.View.tsx`));
  }
  async getUnitsSourceCode() {
    const unitComponents = await this.getUnitComponents();
    return unitComponents.map((unitComponent) => this.getLocalFile(`lib/${unitComponent}/${unitComponent}.Unit.tsx`));
  }
  async getTemplatesSourceCode() {
    const templateComponents = await this.getTemplateComponents();
    return templateComponents.map((templateComponent) =>
      this.getLocalFile(`lib/${templateComponent}/${templateComponent}.Template.tsx`)
    );
  }

  async getScalarConstantFiles() {
    const scalarModules = await this.getScalarModules();
    return scalarModules.map((scalarModule) =>
      this.getLocalFile(`lib/__scalar/${scalarModule}/${scalarModule}.constant.ts`)
    );
  }

  async getScalarDictionaryFiles() {
    const scalarModules = await this.getScalarModules();
    return scalarModules.map((scalarModule) => this.getLocalFile(`lib/${scalarModule}/${scalarModule}.dictionary.ts`));
  }

  async getConstantFiles() {
    const modules = await this.getModules();
    return modules.map((module) => this.getLocalFile(`lib/${module}/${module}.constant.ts`));
  }
  async getConstantFilesWithLibs() {
    const scanInfo =
      this.type === "app"
        ? await AppInfo.fromExecutor(this as unknown as AppExecutor)
        : await LibInfo.fromExecutor(this as unknown as LibExecutor);
    const sysContantFiles = await this.getConstantFiles();
    const sysScalarConstantFiles = await this.getScalarConstantFiles();
    const libConstantFiles = await Promise.all(
      scanInfo
        .getLibs()
        .map(async (lib) => [
          ...(await LibExecutor.from(this, lib).getConstantFiles()),
          ...(await LibExecutor.from(this, lib).getScalarConstantFiles()),
        ])
    );
    return [...sysContantFiles, ...sysScalarConstantFiles, ...libConstantFiles.flat()];
  }
  async getDictionaryFiles() {
    const modules = await this.getModules();
    return modules.map((module) => this.getLocalFile(`lib/${module}/${module}.dictionary.ts`));
  }
  async applyTemplate(options: {
    basePath: string;
    template: string;
    dict?: { [key: string]: string };
    overwrite?: boolean;
  }): Promise<FileContent[]> {
    const dict = {
      ...(options.dict ?? {}),
      ...Object.fromEntries(
        Object.entries(options.dict ?? {}).map(([key, value]) => [capitalize(key), capitalize(value)])
      ),
    };
    const akanConfig = await this.getConfig();
    const scanInfo = await this.scan();
    const fileContents = await this._applyTemplate({ ...options, scanInfo, dict });
    await this.scan();
    return fileContents;
  }
  setTsPaths() {
    this.workspace.setTsPaths(this.type, this.name);
    return this;
  }
}

interface AppExecutorOptions {
  workspace?: WorkspaceExecutor;
  name: string;
}
export class AppExecutor extends SysExecutor {
  dist: Executor;
  emoji = execEmoji.app;
  constructor({ workspace, name }: AppExecutorOptions) {
    super({ workspace, name, type: "app" });
    this.dist = new Executor(`dist/${name}`, `${this.workspace.workspaceRoot}/dist/apps/${name}`);
  }
  static #execs = new Map<string, AppExecutor>();
  static from(executor: SysExecutor | WorkspaceExecutor, name: string) {
    const exec = this.#execs.get(name);
    if (exec) return exec;
    else if (executor instanceof WorkspaceExecutor) return new AppExecutor({ workspace: executor, name });
    else return new AppExecutor({ workspace: executor.workspace, name });
  }
  getEnv() {
    return this.workspace.getBaseDevEnv().env;
  }
  #akanConfig: AppConfigResult | null = null;
  async getConfig({ refresh }: { refresh?: boolean } = {}) {
    if (this.#akanConfig && !refresh) return this.#akanConfig;
    this.#akanConfig = await getAppConfig(
      this.cwdPath,
      { ...this.workspace.getBaseDevEnv(), type: "app", name: this.name },
      this.getTsConfig()
    );
    return this.#akanConfig;
  }
  async syncAssets(libDeps: string[]) {
    const projectPublicPath = `${this.cwdPath}/public`;
    const projectAssetsPath = `${this.cwdPath}/assets`;
    const projectPublicLibPath = `${projectPublicPath}/libs`;
    const projectAssetsLibPath = `${projectAssetsPath}/libs`;
    await Promise.all([this.removeDir(projectPublicLibPath), this.removeDir(projectAssetsLibPath)]);
    const targetPublicDeps = libDeps.filter((dep) => this.exists(`${this.workspace.workspaceRoot}/libs/${dep}/public`));
    const targetAssetsDeps = libDeps.filter((dep) => this.exists(`${this.workspace.workspaceRoot}/libs/${dep}/assets`));

    targetPublicDeps.forEach((dep) => this.mkdir(`${projectPublicLibPath}/${dep}`));
    targetAssetsDeps.forEach((dep) => this.mkdir(`${projectAssetsLibPath}/${dep}`));
    await Promise.all([
      ...targetPublicDeps.map((dep) =>
        this.cp(`${this.workspace.workspaceRoot}/libs/${dep}/public`, `${projectPublicLibPath}/${dep}`)
      ),
      ...targetAssetsDeps.map((dep) =>
        this.cp(`${this.workspace.workspaceRoot}/libs/${dep}/assets`, `${projectAssetsLibPath}/${dep}`)
      ),
    ]);
  }
  async increaseBuildNum() {
    await increaseBuildNum(
      this.cwdPath,
      { ...this.workspace.getBaseDevEnv(), type: "app", name: this.name },
      this.getTsConfig()
    );
  }
  async decreaseBuildNum() {
    await decreaseBuildNum(
      this.cwdPath,
      { ...this.workspace.getBaseDevEnv(), type: "app", name: this.name },
      this.getTsConfig()
    );
  }
}
interface LibExecutorOptions {
  workspace?: WorkspaceExecutor;
  name: string;
}
export class LibExecutor extends SysExecutor {
  dist: Executor;
  emoji = execEmoji.lib;
  constructor({ workspace, name }: LibExecutorOptions) {
    super({ workspace, name, type: "lib" });
    this.dist = new Executor(`dist/${name}`, `${this.workspace.workspaceRoot}/dist/libs/${name}`);
  }
  static #execs = new Map<string, LibExecutor>();
  static from(executor: SysExecutor | WorkspaceExecutor, name: string) {
    const exec = this.#execs.get(name);
    if (exec) return exec;
    else if (executor instanceof WorkspaceExecutor) return new LibExecutor({ workspace: executor, name });
    else return new LibExecutor({ workspace: executor.workspace, name });
  }

  #akanConfig: LibConfigResult | null = null;
  async getConfig({ refresh }: { refresh?: boolean } = {}) {
    if (this.#akanConfig && !refresh) return this.#akanConfig;
    this.#akanConfig = await getLibConfig(this.cwdPath, {
      ...this.workspace.getBaseDevEnv(),
      type: "lib",
      name: this.name,
    });
    return this.#akanConfig;
  }
}

interface PkgExecutorOptions {
  workspace?: WorkspaceExecutor;
  name: string;
}
export class PkgExecutor extends Executor {
  workspace: WorkspaceExecutor;
  name: string;
  dist: Executor;
  emoji = execEmoji.pkg;
  constructor({ workspace = WorkspaceExecutor.fromRoot(), name }: PkgExecutorOptions) {
    super(name, `${workspace.workspaceRoot}/pkgs/${name}`);
    this.workspace = workspace;
    this.name = name;
    this.dist = new Executor(`dist/${name}`, `${this.workspace.workspaceRoot}/dist/pkgs/${name}`);
  }
  static from(executor: SysExecutor | WorkspaceExecutor, name: string) {
    if (executor instanceof WorkspaceExecutor) return new PkgExecutor({ workspace: executor, name });
    return new PkgExecutor({ workspace: executor.workspace, name });
  }

  #scanInfo: PkgInfo | null = null;
  async scan({ refresh }: { refresh?: boolean } = {}): Promise<PkgInfo> {
    if (this.#scanInfo && !refresh) return this.#scanInfo;
    const scanInfo = await PkgInfo.fromExecutor(this, { refresh });
    // this.writeJson("akan.pkg.json", pkgScanResult);
    this.#scanInfo = scanInfo;
    return scanInfo;
  }
}

interface ModuleExecutorOptions {
  sys: SysExecutor;
  name: string;
}
export class ModuleExecutor extends Executor {
  sys: SysExecutor;
  emoji = execEmoji.module;
  constructor({ sys, name }: ModuleExecutorOptions) {
    super(name, `${sys.workspace.workspaceRoot}/${sys.type}s/${sys.name}/lib/${name}`);
    this.sys = sys;
  }
  static from(sysExecutor: SysExecutor, name: string) {
    return new ModuleExecutor({ sys: sysExecutor, name });
  }
}
