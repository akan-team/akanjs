import {
  type ChildProcess,
  type ExecOptions,
  exec,
  type ForkOptions,
  fork,
  type SpawnOptions,
  spawn,
} from "node:child_process";
import { copyFile, cp as cpEntry, mkdir, readdir as readDirEntries, rm, stat } from "node:fs/promises";
import path from "node:path";
import { capitalize, Logger, toError } from "akanjs/common";
import { $ } from "bun";
import chalk from "chalk";
import { FileSys, getDirname } from "../fileSys";
import { JsonFormatter } from "../jsonFormatter";
import { Linter } from "../linter";
import type { AppInfo, LibInfo } from "../scanInfo";
import { Spinner } from "../spinner";
// Type-only: `getTypeChecker` loads it on demand to keep `typescript` out of the resident module graph.
import type { TypeChecker } from "../typeChecker";
import { ProjectTypecheck } from "../typecheck/projectTypecheck";
import type { FileContent, PackageJson, TsConfigJson } from "../types";
import { CommandExecutionError } from "./commandExecutionError";

export interface WrittenFileContent extends FileContent {
  written: boolean;
}

const staticTemplateFileExtensions = new Set(
  ".avif .bmp .cjs .css .eot .gif .html .ico .jpeg .jpg .js .json .map .md .mjs .mp3 .mp4 .ogg .otf .pdf .png .svg"
    .split(" ")
    .concat(".ttf .txt .wasm .wav .webm .webp .woff .woff2 .xml".split(" ")),
);

export const execEmoji = {
  workspace: "🏠",
  app: "🚀",
  lib: "🔧",
  pkg: "📦",
  dist: "💿",
  module: "⚙️",
  default: "✈️",
};

