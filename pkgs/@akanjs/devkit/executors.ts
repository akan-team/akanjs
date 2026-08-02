import {
  type ChildProcess,
  type ExecOptions,
  exec,
  type ForkOptions,
  fork,
  type SpawnOptions,
  spawn,
} from "node:child_process";
import { readFileSync } from "node:fs";
import {
  copyFile,
  cp as cpEntry,
  mkdir,
  readdir as readDirEntries,
  realpath,
  rm,
  stat,
  symlink,
} from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { AkanPlugin, AkanSyncContext, PluginRuntimeContext } from "akanjs";
import {
  capitalize,
  isRouteSourceFile,
  Logger,
  parseRouteModuleKey,
  validatePageSourceFile,
  validateSubRoutePageKey,
} from "akanjs/common";
import { $ } from "bun";
import chalk from "chalk";
import { AkanAppConfig, AkanLibConfig, decreaseBuildNum, increaseBuildNum } from "./akanConfig";
import { FileSys } from "./fileSys";
import { getDirname } from "./getDirname";
import { Linter } from "./linter";
import { AppInfo, LibInfo, PkgInfo, WorkspaceInfo } from "./scanInfo";
import { Spinner } from "./spinner";
// Type-only: the implementation is loaded on demand in `getTypeChecker` to keep `typescript` out of
// the resident module graph.
import type { TypeChecker } from "./typeChecker";
import type { FileContent, PackageJson, TsConfigJson } from "./types";

export interface PageRoot {
  /** App-relative location of the route files, i.e. the symlink for a synced lib. */
  dir: string;
  /** Where the files actually live, which is what a file watcher reports. */
  realDir: string;
  /** Prefix that turns a `dir`-relative path into an app page key (empty for the app's own `page`). */
  keyPrefix: string;
}

const staticTemplateFileExtensions = new Set([
  ".avif",
  ".bmp",
  ".cjs",
  ".css",
  ".eot",
  ".gif",
  ".html",
  ".ico",
  ".jpeg",
  ".jpg",
  ".js",
  ".json",
  ".map",
  ".md",
  ".mjs",
  ".mp3",
  ".mp4",
  ".ogg",
  ".otf",
  ".pdf",
  ".png",
  ".svg",
  ".ttf",
  ".txt",
  ".wasm",
  ".wav",
  ".webm",
  ".webp",
  ".woff",
  ".woff2",
  ".xml",
]);

const formatCommandArg = (value: string) => (/^[\w@%+=:,./-]+$/.test(value) ? value : JSON.stringify(value));

const formatCommandForDisplay = (command: string, args: string[] = []) =>
  [command, ...args].map(formatCommandArg).join(" ");

export interface CommandExecutionErrorOptions {
  command: string;
  args?: string[];
  cwd: string;
  code: number | null;
  signal: string | null;
  stdout?: string;
  stderr?: string;
  cause?: unknown;
}

export class CommandExecutionError extends Error {
  command: string;
  args: string[];
  cwd: string;
  code: number | null;
  signal: string | null;
  stdout: string;
  stderr: string;

  constructor({
    command,
    args = [],
    cwd,
    code,
    signal,
    stdout = "",
    stderr = "",
    cause,
  }: CommandExecutionErrorOptions) {
    const displayCommand = formatCommandForDisplay(command, args);
    const status = signal ? `signal: ${signal}` : `exit code: ${code ?? "unknown"}`;
    const output = (stderr || stdout).trim();
    super([`Command failed: ${displayCommand}`, `cwd: ${cwd}`, status, output ? `\n${output}` : ""].join("\n"), {
      cause,
    });
    this.name = "CommandExecutionError";
    this.command = command;
    this.args = args;
    this.cwd = cwd;
    this.code = code;
    this.signal = signal;
    this.stdout = stdout;
    this.stderr = stderr;
  }
}

export const execEmoji = {
  workspace: "🏠",
  app: "🚀",
  lib: "🔧",
  pkg: "📦",
  dist: "💿",
  module: "⚙️",
  default: "✈️", // for sys executor
};

