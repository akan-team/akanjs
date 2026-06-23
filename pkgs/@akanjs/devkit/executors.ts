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
import { copyFile, mkdir, readdir as readDirEntries, stat } from "node:fs/promises";
import path from "node:path";
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
import ts from "typescript";
import { AkanAppConfig, AkanLibConfig, decreaseBuildNum, increaseBuildNum } from "./akanConfig";
import { FileSys } from "./fileSys";
import { getDirname } from "./getDirname";
import { Linter } from "./linter";
import { AppInfo, LibInfo, PkgInfo, WorkspaceInfo } from "./scanInfo";
import { Spinner } from "./spinner";
import { TypeChecker } from "./typeChecker";
import type { FileContent, PackageJson, TsConfigJson } from "./types";

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

const PAGE_ROUTE_EXPORTS = new Set([
  "default",
  "pageConfig",
  "head",
  "metadata",
  "generateHead",
  "generateMetadata",
  "Loading",
]);
const ROOT_LAYOUT_EXPORTS = new Set([
  "default",
  "pageConfig",
  "head",
  "metadata",
  "generateHead",
  "generateMetadata",
  "fonts",
  "manifest",
  "theme",
  "reconnect",
  "layoutStyle",
  "gaTrackingId",
  "Loading",
  "NotFound",
  "Error",
]);
const LAYOUT_ROUTE_EXPORTS = new Set([
  "default",
  "pageConfig",
  "head",
  "metadata",
  "generateHead",
  "generateMetadata",
  "Loading",
  "NotFound",
  "Error",
]);