const withCapitalizedDict = (dict: { [key: string]: string } = {}) => ({
  ...dict,
  ...Object.fromEntries(Object.entries(dict).map(([key, value]) => [capitalize(key), capitalize(value)])),
});

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
  #settle(
    proc: ChildProcess,
    target: { command: string; args?: string[]; cwd: string },
    { onClose = false, keepLogs = false, redStderr = false } = {},
  ): Promise<{ code: number | null; signal: NodeJS.Signals | null; stdout: string }> {
    let stdout = "";
    let stderr = "";
    proc.stdout?.on("data", (data: Buffer) => {
      stdout += data.toString();
      if (keepLogs) this.logs.push(data.toString());
      this.#stdout(data);
    });
    proc.stderr?.on("data", (data: Buffer) => {
      stderr += data.toString();
      if (keepLogs) this.logs.push(data.toString());
      if (redStderr) this.#stderr(data);
      else this.#stdout(data); // 정상로그도 stderr로 나옴
    });
    return new Promise((resolve, reject) => {
      proc.on("error", (cause) =>
        reject(new CommandExecutionError({ ...target, code: null, signal: null, stdout, stderr, cause })),
      );
      proc.on(onClose ? "close" : "exit", (code: number | null, signal: NodeJS.Signals | null) => {
        if ((onClose ? code !== 0 : code) || signal)
          reject(new CommandExecutionError({ ...target, code, signal, stdout, stderr }));
        else resolve({ code, signal, stdout });
      });
    });
  }
  exec(command: string, options: ExecOptions = {}): Promise<unknown> {
    const target = { command, cwd: options.cwd?.toString() ?? this.cwdPath };
    const proc = exec(command, { cwd: this.cwdPath, ...options });
    return this.#settle(proc, target).then(({ code, signal }) => ({ code, signal }));
  }

  spawn(command: string, args: string[] = [], options: SpawnOptions = {}): Promise<string> {
    const target = { command, args, cwd: options.cwd?.toString() ?? this.cwdPath };
    const proc = spawn(command, args, { cwd: this.cwdPath, ...options });
    return this.#settle(proc, target, { onClose: true, keepLogs: true }).then(({ stdout }) => stdout);
  }
  spawnSync(command: string, args: string[] = [], options: SpawnOptions = {}): ChildProcess {
    return spawn(command, args, { cwd: this.cwdPath, ...options });
  }
  fork(modulePath: string, args: string[] = [], options: ForkOptions = {}): Promise<unknown> {
    const target = { command: modulePath, args, cwd: options.cwd?.toString() ?? this.cwdPath };
    const proc = fork(modulePath, args, { cwd: this.cwdPath, ...options });
    return this.#settle(proc, target, { redStderr: true }).then(({ code, signal }) => ({ code, signal }));
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
      return Array.from(glob.scanSync({ cwd: readPath, onlyFiles: false })).sort();
    } catch {
      return [];
    }
  }
  async getAllFiles(pattern = "**/*", { cwd }: { cwd?: string } = {}): Promise<string[]> {
    const glob = new Bun.Glob(pattern);
    return Array.from(glob.scanSync({ cwd: cwd ?? this.cwdPath, onlyFiles: true })).sort();
  }
  async getFilesAndDirs(dirPath: string): Promise<{ files: string[]; dirs: string[] }> {
    const fullDirPath = this.getPath(dirPath);
    const glob = new Bun.Glob("*");
    const files = Array.from(glob.scanSync({ cwd: fullDirPath, onlyFiles: true })).sort();
    const allEntries = Array.from(glob.scanSync({ cwd: fullDirPath, onlyFiles: false })).sort();
    const dirs = allEntries.filter((entry) => !files.includes(entry));
    return { files, dirs };
  }
  async exists(filePath: string) {
    return await FileSys.exists(this.getPath(filePath));
  }
  async remove(filePath: string) {
    const readPath = this.getPath(filePath);
    if (await FileSys.fileExists(readPath)) await FileSys.delete(readPath);
    this.logger.verbose(`Remove file ${readPath}`);
    return this;
  }
  async removeDir(dirPath: string) {
    //* XXX: `path.join(…, ".")` drops a trailing slash: `rm -rf link/` wipes the target, `rm -rf link` only unlinks.
    const readPath = path.join(this.getPath(dirPath), ".");
    if (await FileSys.entryExists(readPath)) await rm(readPath, { recursive: true, force: true });
    this.logger.verbose(`Remove directory ${readPath}`);
    return this;
  }
  async writeFile(
    filePath: string,
    content: string | object,
    { overwrite = true, silent = false }: { overwrite?: boolean; silent?: boolean } = {},
  ): Promise<WrittenFileContent> {
    const writePath = this.getPath(filePath);
    const dir = path.dirname(writePath);
    if (!(await FileSys.dirExists(dir))) await mkdir(dir, { recursive: true });
    let contentStr = typeof content === "string" ? content : JsonFormatter.stringify(content, writePath);
    let written = true;

    if (await FileSys.fileExists(writePath)) {
      const currentContent = await FileSys.readText(writePath);
      if (currentContent === contentStr || !overwrite) {
        this.logger.verbose(`File ${writePath} is unchanged`);
        contentStr = currentContent;
        written = false;
      } else {
        await FileSys.writeText(writePath, contentStr);
        if (Logger.isVerbose()) this.logger.rawLog(chalk.yellow(`File Update: ${filePath}`));
      }
    } else {
      await FileSys.writeText(writePath, contentStr);
      if (!silent) this.logger.rawLog(chalk.green(`File Create: ${filePath}`));
    }
    return { filePath: writePath, content: contentStr, written };
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
    return await FileSys.readText(this.getPath(filePath));
  }
  async readJson(filePath: string) {
    return await FileSys.readJson<object>(this.getPath(filePath));
  }
  async cp(srcPath: string, destPath: string, { dereference = false }: { dereference?: boolean } = {}) {
    const src = this.getPath(srcPath);
    const dest = this.getPath(destPath);
    if (!(await FileSys.exists(src))) return;
    const isDirectory = (await stat(src)).isDirectory();
    if (!(await FileSys.exists(dest)) && isDirectory) await mkdir(dest, { recursive: true });
    //* `cp -r` keeps symlinks on GNU but follows them on macOS; Windows has no `cp -r <dir>/.` and rarely the
    //* privilege a symlink needs, so it always copies real files.
    if (dereference || process.platform === "win32")
      await cpEntry(src, dest, { recursive: isDirectory, dereference: true, force: true });
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
    let tsconfig = (await this.readJson(pathname)) as TsConfigJson;
    if (tsconfig.extends) {
      const base = await this.getTsConfig(tsconfig.extends, { refresh });
      tsconfig = { ...base, ...tsconfig, compilerOptions: { ...base.compilerOptions, ...tsconfig.compilerOptions } };
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
      dryRun = false,
    }: {
      templatePath: string;
      targetPath: string;
      scanInfo?: AppInfo | LibInfo | null;
      overwrite?: boolean;
      dryRun?: boolean;
    },
    dict: { [key: string]: string } = {},
    options: { [key: string]: unknown } = {},
  ): Promise<WrittenFileContent | null> {
    const convertPath = (target: string) =>
      Object.entries(dict).reduce(
        (converted, [key, value]) => converted.replace(new RegExp(`__${key}__`, "g"), value),
        target,
      );
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
      const convertedTargetPath = convertPath(`${path.dirname(targetPath)}/${filename}`);
      if (dryRun) return { filePath: this.getPath(convertedTargetPath), content, written: false };
      this.logger.verbose(`Apply template ${templatePath} to ${convertedTargetPath}`);
      return this.writeFile(convertedTargetPath, content, { overwrite });
    } else if (targetPath.endsWith(".template")) {
      const content = await FileSys.readText(templatePath);
      const convertedTargetPath = convertPath(targetPath.slice(0, -9));
      const convertedContent = Object.entries(dict).reduce(
        (data, [key, value]) => data.replace(new RegExp(`<%= ${key} %>`, "g"), value),
        content,
      );
      if (dryRun) return { filePath: this.getPath(convertedTargetPath), content: convertedContent, written: false };
      this.logger.verbose(`Apply template ${templatePath} to ${convertedTargetPath}`);
      return this.writeFile(convertedTargetPath, convertedContent, { overwrite });
    } else if (staticTemplateFileExtensions.has(path.extname(targetPath).toLowerCase())) {
      const convertedTargetPath = convertPath(targetPath);
      const writePath = this.getPath(convertedTargetPath);
      if (dryRun) return { filePath: writePath, content: "", written: false };
      if (!overwrite && (await FileSys.fileExists(writePath)))
        return { filePath: writePath, content: "", written: false };
      const dirname = path.dirname(writePath);
      if (!(await FileSys.dirExists(dirname))) await mkdir(dirname, { recursive: true });
      await copyFile(templatePath, writePath);
      this.logger.verbose(`Apply template ${templatePath} to ${convertedTargetPath}`);
      return { filePath: writePath, content: "", written: true };
    } else return null;
  }
  async _applyTemplate({
    basePath,
    template,
    scanInfo,
    dict = {},
    options = {},
    overwrite = true,
    dryRun = false,
  }: {
    basePath: string;
    template: string;
    scanInfo?: AppInfo | LibInfo | null;
    dict?: { [key: string]: string };
    options?: { [key: string]: unknown };
    overwrite?: boolean;
    dryRun?: boolean;
  }): Promise<WrittenFileContent[]> {
    const templateRoot = await this.#resolveTemplateRoot();
    const templatePath = `${templateRoot}${template ? `/${template}` : ""}`;
    if ((await stat(templatePath)).isFile()) {
      const fileContent = await this.#applyTemplateFile(
        {
          templatePath,
          targetPath: path.join(basePath, path.basename(templatePath)),
          scanInfo,
          overwrite,
          dryRun,
        },
        dict,
        options,
      );
      return fileContent ? [fileContent] : ([] as WrittenFileContent[]);
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
                  dryRun,
                },
                dict,
                options,
              );
              return fileContent ? [fileContent] : ([] as WrittenFileContent[]);
            } else
              return await this._applyTemplate({
                basePath: path.join(basePath, subdir),
                template: path.join(template, subdir),
                scanInfo,
                dict,
                overwrite,
                dryRun,
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
      path.resolve(getDirname(import.meta.url), "../../cli/templates"),
    ];
    for (const candidate of candidates) {
      if (await FileSys.dirExists(candidate)) return candidate;
    }
    return candidates[0];
  }
  async applyTemplate(options: {
    basePath: string;
    template: string;
    scanInfo?: AppInfo | LibInfo | null;
    dict?: { [key: string]: string };
    options?: { [key: string]: unknown };
    overwrite?: boolean;
    dryRun?: boolean;
  }): Promise<FileContent[]> {
    const fileContents = await this._applyTemplate({ ...options, dict: withCapitalizedDict(options.dict) });
    await this.#formatAppliedTemplate(fileContents.filter((fileContent) => fileContent.written));
    return fileContents;
  }

  // Best-effort: `create-akan-workspace` scaffolds before `bun install`, with no local Biome binary yet, so a
  // template emits Biome's form itself (`templates/biomeForm.ts`).
  async #formatAppliedTemplate(fileContents: FileContent[]) {
    const filePaths = fileContents
      .map((fileContent) => fileContent.filePath)
      .filter((filePath) => filePath.endsWith(".ts") || filePath.endsWith(".tsx"));
    if (filePaths.length === 0) return;
    try {
      const { fixed } = await this.getLinter().fixFiles(filePaths);
      if (fixed.length > 0) this.logger.verbose(`Formatted ${fixed.length} scaffolded file(s)`);
    } catch (err) {
      this.logger.verbose(`Skipped formatting scaffolded files: ${toError(err).message}`);
    }
  }
  // Async so `typescript` (~65MB resident) loads only in the commands that typecheck.
  async getTypeChecker() {
    const { TypeChecker } = await import("../typeChecker");
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
    const entry = await ProjectTypecheck.workerEntry(process.cwd());
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
  getLinter() {
    this.linter ??= new Linter(this.cwdPath);
    return this.linter;
  }
  async lint(
    filePath: string,
    { fix = false, dryRun = false }: { fix?: boolean; dryRun?: boolean } = {},
  ): Promise<{
    results: unknown[];
    message: string;
    errors: unknown[];
    warnings: unknown[];
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