const parseEnvFile = (envPath: string): Record<string, string> => {
  const env: Record<string, string> = {};
  const content = (() => {
    try {
      return readFileSync(envPath, "utf8");
    } catch {
      return "";
    }
  })();
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const normalized = trimmed.startsWith("export ") ? trimmed.slice("export ".length).trim() : trimmed;
    const separatorIndex = normalized.indexOf("=");
    if (separatorIndex <= 0) continue;
    const key = normalized.slice(0, separatorIndex).trim();
    let value = normalized.slice(separatorIndex + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
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
  }
  #stdout(data: Buffer) {
    if (Executor.verbose) Logger.raw(chalk.dim(data.toString()));
  }
  #stderr(data: Buffer) {
    Logger.raw(chalk.red(data.toString()));
  }
  exec(command: string, options: ExecOptions = {}) {
    const cwd = options.cwd?.toString() ?? this.cwdPath;
    const proc = exec(command, { cwd: this.cwdPath, ...options });
    let stdout = "";
    let stderr = "";
    proc.stdout?.on("data", (data: Buffer) => {
      stdout += data.toString();
      this.#stdout(data);
    });
    proc.stderr?.on("data", (data: Buffer) => {
      stderr += data.toString();
      this.#stdout(data); // 정상로그도 stderr로 나옴
    });
    return new Promise((resolve, reject) => {
      proc.on("error", (error) => {
        reject(
          new CommandExecutionError({
            command,
            cwd,
            code: null,
            signal: null,
            stdout,
            stderr,
            cause: error,
          }),
        );
      });
      proc.on("exit", (code, signal) => {
        if (!!code || signal)
          reject(
            new CommandExecutionError({
              command,
              cwd,
              code,
              signal,
              stdout,
              stderr,
            }),
          );
        else resolve({ code, signal });
      });
    });
  }

  spawn(command: string, args: string[] = [], options: SpawnOptions = {}): Promise<string> {
    const cwd = options.cwd?.toString() ?? this.cwdPath;
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
      proc.on("error", (error) => {
        reject(
          new CommandExecutionError({
            command,
            args,
            cwd,
            code: null,
            signal: null,
            stdout,
            stderr,
            cause: error,
          }),
        );
      });
      proc.on("close", (code, signal) => {
        if (code !== 0 || signal)
          reject(
            new CommandExecutionError({
              command,
              args,
              cwd,
              code,
              signal,
              stdout,
              stderr,
            }),
          );
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
    const cwd = options.cwd?.toString() ?? this.cwdPath;
    const proc = fork(modulePath, args, {
      cwd: this.cwdPath,
      // stdio: ["ignore", "inherit", "inherit", "ipc"],
      ...options,
    });
    let stdout = "";
    let stderr = "";
    proc.stdout?.on("data", (data: Buffer) => {
      stdout += data.toString();
      this.#stdout(data);
    });
    proc.stderr?.on("data", (data: Buffer) => {
      stderr += data.toString();
      this.#stderr(data);
    });
    return new Promise((resolve, reject) => {
      proc.on("error", (error) => {
        reject(
          new CommandExecutionError({
            command: modulePath,
            args,
            cwd,
            code: null,
            signal: null,
            stdout,
            stderr,
            cause: error,
          }),
        );
      });
      proc.on("exit", (code, signal) => {
        if (!!code || signal)
          reject(
            new CommandExecutionError({
              command: modulePath,
              args,
              cwd,
              code,
              signal,
              stdout,
              stderr,
            }),
          );
        else resolve({ code, signal });
      });
    });
  }
  getPath(filePath: string) {
    if (path.isAbsolute(filePath)) return filePath;
    if (filePath.startsWith(".")) return path.join(this.cwdPath, filePath);
    const baseParts = this.cwdPath.split(/[\\/]/).filter(Boolean);
    const targetParts = filePath.split(/[\\/]/).filter(Boolean);

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
    return path.join(this.cwdPath, ...targetParts.slice(overlapLength));
  }
  async mkdir(dirPath: string) {
    const writePath = this.getPath(dirPath);
    if (!(await FileSys.dirExists(writePath))) await mkdir(writePath, { recursive: true });
    this.logger.verbose(`Make directory ${writePath}`);
    return this;
  }
  async readdir(dirPath: string): Promise<string[]> {
    const readPath = this.getPath(dirPath);
    try {
      const glob = new Bun.Glob("*");
      return Array.from(glob.scanSync({ cwd: readPath, onlyFiles: false }));
    } catch {
      return [];
    }
  }
  async getAllFiles(pattern = "**/*", { cwd }: { cwd?: string } = {}): Promise<string[]> {
    const glob = new Bun.Glob(pattern);
    return Array.from(glob.scanSync({ cwd: cwd ?? this.cwdPath, onlyFiles: true }));
  }
  async getFilesAndDirs(dirPath: string): Promise<{ files: string[]; dirs: string[] }> {
    const fullDirPath = this.getPath(dirPath);
    const fileGlob = new Bun.Glob("*");
    const files = Array.from(fileGlob.scanSync({ cwd: fullDirPath, onlyFiles: true }));
    const dirGlob = new Bun.Glob("*");
    const allEntries = Array.from(dirGlob.scanSync({ cwd: fullDirPath, onlyFiles: false }));
    const dirs = allEntries.filter((entry) => !files.includes(entry));
    return { files, dirs };
  }
  async exists(filePath: string) {
    const readPath = this.getPath(filePath);
    return await FileSys.exists(readPath);
  }
  async remove(filePath: string) {
    const readPath = this.getPath(filePath);
    if (await FileSys.fileExists(readPath)) await FileSys.delete(readPath);
    this.logger.verbose(`Remove file ${readPath}`);
    return this;
  }
  async removeDir(dirPath: string) {
    //* XXX: `path.join(…, ".")` drops a trailing separator — `rm -rf link/` resolves through a symlink
    //* and wipes its target, while `rm -rf link` only unlinks it.
    const readPath = path.join(this.getPath(dirPath), ".");
    if (await FileSys.entryExists(readPath)) await rm(readPath, { recursive: true, force: true });
    this.logger.verbose(`Remove directory ${readPath}`);
    return this;
  }
  async writeFile(
    filePath: string,
    content: string | object,
    { overwrite = true, silent = false }: { overwrite?: boolean; silent?: boolean } = {},
  ): Promise<FileContent> {
    const writePath = this.getPath(filePath);
    const dir = path.dirname(writePath);
    if (!(await FileSys.dirExists(dir))) await mkdir(dir, { recursive: true });
    let contentStr = typeof content === "string" ? content : JSON.stringify(content, null, 2);

    if (await FileSys.fileExists(writePath)) {
      const currentContent = await FileSys.readText(writePath);
      if (currentContent === contentStr || !overwrite) {
        this.logger.verbose(`File ${writePath} is unchanged`);
        contentStr = currentContent;
      } else {
        await FileSys.writeText(writePath, contentStr);
        if (Logger.isVerbose()) this.logger.rawLog(chalk.yellow(`File Update: ${filePath}`));
      }
    } else {
      await FileSys.writeText(writePath, contentStr);
      if (!silent) this.logger.rawLog(chalk.green(`File Create: ${filePath}`));
    }
    return { filePath: writePath, content: contentStr };
  }
  async writeJson(filePath: string, content: object) {
    await this.writeFile(filePath, content);
  }
  async getLocalFile(targetPath: string) {
    const filePath = path.isAbsolute(targetPath) ? targetPath : targetPath.replace(this.cwdPath, "");
    const content = await this.readFile(filePath);
    return { filePath, content };
  }
  async readFile(filePath: string) {
    const readPath = this.getPath(filePath);
    return await FileSys.readText(readPath);
  }
  async readJson(filePath: string) {
    const readPath = this.getPath(filePath);
    return await FileSys.readJson<object>(readPath);
  }
  async cp(srcPath: string, destPath: string, { dereference = false }: { dereference?: boolean } = {}) {
    const src = this.getPath(srcPath);
    const dest = this.getPath(destPath);
    if (!(await FileSys.exists(src))) return;
    const isDirectory = (await stat(src)).isDirectory();
    if (!(await FileSys.exists(dest)) && isDirectory) await mkdir(dest, { recursive: true });
    //* `cp -r` keeps symlinks on GNU coreutils but follows them on macOS, so anything that must land as
    //* real files regardless of platform has to say so explicitly.
    if (dereference) await cpEntry(src, dest, { recursive: isDirectory, dereference: true, force: true });
    else await $`cp -r ${src}${isDirectory ? "/." : ""} ${dest}`;
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
  async getTsConfig(pathname = "tsconfig.json", { refresh }: { refresh?: boolean } = {}): Promise<TsConfigJson> {
    if (this.#tsconfig && !refresh) return this.#tsconfig;
    const tsconfig = (await this.readJson(pathname)) as TsConfigJson;
    if (tsconfig.extends) {
      const extendsTsconfig = await this.getTsConfig(tsconfig.extends);
      const result = {
        ...extendsTsconfig,
        ...tsconfig,
        compilerOptions: {
          ...extendsTsconfig.compilerOptions,
          ...tsconfig.compilerOptions,
        },
      } as TsConfigJson;
      this.#tsconfig = result;
      return result;
    }
    this.#tsconfig = tsconfig;
    return tsconfig;
  }
  async setTsConfig(tsconfig: TsConfigJson) {
    await this.writeJson("tsconfig.json", tsconfig);
    this.#tsconfig = tsconfig;
  }

  #packageJson: PackageJson | null = null;
  async getPackageJson({ refresh }: { refresh?: boolean } = {}): Promise<PackageJson> {
    if (this.#packageJson && !refresh) return this.#packageJson;
    const packageJson = (await this.readJson("package.json")) as PackageJson;
    this.#packageJson = packageJson;
    return packageJson;
  }
  async setPackageJson(packageJson: PackageJson) {
    await this.writeJson("package.json", packageJson);
    this.#packageJson = packageJson;
  }

  #gitignorePatterns: string[] = [];
  async getGitignorePatterns(): Promise<string[]> {
    if (this.#gitignorePatterns.length) return this.#gitignorePatterns;
    const gitignore = await this.readFile(".gitignore");
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
    options: { [key: string]: unknown } = {},
  ): Promise<FileContent | null> {
    if (targetPath.endsWith(".ts") || targetPath.endsWith(".tsx")) {
      const getContent = (await import(templatePath)) as {
        default: (
          scanInfo: AppInfo | LibInfo | null,
          dict: { [key: string]: string },
          options?: { [key: string]: unknown },
        ) => Promise<string | null | { filename: string; content: string }>;
      };
      const result = await getContent.default(scanInfo ?? null, dict, options);
      if (result === null) return null;
      const filename = typeof result === "object" ? result.filename : path.basename(targetPath).replace(".js", ".ts");
      const content = typeof result === "object" ? result.content : result;
      const dirname = path.dirname(targetPath);
      const convertedTargetPath = Object.entries(dict).reduce(
        (path, [key, value]) => path.replace(new RegExp(`__${key}__`, "g"), value),
        `${dirname}/${filename}`,
      );
      this.logger.verbose(`Apply template ${templatePath} to ${convertedTargetPath}`);
      return this.writeFile(convertedTargetPath, content, { overwrite });
    } else if (targetPath.endsWith(".template")) {
      const content = await FileSys.readText(templatePath);
      const convertedTargetPath = Object.entries(dict).reduce(
        (path, [key, value]) => path.replace(new RegExp(`__${key}__`, "g"), value),
        targetPath.slice(0, -9),
      );
      const convertedContent = Object.entries(dict).reduce(
        (data, [key, value]) => data.replace(new RegExp(`<%= ${key} %>`, "g"), value),
        content,
      );
      this.logger.verbose(`Apply template ${templatePath} to ${convertedTargetPath}`);
      return this.writeFile(convertedTargetPath, convertedContent, {
        overwrite,
      });
    } else if (staticTemplateFileExtensions.has(path.extname(targetPath).toLowerCase())) {
      const convertedTargetPath = Object.entries(dict).reduce(
        (path, [key, value]) => path.replace(new RegExp(`__${key}__`, "g"), value),
        targetPath,
      );
      const writePath = this.getPath(convertedTargetPath);
      const dirname = path.dirname(writePath);
      if (!(await FileSys.dirExists(dirname))) await mkdir(dirname, { recursive: true });
      await copyFile(templatePath, writePath);
      this.logger.verbose(`Apply template ${templatePath} to ${convertedTargetPath}`);
      return { filePath: writePath, content: "" };
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
    options?: { [key: string]: unknown };
    overwrite?: boolean;
  }): Promise<FileContent[]> {
    const templateRoot = await this.#resolveTemplateRoot();
    const templatePath = `${templateRoot}${template ? `/${template}` : ""}`;
    const prefixTemplatePath = templatePath; // templatePath.endsWith(".tsx") ? templatePath : templatePath.replace(".ts", ".js");
    if ((await stat(prefixTemplatePath)).isFile()) {
      const filename = path.basename(prefixTemplatePath);
      const fileContent = await this.#applyTemplateFile(
        {
          templatePath: prefixTemplatePath,
          targetPath: path.join(basePath, filename),
          scanInfo,
          overwrite,
        },
        dict,
        options,
      );
      return fileContent ? [fileContent] : ([] as FileContent[]);
    } else {
      const subdirs = await readDirEntries(templatePath);
      const fileContents = (
        await Promise.all(
          subdirs.map(async (subdir) => {
            const subpath = path.join(templatePath, subdir);
            if ((await stat(subpath)).isFile()) {
              const fileContent = await this.#applyTemplateFile(
                {
                  templatePath: subpath,
                  targetPath: path.join(basePath, subdir),
                  scanInfo,
                  overwrite,
                },
                dict,
                options,
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
          }),
        )
      ).flat();
      return fileContents;
    }
  }
  async #resolveTemplateRoot() {
    const candidates = [
      path.resolve(getDirname(import.meta.url), "templates"),
      path.resolve(getDirname(import.meta.url), "../cli/templates"),
    ];
    for (const candidate of candidates) {
      if (await FileSys.dirExists(candidate)) return candidate;
    }
    return candidates[0];
  }
  async applyTemplate(options: {
    basePath: string;
    template: string;
    dict?: { [key: string]: string };
    options?: { [key: string]: unknown };
    overwrite?: boolean;
  }): Promise<FileContent[]> {
    const dict = {
      ...(options.dict ?? {}),
      ...Object.fromEntries(
        Object.entries(options.dict ?? {}).map(([key, value]) => [capitalize(key), capitalize(value)]),
      ),
    };
    return this._applyTemplate({ ...options, dict });
  }
  // Async so `typescript` (~65MB resident) is loaded only by the commands that actually typecheck,
  // not by every process that imports an executor. `typeCheckAsync` below runs in a subprocess and
  // never touches this path.
  async getTypeChecker() {
    const { TypeChecker } = await import("./typeChecker");
    this.typeChecker ??= new TypeChecker(this);
    return this.typeChecker;
  }
  async typeCheck(filePath: string) {
    const path = this.getPath(filePath);
    const typeChecker = await this.getTypeChecker();
    const { fileDiagnostics, fileErrors, fileWarnings } = typeChecker.check(path);
    const message = typeChecker.formatDiagnostics(fileDiagnostics);
    return { fileDiagnostics, fileErrors, fileWarnings, message };
  }
  async typeCheckAsync(filePath: string) {
    const path = this.getPath(filePath);
    const entry = await this.#resolveTypecheckWorkerEntry();
    const proc = Bun.spawn([process.execPath, entry], {
      cwd: this.cwdPath,
      env: {
        ...process.env,
        AKAN_TYPECHECK_CWD: this.cwdPath,
        AKAN_TYPECHECK_FILE: path,
      },
      stdout: "pipe",
      stderr: "pipe",
    });
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);
    if (exitCode !== 0) throw new Error((stderr || stdout).trim() || `Typecheck failed with exit code ${exitCode}`);

    const result = JSON.parse(stdout) as {
      fileDiagnosticsCount: number;
      fileErrorsCount: number;
      fileWarningsCount: number;
      message: string;
    };
    return {
      fileDiagnostics: Array.from({ length: result.fileDiagnosticsCount }),
      fileErrors: Array.from({ length: result.fileErrorsCount }),
      fileWarnings: Array.from({ length: result.fileWarningsCount }),
      message: result.message,
    };
  }
  async #resolveTypecheckWorkerEntry() {
    const dirname = getDirname(import.meta.url);
    const candidates = [
      path.join(process.cwd(), "pkgs/@akanjs/devkit/typecheck/typecheck.proc.ts"),
      path.join(process.cwd(), "node_modules/@akanjs/devkit/typecheck/typecheck.proc.ts"),
      path.join(dirname, "typecheck/typecheck.proc.ts"),
      path.join(dirname, "typecheck.proc.js"),
      path.join(dirname, "typecheck.proc.ts"),
    ];
    for (const candidate of candidates) if (await Bun.file(candidate).exists()) return candidate;
    throw new Error(`[devkit] typecheck worker entry not found; looked in: ${candidates.join(", ")}`);
  }
  getLinter() {
    this.linter ??= new Linter(this.cwdPath);
    return this.linter;
  }
  async lint(
    filePath: string,
    { fix = false, dryRun = false }: { fix?: boolean; dryRun?: boolean } = {},
  ): Promise<{
    results: unknown[]; // ESLint.LintResult[];
    message: string;
    errors: unknown[]; // ESLintLinter.LintMessage[];
    warnings: unknown[]; // ESLintLinter.LintMessage[];
  }> {
    const path = this.getPath(filePath);
    const linter = this.getLinter();
    const { results, errors, warnings } = await linter.lint(path, {
      fix,
      dryRun,
    });
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
  override emoji = execEmoji.workspace;
  constructor({ workspaceRoot, repoName }: ExecutorOptions) {
    super("workspace", workspaceRoot);
    this.workspaceRoot = workspaceRoot;
    this.repoName = repoName;
  }

  static #execs = new Map<string, WorkspaceExecutor>();
  static fromRoot({
    workspaceRoot = process.cwd(),
    repoName = path.basename(process.cwd()),
  }: {
    workspaceRoot?: string;
    repoName?: string;
  } = {}) {
    return WorkspaceExecutor.#execs.get(repoName) ?? new WorkspaceExecutor({ workspaceRoot, repoName });
  }
  static getBaseDevEnv(envPath?: string) {
    // Bun auto-loads .env, so we use process.env directly
    const sourceEnv = envPath ? { ...process.env, ...parseEnvFile(envPath) } : process.env;

    const appName = sourceEnv.AKAN_PUBLIC_APP_NAME;
    const workspaceRoot = sourceEnv.AKAN_WORKSPACE_ROOT;
    const workspaceId = sourceEnv.AKAN_WORKSPACE_ID;

    const repoName = sourceEnv.AKAN_PUBLIC_REPO_NAME;
    if (!repoName) throw new Error("AKAN_PUBLIC_REPO_NAME is not set");

    const serveDomain = sourceEnv.AKAN_PUBLIC_SERVE_DOMAIN;
    if (!serveDomain) throw new Error("AKAN_PUBLIC_SERVE_DOMAIN is not set");

    const portOffset = parseInt(sourceEnv.PORT_OFFSET ?? "0");

    const env = (sourceEnv.AKAN_PUBLIC_ENV ?? "debug") as
      | "testing"
      | "debug"
      | "develop"
      | "main"
      | "local"
      | undefined;
    if (!env) throw new Error("AKAN_PUBLIC_ENV is not set");
    return {
      ...(appName ? { appName } : {}),
      workspaceRoot,
      repoName,
      serveDomain,
      env,
      portOffset,
      workspaceId,
    };
  }
  getWorkspaceId<AllowEmpty extends boolean = false>({
    allowEmpty,
  }: {
    allowEmpty?: AllowEmpty;
  } = {}): AllowEmpty extends true ? string | undefined : string {
    const { workspaceId } = WorkspaceExecutor.getBaseDevEnv();
    if (!workspaceId && !allowEmpty) throw new Error("Workspace ID is not found");
    return workspaceId as AllowEmpty extends true ? string | undefined : string;
  }
  async scan(): Promise<WorkspaceInfo> {
    return await WorkspaceInfo.fromExecutor(this);
  }
  async getApps() {
    if (!(await FileSys.dirExists(`${this.workspaceRoot}/apps`))) return [];
    return await this.#getDirHasFile(`${this.workspaceRoot}/apps`, "akan.config.ts");
  }
  async getLibs() {
    if (!(await FileSys.dirExists(`${this.workspaceRoot}/libs`))) return [];
    return await this.#getDirHasFile(`${this.workspaceRoot}/libs`, "akan.config.ts");
  }
  async getSyss() {
    const [appNames, libNames] = await Promise.all([this.getApps(), this.getLibs()]);
    return [appNames, libNames] as [string[], string[]];
  }
  async getPkgs() {
    if (!(await FileSys.dirExists(`${this.workspaceRoot}/pkgs`))) return [];
    return await this.#getDirHasFile(`${this.workspaceRoot}/pkgs`, "package.json");
  }
  async getExecs() {
    const [appNames, libNames, pkgNames] = await Promise.all([this.getApps(), this.getLibs(), this.getPkgs()]);
    return [appNames, libNames, pkgNames] as [string[], string[], string[]];
  }
  async setPkgTsPaths(name: string) {
    const rootTsConfig = (await this.readJson("tsconfig.json")) as TsConfigJson;
    rootTsConfig.compilerOptions.paths ??= {};
    rootTsConfig.compilerOptions.paths[name] = [`./pkgs/${name}/index.ts`];
    rootTsConfig.compilerOptions.paths[`${name}/*`] = [`./pkgs/${name}/*`];
    if (rootTsConfig.references) {
      if (!rootTsConfig.references.some((ref) => ref.path === `./pkgs/${name}/tsconfig.json`))
        rootTsConfig.references.push({ path: `./pkgs/${name}/tsconfig.json` });
    }
    await this.writeJson("tsconfig.json", rootTsConfig);
    return this;
  }
  async unsetPkgTsPaths(name: string) {
    const rootTsConfig = (await this.readJson("tsconfig.json")) as TsConfigJson;
    const filteredKeys = Object.keys(rootTsConfig.compilerOptions.paths ?? {}).filter(
      (key) => key !== name && key !== `${name}/*`,
    );
    rootTsConfig.compilerOptions.paths = Object.fromEntries(
      filteredKeys.map((key) => [key, rootTsConfig.compilerOptions.paths?.[key] ?? []]),
    );
    if (rootTsConfig.references) {
      rootTsConfig.references = rootTsConfig.references.filter(
        (ref) => ref.path !== `./pkgs/${name}/tsconfig.json`,
      ) as TsConfigJson["references"];
    }
    await this.writeJson("tsconfig.json", rootTsConfig);
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
          if ((await stat(dirPath)).isDirectory()) {
            results.push(`${prefix}${dir}`);
            if (maxDepth > 0) await getDirs(dirPath, maxDepth - 1, results, `${prefix}${dir}/`);
          }
        }),
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
    const AVOID_DIRS = ["node_modules", "dist", "public", "webkit"];
    const getDirs = async (dirname: string, maxDepth = 3, results: string[] = [], prefix = "") => {
      const dirs = await this.readdir(dirname);
      await Promise.all(
        dirs.map(async (dir) => {
          if (AVOID_DIRS.includes(dir)) return;
          const dirPath = path.join(dirname, dir);
          //* A dangling symlink (e.g. a synced lib page whose source was deleted) must not fail the walk —
          //* this runs for `getApps`, so throwing here would break every command until it is repaired.
          if (await FileSys.dirExists(dirPath)) {
            const hasTargetFile = await FileSys.fileExists(path.join(dirPath, targetFilename));
            if (hasTargetFile) results.push(`${prefix}${dir}`);
            if (maxDepth > 0) await getDirs(dirPath, maxDepth - 1, results, `${prefix}${dir}/`);
          }
        }),
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

const scanFacetDirs = ["ui", "webkit", "srvkit", "common", "plugin"] as const;

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
  #getScanTemplateTasks(scanInfo: AppInfo | LibInfo): (Promise<FileContent[]> | null)[] {
    return [
      this._applyTemplate({ basePath: "env", template: "env", scanInfo }),
      this._applyTemplate({ basePath: "lib", template: "lib", scanInfo }),
      this._applyTemplate({ basePath: ".", template: "server.ts", scanInfo }),
      this._applyTemplate({ basePath: ".", template: "client.ts", scanInfo }),
      this.type === "lib" ? this._applyTemplate({ basePath: ".", template: "index.ts", scanInfo }) : null,
      ...scanFacetDirs.map((facet) =>
        this._applyTemplate({
          basePath: facet,
          template: "facetIndex/index.ts",
          scanInfo,
          options: { exec: this, facet },
        }),
      ),
      ...scanInfo.getDatabaseModules().map((model) =>
        this._applyTemplate({
          basePath: `lib/${model}`,
          template: "moduleRoot",
          scanInfo,
          dict: { model, Model: capitalize(model) },
        }),
      ),
      ...scanInfo.getServiceModules().map((model) =>
        this._applyTemplate({
          basePath: `lib/_${model}`,
          template: "moduleRoot",
          scanInfo,
          dict: { model, Model: capitalize(model) },
        }),
      ),
      ...scanInfo.getScalarModules().map((model) =>
        this._applyTemplate({
          basePath: `lib/__scalar/${model}`,
          template: "moduleRoot",
          scanInfo,
          dict: { model, Model: capitalize(model) },
        }),
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
    if (write) {
      await Promise.all(this.#getScanTemplateTasks(scanInfo));
      await this.writeJson(`akan.${this.type}.json`, scanInfo.getScanResult());
      if (this.type === "lib") this.#updateDependencies(scanInfo);

      if (writeLib) {
        const libInfos = [...scanInfo.getLibInfos().values()];
        await this.#updateDependencies(scanInfo);
        await Promise.all(libInfos.flatMap((libInfo) => libInfo.exec.#getScanTemplateTasks(libInfo)));
      }
    }
    this.#scanInfo = scanInfo;
    return scanInfo;
  }
  async #updateDependencies(scanInfo: AppInfo | LibInfo) {
    const rootPackageJson = await this.workspace.getPackageJson();
    const libPackageJson = await this.getPackageJson();
    const dependencies = scanInfo.getScanResult().dependencies;
    const devDependencies = scanInfo.getScanResult().devDependencies;
    const dependencySet = new Set(dependencies);
    const devDependencySet = new Set(devDependencies);
    const libPkgJsonWithDeps: PackageJson = {
      ...libPackageJson,
      dependencies: {
        ...Object.fromEntries(
          Object.entries(libPackageJson.dependencies ?? {}).filter(([dep]) => !devDependencySet.has(dep)),
        ),
        ...(Object.fromEntries(
          dependencies
            .filter((dep) => rootPackageJson.dependencies?.[dep])
            .sort()
            .map((dep) => [dep, rootPackageJson.dependencies?.[dep]]),
        ) as Record<string, string>),
      },
      devDependencies: {
        ...Object.fromEntries(
          Object.entries(libPackageJson.devDependencies ?? {}).filter(([dep]) => !dependencySet.has(dep)),
        ),
        ...(Object.fromEntries(
          devDependencies
            .filter((dep) => rootPackageJson.dependencies?.[dep] || rootPackageJson.devDependencies?.[dep])
            .sort()
            .map((dep) => [dep, rootPackageJson.devDependencies?.[dep] ?? rootPackageJson.dependencies?.[dep]]),
        ) as Record<string, string>),
      },
    };
    await this.setPackageJson(libPkgJsonWithDeps);
  }
  override async getLocalFile(targetPath: string) {
    const filePath = path.isAbsolute(targetPath) ? targetPath : `${this.type}s/${this.name}/${targetPath}`;
    const content = await this.workspace.readFile(filePath);
    return { filePath, content };
  }

  async getDatabaseModules() {
    const databaseModules = (await this.readdir("lib"))
      .filter((name) => !name.startsWith("_") && !name.startsWith("__") && !name.endsWith(".ts"))
      .filter((name) => Bun.file(`${this.cwdPath}/lib/${name}/${name}.constant.ts`).exists());
    return databaseModules;
  }

  async getServiceModules() {
    const serviceModules = (await this.readdir("lib"))
      .filter((name) => name.startsWith("_") && !name.startsWith("__"))
      .filter((name) => Bun.file(`${this.cwdPath}/lib/${name}/${name}.service.ts`).exists());
    return serviceModules;
  }

  async getScalarModules() {
    const scalarModules = (await this.readdir("lib/__scalar"))
      .filter((name) => !name.startsWith("_"))
      .filter((name) => Bun.file(`${this.cwdPath}/lib/__scalar/${name}/${name}.constant.ts`).exists());
    return scalarModules;
  }

  async getViewComponents() {
    const viewComponents = (await this.readdir("lib"))
      .filter((name) => !name.startsWith("_") && !name.startsWith("__") && !name.endsWith(".ts"))
      .filter((name) => Bun.file(`${this.cwdPath}/lib/${name}/${capitalize(name)}.View.tsx`).exists());
    return viewComponents;
  }

  async getUnitComponents() {
    const unitComponents = (await this.readdir("lib"))
      .filter((name) => !name.startsWith("_") && !name.startsWith("__") && !name.endsWith(".ts"))
      .filter((name) => Bun.file(`${this.cwdPath}/lib/${name}/${capitalize(name)}.Unit.tsx`).exists());
    return unitComponents;
  }
  async getTemplateComponents() {
    const templateComponents = (await this.readdir("lib"))
      .filter((name) => !name.startsWith("_") && !name.startsWith("__") && !name.endsWith(".ts"))
      .filter((name) => Bun.file(`${this.cwdPath}/lib/${name}/${capitalize(name)}.Template.tsx`).exists());
    return templateComponents;
  }

  async getViewsSourceCode() {
    const viewComponents = await this.getViewComponents();
    return Promise.all(
      viewComponents.map((viewComponent) =>
        this.getLocalFile(`lib/${viewComponent}/${capitalize(viewComponent)}.View.tsx`),
      ),
    );
  }
  async getUnitsSourceCode() {
    const unitComponents = await this.getUnitComponents();
    return Promise.all(
      unitComponents.map((unitComponent) =>
        this.getLocalFile(`lib/${unitComponent}/${capitalize(unitComponent)}.Unit.tsx`),
      ),
    );
  }
  async getTemplatesSourceCode() {
    const templateComponents = await this.getTemplateComponents();
    return Promise.all(
      templateComponents.map((templateComponent) =>
        this.getLocalFile(`lib/${templateComponent}/${capitalize(templateComponent)}.Template.tsx`),
      ),
    );
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
      scalarModules.map((scalarModule) => this.getLocalFile(`lib/${scalarModule}/${scalarModule}.dictionary.ts`)),
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
      libDeps.map(async (lib) => [
        ...(await LibExecutor.from(this, lib).getConstantFiles()),
        ...(await LibExecutor.from(this, lib).getScalarConstantFiles()),
      ]),
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
    const dict = {
      ...(options.dict ?? {}),
      ...Object.fromEntries(
        Object.entries(options.dict ?? {}).map(([key, value]) => [capitalize(key), capitalize(value)]),
      ),
    };
    const scanInfo = await this.scan();
    const fileContents = await this._applyTemplate({
      ...options,
      scanInfo,
      dict,
    });
    await this.scan();
    return fileContents;
  }
}

interface AppExecutorOptions {
  workspace?: WorkspaceExecutor;
  name: string;
}
export class AppExecutor extends SysExecutor {
  // `typescript` costs ~65MB resident, so keep it out of the module graph of every process that only
  // ever imports an executor. Route validation is the sole consumer here and is already async.
  static #routeSourceValidator: typeof import("./routeSourceValidator").RouteSourceValidator | null = null;
  static async #getRouteSourceValidator() {
    AppExecutor.#routeSourceValidator ??= (await import("./routeSourceValidator")).RouteSourceValidator;
    return AppExecutor.#routeSourceValidator;
  }
  dist: Executor;
  override emoji = execEmoji.app;
  constructor({ workspace, name }: AppExecutorOptions) {
    super({ workspace, name, type: "app" });
    this.dist = new Executor(`dist/${name}`, `${this.workspace.workspaceRoot}/dist/apps/${name}`);
  }
  static #execs = new Map<string, AppExecutor>();
  static from(executor: SysExecutor | WorkspaceExecutor, name: string) {
    const exec = AppExecutor.#execs.get(name);
    if (exec) return exec;
    else if (executor instanceof WorkspaceExecutor) return new AppExecutor({ workspace: executor, name });
    else return new AppExecutor({ workspace: executor.workspace, name });
  }
  getEnv() {
    return WorkspaceExecutor.getBaseDevEnv().env;
  }
  /**
   * This app's dev port, derived from its position in the sorted `apps/` listing so several apps can run
   * at once without colliding.
   *
   * `AKAN_DEV_PORT` pins it instead, because the derived value *moves*: the index shifts whenever any other
   * app directory appears or disappears, and a dev host recomputes this on every restart. So a session that
   * adds an app relands its dev server on a different port, and anything that reserved a port relative to
   * the old one is left pointing at nothing.
   */
  async getDevPort() {
    const pinned = Number(process.env.AKAN_DEV_PORT);
    if (Number.isInteger(pinned) && pinned > 0 && pinned <= 65_535) return pinned;
    const basePort = 8282;
    const appNames = (await this.workspace.getApps()).sort((a, b) => a.localeCompare(b));
    const appIndex = Math.max(appNames.indexOf(this.name), 0);
    const portOffset = WorkspaceExecutor.getBaseDevEnv().portOffset;
    return basePort + appIndex + portOffset;
  }
  getCommandEnv(env: Record<string, string> = {}): Record<string, string> {
    const basePort = 8282;
    const portOffset = WorkspaceExecutor.getBaseDevEnv().portOffset;
    const PORT = (basePort + portOffset).toString();
    const AKAN_PUBLIC_SERVER_PORT = portOffset ? (8282 + portOffset).toString() : undefined;
    return {
      ...process.env,
      AKAN_PUBLIC_APP_NAME: this.name,
      AKAN_WORKSPACE_ROOT: this.workspace.workspaceRoot,
      NODE_NO_WARNINGS: "1",
      PORT,
      AKAN_PUBLIC_CLIENT_PORT: PORT,
      ...(AKAN_PUBLIC_SERVER_PORT ? { AKAN_PUBLIC_SERVER_PORT } : {}),
      ...env,
    };
  }
  async prepareCommand(type: "build" | "start") {
    const akanConfig = await this.getConfig();
    const databaseMode = process.env.AKAN_DATABASE_MODE ?? akanConfig.defaultDatabaseMode ?? "single";
    const routeEnv = {
      AKAN_PUBLIC_BASE_PATHS: [...akanConfig.basePaths].join(","),
      AKAN_DATABASE_MODE: databaseMode,
    };
    Object.assign(process.env, routeEnv);
    if (type === "build") {
      //* `scanSync` already read the route set, and it reads it unfiltered — dev-only routes are still
      //* generated against and typechecked. Drop the cache so the build phases re-read it without them.
      this.#excludeDevOnlyPages = true;
      this.#pageKeys = null;
      if (await this.exists(this.dist.cwdPath)) await this.dist.exec(`rm -rf ${this.dist.cwdPath}`);
      await Promise.all([this.dist.mkdir("private"), this.dist.mkdir("public")]);
      //* Lib assets are symlinks in the app dir (see syncAssets). dist is the docker build context and the
      //* release tarball root, neither of which follows a link out of itself, so materialize them here.
      await Promise.all([
        this.cp("private", `${this.dist.cwdPath}/private`, { dereference: true }),
        this.cp("public", `${this.dist.cwdPath}/public`, { dereference: true }),
      ]);
    } else await this.removeDir(".akan");
    const devPort = type === "start" ? (await this.getDevPort()).toString() : undefined;
    const env = this.getCommandEnv({
      AKAN_COMMAND_TYPE: type,
      ...routeEnv,
      ...(devPort ? { PORT: devPort, AKAN_PUBLIC_CLIENT_PORT: devPort, AKAN_PUBLIC_SERVER_PORT: devPort } : {}),
    });
    // `start` spawns subprocesses that carry `env`, but `build` runs its phases in this same process and
    // reads `process.env` directly. Publish the resolved env here so SSR/CSR bundling (fed by getPublicEnv,
    // which filters to AKAN_PUBLIC_*) sees AKAN_PUBLIC_APP_NAME — otherwise SSR throws
    // "environment variable AKAN_PUBLIC_APP_NAME is required". Only AKAN_PUBLIC_* is baked into bundles, so
    // this does not leak non-public env.
    if (type === "build") Object.assign(process.env, env);
    return { env };
  }
  #publicEnv: Record<string, string> | null = null;
  getPublicEnv(...patterns: string[]) {
    if (this.#publicEnv) return this.#publicEnv;
    const searchPatterns = [...patterns, "AKAN_PUBLIC_*"];
    const regexes = searchPatterns.map((pattern) => {
      let body = "";
      for (const ch of pattern) {
        if (ch === "*") body += ".*";
        else body += ch.replace(/[.+^${}()|[\]\\?]/g, "\\$&");
      }
      return new RegExp(`^${body}$`);
    });
    const publicEnv: Record<string, string> = {};
    for (const [k, v] of Object.entries(process.env)) {
      if (typeof v !== "string") continue;
      if (regexes.some((r) => r.test(k))) publicEnv[k] = v;
    }
    this.#publicEnv = publicEnv;
    return publicEnv;
  }

  #akanConfig: AkanAppConfig | null = null;
  override async getConfig({ refresh }: { refresh?: boolean } = {}) {
    if (this.#akanConfig && !refresh) return this.#akanConfig;
    // A refresh means the config file may have been edited; bust the import cache so the fresh
    // module is evaluated instead of Bun's cached instance.
    this.#akanConfig = await AkanAppConfig.from(this, { bustImportCache: refresh });
    return this.#akanConfig;
  }

  #pageKeys: string[] | null = null;
  /** Set once `prepareCommand("build")` runs, so every later consumer of the route set agrees on it. */
  #excludeDevOnlyPages = false;
  async getPageKeys({ refresh }: { refresh?: boolean } = {}): Promise<string[]> {
    if (this.#pageKeys && !refresh) return this.#pageKeys;
    const akanConfig = await this.getConfig();
    const glob = new Bun.Glob("**/*");
    const pageKeys: string[] = [];
    const owners = new Map<string, { absPath: string; fromLib: boolean }>();
    const devOnlyKeys = new Set<string>();
    const devOnlyDirs: string[] = [];
    for (const root of await this.getPageRoots()) {
      if (!(await FileSys.dirExists(root.dir))) continue;
      for await (const rel of glob.scan({
        cwd: root.dir,
        absolute: false,
        onlyFiles: true,
      })) {
        const segments = rel.split(path.sep);
        if (segments.some((s) => s === "node_modules")) continue;
        const posix = `${root.keyPrefix}${segments.join("/")}`;
        const absPath = path.join(root.dir, ...segments);
        validatePageSourceFile(posix, { filePath: absPath });
        if (!isRouteSourceFile(posix)) continue;
        const key = `./${posix}`;
        validateSubRoutePageKey(key, akanConfig.basePaths, {
          appName: this.name,
          filePath: absPath,
        });
        const parsed = parseRouteModuleKey(key);
        if (parsed.isInternalRootLayout) {
          throw new Error(`[route-convention] __root_layout is reserved for Akan.js generated root layout: ${absPath}`);
        }
        const fromLib = !!root.keyPrefix;
        const routeId = `${parsed.kind}:${parsed.pattern}`;
        const owner = owners.get(routeId);
        //* App-owned routes have always been allowed to collide (two groups, one pattern); only report a
        //* collision once a synced lib is involved, where neither side can see the other.
        if (owner && (owner.fromLib || fromLib)) {
          throw new Error(
            `[route-convention] duplicate ${parsed.kind} route "${parsed.pattern}" in app "${this.name}":\n- ${owner.absPath}\n- ${absPath}`,
          );
        }
        if (!owner) owners.set(routeId, { absPath, fromLib });
        const isRootLayout = parsed.kind === "layout" && parsed.moduleSegments.at(-1) === "_layout";
        const routeSource = await Bun.file(absPath).text();
        const validator = await AppExecutor.#getRouteSourceValidator();
        if (parsed.kind === "overrides") validator.validateOverridesSourceExports(routeSource, absPath);
        else {
          const info = validator.validateRouteSourceExports(routeSource, absPath, parsed.kind, {
            rootLayout: isRootLayout,
          });
          if (info.devOnly) {
            devOnlyKeys.add(key);
            //* A layout owns its directory, so a dev-only one takes the whole subtree with it — leaving its
            //* pages behind would ship them stripped of the chrome they were written under.
            if (parsed.kind === "layout") devOnlyDirs.push(key.replace(/[^/]+$/, ""));
          }
        }
        pageKeys.push(key);
      }
    }
    pageKeys.sort();
    this.#pageKeys = this.#excludeDevOnlyPages ? this.#dropDevOnlyPages(pageKeys, devOnlyKeys, devOnlyDirs) : pageKeys;
    return this.#pageKeys;
  }
  #dropDevOnlyPages(pageKeys: string[], devOnlyKeys: Set<string>, devOnlyDirs: string[]): string[] {
    if (!devOnlyKeys.size) return pageKeys;
    const isDevOnly = (key: string) => devOnlyKeys.has(key) || devOnlyDirs.some((dir) => key.startsWith(dir));
    const dropped = pageKeys.filter(isDevOnly);
    this.log(`[route] excluded ${dropped.length} dev-only route file(s) from the build: ${dropped.join(", ")}`);
    return pageKeys.filter((key) => !isDevOnly(key));
  }
  /**
   * Every directory that contributes route files, as `page`-relative key prefixes. Lib roots are the
   * symlinks `syncPages` created, so route keys stay app-relative while `realDir` is what a file watcher
   * reports. Enumeration never crosses a symlink (neither Bun's glob nor TypeScript's `include` does),
   * which is why linked page folders have to be listed here instead of found by walking `page`.
   */
  async getPageRoots(): Promise<PageRoot[]> {
    const akanConfig = await this.getConfig();
    const pageDir = `${this.cwdPath}/page`;
    const roots: PageRoot[] = [{ dir: pageDir, realDir: pageDir, keyPrefix: "" }];
    for (const parent of AppExecutor.#pageLibParents(akanConfig.basePaths)) {
      const libsDir = `${pageDir}/${parent}${AppExecutor.#pageLibsDir}`;
      const entries = await readDirEntries(libsDir).catch(() => [] as string[]);
      for (const entry of entries.sort()) {
        const dir = `${libsDir}/${entry}`;
        if (!(await FileSys.dirExists(dir))) continue;
        roots.push({ dir, realDir: await realpath(dir), keyPrefix: `${parent}${AppExecutor.#pageLibsDir}/${entry}/` });
      }
    }
    return roots;
  }
  setPageKeys(pageKeys: string[]) {
    this.#pageKeys = pageKeys;
  }

  static readonly #pageLibsDir = "(libs)";
  /** Where `(libs)` may live: once at the page root, or once per basePath when the app declares subRoutes. */
  static #pageLibParents(basePaths: Iterable<string>): string[] {
    const parents = [...basePaths].map((basePath) => `${basePath}/`);
    return parents.length ? parents : [""];
  }
  /** Returns whether the linked page set changed, which is what makes the app's route keys stale. */
  async syncPages(libDeps: string[]): Promise<boolean> {
    const akanConfig = await this.getConfig();
    const parents = AppExecutor.#pageLibParents(akanConfig.basePaths);
    const libs = await this.#resolvePageLibs(akanConfig.syncPageLibs, libDeps);
    //* Listed rather than taken from `getPageRoots`, which drops links whose target is gone — those are
    //* exactly the ones a sync has to clean up.
    const linked = (
      await Promise.all(
        parents.map(async (parent) => {
          const libsDir = `${this.cwdPath}/page/${parent}${AppExecutor.#pageLibsDir}`;
          const entries = await readDirEntries(libsDir).catch(() => [] as string[]);
          return entries.map((entry) => `${parent}${AppExecutor.#pageLibsDir}/${entry}/`);
        }),
      )
    ).flat();
    const wanted = parents.flatMap((parent) => libs.map((lib) => `${parent}${AppExecutor.#pageLibsDir}/(${lib})/`));
    if (linked.sort().join(",") === wanted.sort().join(",")) return false;
    await Promise.all(
      parents.map((parent) => this.removeDir(`${this.cwdPath}/page/${parent}${AppExecutor.#pageLibsDir}`)),
    );
    for (const parent of parents) {
      if (!libs.length) break;
      const libsDir = `${this.cwdPath}/page/${parent}${AppExecutor.#pageLibsDir}`;
      await this.mkdir(libsDir);
      await Promise.all(
        libs.map((lib) =>
          AppExecutor.#linkLibAsset(`${this.workspace.workspaceRoot}/libs/${lib}/page`, `${libsDir}/(${lib})`),
        ),
      );
    }
    this.#pageKeys = null;
    return true;
  }
  async #resolvePageLibs(syncPageLibs: string[] | boolean, libDeps: string[]): Promise<string[]> {
    if (!syncPageLibs) return [];
    const hasPageDir = async (lib: string) =>
      await FileSys.dirExists(`${this.workspace.workspaceRoot}/libs/${lib}/page`);
    if (syncPageLibs === true) {
      const libs: string[] = [];
      for (const lib of libDeps) if (await hasPageDir(lib)) libs.push(lib);
      return libs;
    }
    for (const lib of syncPageLibs) {
      if (!libDeps.includes(lib))
        throw new Error(
          `[syncPageLibs] app "${this.name}" lists lib "${lib}" but does not depend on it (deps: ${libDeps.join(", ") || "none"})`,
        );
      if (!(await hasPageDir(lib)))
        throw new Error(`[syncPageLibs] app "${this.name}" lists lib "${lib}" but libs/${lib}/page does not exist`);
    }
    return [...syncPageLibs];
  }
  async syncAssets(libDeps: string[]) {
    await Promise.all((["public", "private"] as const).map((facet) => this.#syncLibAssets(facet, libDeps)));
  }
  async #syncLibAssets(facet: "public" | "private", libDeps: string[]) {
    const libLinkPath = `${this.cwdPath}/${facet}/libs`;
    await this.removeDir(libLinkPath);
    const targetDeps = [] as string[];
    for (const dep of libDeps) {
      if (await this.exists(`${this.workspace.workspaceRoot}/libs/${dep}/${facet}`)) targetDeps.push(dep);
    }
    if (!targetDeps.length) return;
    await this.mkdir(libLinkPath);
    await Promise.all(
      targetDeps.map((dep) =>
        AppExecutor.#linkLibAsset(`${this.workspace.workspaceRoot}/libs/${dep}/${facet}`, `${libLinkPath}/${dep}`),
      ),
    );
  }
  static async #linkLibAsset(targetPath: string, linkPath: string) {
    //* A relative link keeps working when the workspace is mounted at another path (containers, CI);
    //* Windows junctions are the exception and resolve their target as an absolute path.
    const isWindows = process.platform === "win32";
    try {
      const target = isWindows ? targetPath : path.relative(path.dirname(linkPath), targetPath);
      await symlink(target, linkPath, isWindows ? "junction" : "dir");
    } catch (error) {
      if (!isWindows) throw error;
      await mkdir(linkPath, { recursive: true });
      await cpEntry(targetPath, linkPath, { recursive: true, dereference: true, force: true });
    }
  }
  async scanSync({ refresh = false, write = true }: { refresh?: boolean; write?: boolean } = {}) {
    const scanInfo = (await this.scan({
      refresh,
      write,
      writeLib: write,
    })) as AppInfo;
    if (write) await this.syncAssets(scanInfo.getScanResult().libDeps);
    //* `scan` read the routes off the page tree this sync may be about to change, so re-read them.
    if (write && (await this.syncPages(scanInfo.getScanResult().libDeps)))
      scanInfo.setRoutes(await this.getPageKeys({ refresh: true }));
    if (write) await this.#runPluginSyncAssets();
    return scanInfo;
  }
  //* build-time asset generation is delegated to plugins (e.g. the push plugin writes
  //* public/firebase-messaging-sw.js). The framework itself no longer knows about firebase.
  async #runPluginSyncAssets() {
    const plugins = await this.collectPlugins();
    if (!plugins.some((plugin) => plugin.syncAssets)) return;
    const ctx = this.#makeSyncContext();
    for (const plugin of plugins) await plugin.syncAssets?.(ctx);
  }
  #makeSyncContext(): AkanSyncContext {
    return {
      appName: this.name,
      appPath: this.cwdPath,
      executor: this,
      getPath: (rel) => this.getPath(rel),
      fileExists: (rel) => FileSys.fileExists(this.getPath(rel)),
      writeFile: async (rel, content, opts) => {
        await this.writeFile(rel, content, opts);
      },
      readEnvClient: async () => {
        const envClientPath = path.join(this.cwdPath, "env", "env.client.ts");
        if (!(await FileSys.fileExists(envClientPath))) return null;
        try {
          const envUrl = pathToFileURL(envClientPath);
          envUrl.searchParams.set("t", String(Date.now()));
          const envModule = (await import(envUrl.href)) as { env?: Record<string, unknown> };
          return envModule.env ?? null;
        } catch {
          return null;
        }
      },
    };
  }
  //* Aggregate plugins declared by this app's akan.config plus each of its lib dependencies'
  //* akan.config. This is how a lib (e.g. libs/util) opts an app into a feature turnkey.
  async collectPlugins(): Promise<AkanPlugin[]> {
    const scanInfo = (await this.scan({ write: false })) as AppInfo;
    const libDeps = scanInfo.getLibs();
    const appConfig = await this.getConfig();
    const collected: AkanPlugin[] = [...appConfig.plugins];
    for (const libName of libDeps) {
      const libConfig = await LibExecutor.from(this, libName)
        .getConfig()
        .catch(() => null);
      if (libConfig) collected.push(...libConfig.plugins);
    }
    const seen = new Set<string>();
    return collected.filter((plugin) => {
      if (seen.has(plugin.name)) return false;
      seen.add(plugin.name);
      return true;
    });
  }
  async getPluginRuntimePackages(): Promise<string[]> {
    const plugins = await this.collectPlugins();
    const appConfig = await this.getConfig();
    const ctx: PluginRuntimeContext = {
      appName: this.name,
      mobile: appConfig.mobile,
      hasMobilePermission: (permission) =>
        Object.values(appConfig.mobile.targets).some((target) => target.permissions?.includes(permission) ?? false),
    };
    return [...new Set(plugins.flatMap((plugin) => plugin.runtimePackages?.(ctx) ?? []))];
  }
  async increaseBuildNum() {
    await increaseBuildNum(this);
  }
  async decreaseBuildNum() {
    await decreaseBuildNum(this);
  }
}
interface LibExecutorOptions {
  workspace?: WorkspaceExecutor;
  name: string;
}
export class LibExecutor extends SysExecutor {
  dist: Executor;
  override emoji = execEmoji.lib;
  constructor({ workspace, name }: LibExecutorOptions) {
    super({ workspace, name, type: "lib" });
    this.dist = new Executor(`dist/${name}`, `${this.workspace.workspaceRoot}/dist/libs/${name}`);
  }
  static #execs = new Map<string, LibExecutor>();
  static from(executor: SysExecutor | WorkspaceExecutor, name: string) {
    const exec = LibExecutor.#execs.get(name);
    if (exec) return exec;
    else if (executor instanceof WorkspaceExecutor) return new LibExecutor({ workspace: executor, name });
    else return new LibExecutor({ workspace: executor.workspace, name });
  }

  #akanConfig: AkanLibConfig | null = null;
  override async getConfig({ refresh }: { refresh?: boolean } = {}) {
    if (this.#akanConfig && !refresh) return this.#akanConfig;
    this.#akanConfig = await AkanLibConfig.from(this);
    return this.#akanConfig;
  }
}

interface PkgExecutorOptions {
  workspace?: WorkspaceExecutor;
  name: string;
}
export class PkgExecutor extends Executor {
  workspace: WorkspaceExecutor;
  override name: string;
  dist: Executor;
  override emoji = execEmoji.pkg;
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
  async #getDependencyVersion(rootPackageJson: PackageJson, dep: string): Promise<string | undefined> {
    const rootDeps = {
      ...rootPackageJson.dependencies,
      ...rootPackageJson.devDependencies,
    };
    const rootVersion = rootDeps[dep];
    if (rootVersion) return rootVersion;

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
    const devDependencyNames = [...new Set(devDependencies)].filter((dep) => !dependencyNames.includes(dep)).sort();
    const dependencyVersions = new Map<string, string>();
    const missingDeps: string[] = [];
    for (const dep of [...dependencyNames, ...devDependencyNames]) {
      const version = await this.#getDependencyVersion(rootPackageJson, dep);
      if (version) dependencyVersions.set(dep, version);
      else missingDeps.push(dep);
    }
    if (missingDeps.length > 0)
      throw new Error(`Missing dependency versions in root package.json: ${missingDeps.join(", ")}`);

    const toDependencyEntries = (names: string[]) =>
      names.map((dep) => {
        const version = dependencyVersions.get(dep);
        if (!version) throw new Error(`Missing dependency versions in root package.json: ${dep}`);
        return [dep, version] as const;
      });

    return {
      dependencies: Object.fromEntries(toDependencyEntries(dependencyNames)),
      devDependencies: Object.fromEntries(toDependencyEntries(devDependencyNames)),
    };
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
      engines: { bun: ">=1.3.13" },
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

interface ModuleExecutorOptions {
  sys: SysExecutor;
  name: string;
}
export class ModuleExecutor extends Executor {
  sys: SysExecutor;
  override emoji = execEmoji.module;
  constructor({ sys, name }: ModuleExecutorOptions) {
    super(name, `${sys.workspace.workspaceRoot}/${sys.type}s/${sys.name}/lib/${name}`);
    this.sys = sys;
  }
  static from(sysExecutor: SysExecutor, name: string) {
    return new ModuleExecutor({ sys: sysExecutor, name });
  }
}