function validateRouteSourceExports(
  source: string,
  filePath: string,
  kind: "page" | "layout",
  options: { rootLayout?: boolean } = {},
) {
  const sourceFile = ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const allowed =
    kind === "page" ? PAGE_ROUTE_EXPORTS : options.rootLayout ? ROOT_LAYOUT_EXPORTS : LAYOUT_ROUTE_EXPORTS;
  const exported = new Set<string>();
  const assertExport = (name: string) => {
    if (!allowed.has(name)) {
      throw new Error(`[route-convention] unsupported export "${name}" in ${filePath}`);
    }
    exported.add(name);
  };

  for (const statement of sourceFile.statements) {
    if (ts.isInterfaceDeclaration(statement) || ts.isTypeAliasDeclaration(statement)) continue;
    if (ts.isExportDeclaration(statement)) {
      if (statement.isTypeOnly) continue;
      const clause = statement.exportClause;
      if (!clause) throw new Error(`[route-convention] export * is not allowed in route modules: ${filePath}`);
      if (ts.isNamedExports(clause)) {
        for (const element of clause.elements) {
          if (element.isTypeOnly) continue;
          assertExport(element.name.text);
        }
      }
      continue;
    }
    const modifiers = ts.canHaveModifiers(statement) ? ts.getModifiers(statement) : undefined;
    const isExported = modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) ?? false;
    if (!isExported) continue;
    const isDefault = modifiers?.some((m) => m.kind === ts.SyntaxKind.DefaultKeyword) ?? false;
    if (isDefault) {
      assertExport("default");
      continue;
    }
    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name)) assertExport(declaration.name.text);
      }
      continue;
    }
    const name = (statement as unknown as { name?: ts.Node }).name;
    if (name && ts.isIdentifier(name)) {
      assertExport(name.text);
    }
  }
  if (exported.has("head") && exported.has("generateHead")) {
    throw new Error(`[route-convention] head and generateHead cannot both be exported in ${filePath}`);
  }
  if (
    !options.rootLayout &&
    (exported.has("head") || exported.has("generateHead")) &&
    (exported.has("metadata") || exported.has("generateMetadata"))
  ) {
    throw new Error(
      `[route-convention] head/generateHead and metadata/generateMetadata cannot both be exported in ${filePath}`,
    );
  }
  if (exported.has("metadata") && exported.has("generateMetadata")) {
    throw new Error(`[route-convention] metadata and generateMetadata cannot both be exported in ${filePath}`);
  }
}

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
    const readPath = this.getPath(dirPath);
    if (await FileSys.dirExists(readPath)) await $`rm -rf ${readPath}`;
    this.logger.verbose(`Remove directory ${readPath}`);
    return this;
  }
  async writeFile(
    filePath: string,
    content: string | object,
    { overwrite = true }: { overwrite?: boolean } = {},
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
      this.logger.rawLog(chalk.green(`File Create: ${filePath}`));
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
  async cp(srcPath: string, destPath: string) {
    const src = this.getPath(srcPath);
    const dest = this.getPath(destPath);
    if (!(await FileSys.exists(src))) return;
    const isDirectory = (await stat(src)).isDirectory();
    if (!(await FileSys.exists(dest)) && isDirectory) await mkdir(dest, { recursive: true });
    await $`cp -r ${src}${isDirectory ? "/." : ""} ${dest}`;
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
    options: { [key: string]: any } = {},
  ): Promise<FileContent | null> {
    if (targetPath.endsWith(".ts") || targetPath.endsWith(".tsx")) {
      const getContent = (await import(templatePath)) as {
        default: (
          scanInfo: AppInfo | LibInfo | null,
          dict: { [key: string]: string },
          options?: { [key: string]: any },
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
    options?: { [key: string]: any };
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
    options?: { [key: string]: any };
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
    results: any[]; // ESLint.LintResult[];
    message: string;
    errors: any[]; // ESLintLinter.LintMessage[];
    warnings: any[]; // ESLintLinter.LintMessage[];
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
          if ((await stat(dirPath)).isDirectory()) {
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

const scanFacetDirs = ["ui", "webkit", "srvkit", "common"] as const;

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
      .filter((name) => Bun.file(`${this.cwdPath}/lib/${name}/${name}.View.tsx`).exists());
    return viewComponents;
  }

  async getUnitComponents() {
    const unitComponents = (await this.readdir("lib"))
      .filter((name) => !name.startsWith("_") && !name.startsWith("__") && !name.endsWith(".ts"))
      .filter((name) => Bun.file(`${this.cwdPath}/lib/${name}/${name}.Unit.tsx`).exists());
    return unitComponents;
  }
  async getTemplateComponents() {
    const templateComponents = (await this.readdir("lib"))
      .filter((name) => !name.startsWith("_") && !name.startsWith("__") && !name.endsWith(".ts"))
      .filter((name) => Bun.file(`${this.cwdPath}/lib/${name}/${name}.Template.tsx`).exists());
    return templateComponents;
  }

  async getViewsSourceCode() {
    const viewComponents = await this.getViewComponents();
    return Promise.all(
      viewComponents.map((viewComponent) => this.getLocalFile(`lib/${viewComponent}/${viewComponent}.View.tsx`)),
    );
  }
  async getUnitsSourceCode() {
    const unitComponents = await this.getUnitComponents();
    return Promise.all(
      unitComponents.map((unitComponent) => this.getLocalFile(`lib/${unitComponent}/${unitComponent}.Unit.tsx`)),
    );
  }
  async getTemplatesSourceCode() {
    const templateComponents = await this.getTemplateComponents();
    return Promise.all(
      templateComponents.map((templateComponent) =>
        this.getLocalFile(`lib/${templateComponent}/${templateComponent}.Template.tsx`),
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
  async getDevPort() {
    const basePort = 8282;
    const appNames = (await this.workspace.getApps()).sort((a, b) => a.localeCompare(b));
    const appIndex = Math.max(appNames.indexOf(this.name), 0);
    const portOffset = WorkspaceExecutor.getBaseDevEnv().portOffset;
    return basePort + appIndex + portOffset;
  }
  getCommandEnv(env: Record<string, string> = {}): Record<string, string> {
    const basePort = 8282;
    const portOffset = WorkspaceExecutor.getBaseDevEnv().portOffset;
    const PORT = basePort ? (basePort + portOffset).toString() : undefined;
    const AKAN_PUBLIC_SERVER_PORT = portOffset ? (8282 + portOffset).toString() : undefined;
    return {
      ...process.env,
      AKAN_PUBLIC_APP_NAME: this.name,
      AKAN_WORKSPACE_ROOT: this.workspace.workspaceRoot,
      NODE_NO_WARNINGS: "1",
      ...(PORT ? { PORT, AKAN_PUBLIC_CLIENT_PORT: PORT } : {}),
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
      if (await this.exists(this.dist.cwdPath)) await this.dist.exec(`rm -rf ${this.dist.cwdPath}`);
      await Promise.all([this.dist.mkdir("private"), this.dist.mkdir("public")]);
      await Promise.all([
        this.cp("private", `${this.dist.cwdPath}/private`),
        this.cp("public", `${this.dist.cwdPath}/public`),
      ]);
    } else await this.removeDir(".akan");
    const devPort = type === "start" ? (await this.getDevPort()).toString() : undefined;
    const env = this.getCommandEnv({
      AKAN_COMMAND_TYPE: type,
      ...routeEnv,
      ...(devPort ? { PORT: devPort, AKAN_PUBLIC_CLIENT_PORT: devPort, AKAN_PUBLIC_SERVER_PORT: devPort } : {}),
    });
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
    this.#akanConfig = await AkanAppConfig.from(this);
    return this.#akanConfig;
  }

  #pageKeys: string[] | null = null;
  async getPageKeys({ refresh }: { refresh?: boolean } = {}): Promise<string[]> {
    if (this.#pageKeys && !refresh) return this.#pageKeys;
    const akanConfig = await this.getConfig();
    const glob = new Bun.Glob("**/*");
    const pageKeys: string[] = [];
    const pageDir = `${this.cwdPath}/page`;
    if (!(await FileSys.dirExists(pageDir))) {
      this.#pageKeys = [];
      return this.#pageKeys;
    }
    for await (const rel of glob.scan({
      cwd: pageDir,
      absolute: false,
      onlyFiles: true,
    })) {
      const segments = rel.split(path.sep);
      if (segments.some((s) => s === "node_modules")) continue;
      const posix = segments.join("/");
      const absPath = path.join(pageDir, posix);
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
      const isRootLayout = parsed.kind === "layout" && parsed.moduleSegments.at(-1) === "_layout";
      validateRouteSourceExports(await Bun.file(absPath).text(), absPath, parsed.kind, { rootLayout: isRootLayout });
      pageKeys.push(key);
    }
    pageKeys.sort();
    this.#pageKeys = pageKeys;
    return this.#pageKeys;
  }
  setPageKeys(pageKeys: string[]) {
    this.#pageKeys = pageKeys;
  }

  async syncAssets(libDeps: string[]) {
    const projectPublicPath = `${this.cwdPath}/public`;
    const projectAssetsPath = `${this.cwdPath}/private`;
    const projectPublicLibPath = `${projectPublicPath}/libs`;
    const projectAssetsLibPath = `${projectAssetsPath}/libs`;
    await Promise.all([this.removeDir(projectPublicLibPath), this.removeDir(projectAssetsLibPath)]);
    const targetPublicDeps = [] as string[];
    for (const dep of libDeps) {
      if (await this.exists(`${this.workspace.workspaceRoot}/libs/${dep}/public`)) targetPublicDeps.push(dep);
    }
    const targetAssetsDeps = [] as string[];
    for (const dep of libDeps) {
      if (await this.exists(`${this.workspace.workspaceRoot}/libs/${dep}/private`)) targetAssetsDeps.push(dep);
    }
    await Promise.all(targetPublicDeps.map((dep) => this.mkdir(`${projectPublicLibPath}/${dep}`)));
    await Promise.all(targetAssetsDeps.map((dep) => this.mkdir(`${projectAssetsLibPath}/${dep}`)));
    await Promise.all([
      ...targetPublicDeps.map((dep) =>
        this.cp(`${this.workspace.workspaceRoot}/libs/${dep}/public`, `${projectPublicLibPath}/${dep}`),
      ),
      ...targetAssetsDeps.map((dep) =>
        this.cp(`${this.workspace.workspaceRoot}/libs/${dep}/private`, `${projectAssetsLibPath}/${dep}`),
      ),
    ]);
  }
  async scanSync({ refresh = false, write = true }: { refresh?: boolean; write?: boolean } = {}) {
    const scanInfo = (await this.scan({
      refresh,
      write,
      writeLib: write,
    })) as AppInfo;
    if (write) await this.syncAssets(scanInfo.getScanResult().libDeps);
    return scanInfo;
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
