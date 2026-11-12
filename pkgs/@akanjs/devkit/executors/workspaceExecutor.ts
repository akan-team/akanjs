import { existsSync, readFileSync } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { AkanWorkspaceConfig } from "../akanConfig";
import { FileSys } from "../util/fileSys";
import { resolveRepoName } from "../workspace/repoIdentity";
import { WorkspaceInfo } from "../workspace/scanInfo";
import type { BaseDevEnv, TsConfigJson } from "../workspace/types";
import { Executor, execEmoji } from "./executor";
import { SysExecutor } from "./sysExecutor";

//? As Bun's own .env loader reads it (1.4.4), which fills process.env too: `#` ends an unquoted value even mid-word.
const parseEnvValue = (value: string) => {
  const [, quote, inner] = value.match(/^(["'`])((?:\\.|(?!\1)[^\\])*)\1/) ?? [];
  if (!quote) return value.replace(/#.*/, "").trim();
  if (quote !== '"') return inner;
  return inner.replace(/\\(.)/g, (pair, char: string) => (char === "n" ? "\n" : char === "r" ? "\r" : pair));
};

export const parseEnvFile = (envPath: string): Record<string, string> => {
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
    env[key] = parseEnvValue(normalized.slice(separatorIndex + 1).trim());
  }
  return env;
};

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

  static fromRoot({
    workspaceRoot = process.cwd(),
    repoName = resolveRepoName(workspaceRoot),
  }: {
    workspaceRoot?: string;
    repoName?: string;
  } = {}) {
    return new WorkspaceExecutor({ workspaceRoot, repoName });
  }
  /** The public env a native build was told to reproduce (`--public-env`): it outranks the shell, which outranks `.env`. */
  static publicEnvPin: Record<string, string> | null = null;
  static readonly localServeDomain = "localhost";
  static getBaseDevEnv(envPath?: string) {
    // Bun auto-loads .env, so we use process.env directly
    const sourceEnv = {
      ...(envPath ? parseEnvFile(envPath) : {}),
      //? An empty export reads as unset, unlike in dotenv, so it can't blank a key the .env sets.
      ...Object.fromEntries(Object.entries(process.env).filter(([, value]) => value)),
      ...WorkspaceExecutor.publicEnvPin,
    };

    const appName = sourceEnv.AKAN_PUBLIC_APP_NAME;
    const workspaceRoot = sourceEnv.AKAN_WORKSPACE_ROOT;
    const workspaceId = sourceEnv.AKAN_WORKSPACE_ID;

    const repoName =
      sourceEnv.AKAN_PUBLIC_REPO_NAME ||
      resolveRepoName(envPath ? path.dirname(envPath) : (workspaceRoot ?? process.cwd()));
    const serveDomain = sourceEnv.AKAN_PUBLIC_SERVE_DOMAIN || WorkspaceExecutor.localServeDomain;
    const defaulted = (["AKAN_PUBLIC_REPO_NAME", "AKAN_PUBLIC_SERVE_DOMAIN"] as const).filter((key) => !sourceEnv[key]);

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
      defaulted,
    };
  }
  //? A clone has no `.env` (gitignored for its secrets): it runs local, as a new workspace and env.server.ts do, not debug.
  static defaultCloneToLocalEnv(workspaceRoot: string) {
    if (!existsSync(path.join(workspaceRoot, ".env"))) process.env.AKAN_PUBLIC_ENV ??= "local";
  }
  //? A build or tunnel for a real environment carries these into an image, a bundle or a host name it dials.
  static assertDeployableEnv(baseDevEnv: BaseDevEnv, environment: string, purpose: string) {
    const defaulted = environment === "local" ? [] : (baseDevEnv.defaulted ?? []);
    if (!defaulted.length) return;
    const values = { AKAN_PUBLIC_REPO_NAME: baseDevEnv.repoName, AKAN_PUBLIC_SERVE_DOMAIN: baseDevEnv.serveDomain };
    const standIns = defaulted.map((key) => `${key} (would be "${values[key]}")`).join(" and ");
    throw new Error(
      `${purpose} for the "${environment}" environment needs ${standIns} set, not a local default. ` +
        `Set ${defaulted.length > 1 ? "them" : "it"} in the workspace .env or the shell, or use AKAN_PUBLIC_ENV=local.`,
    );
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
  #akanConfig: AkanWorkspaceConfig | null = null;
  async getConfig({ refresh }: { refresh?: boolean } = {}) {
    if (this.#akanConfig && !refresh) return this.#akanConfig;
    this.#akanConfig = await AkanWorkspaceConfig.from(this, { bustImportCache: refresh });
    return this.#akanConfig;
  }
  async getApps() {
    return await this.#getDirHasFile(`${this.workspaceRoot}/apps`, "akan.config.ts");
  }
  async getLibs() {
    return await this.#getDirHasFile(`${this.workspaceRoot}/libs`, "akan.config.ts");
  }
  async getSyss() {
    const [appNames, libNames] = await Promise.all([this.getApps(), this.getLibs()]);
    return [appNames, libNames] as [string[], string[]];
  }
  async getPkgs() {
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
  async commit(
    message: string,
    {
      init = false,
      add = true,
      identity,
    }: { init?: boolean; add?: boolean; identity?: { name: string; email: string } } = {},
  ) {
    if (init) await this.spawn("git", ["init", "--quiet"]);
    if (add) await this.spawn("git", ["add", "."]);
    const author = identity ? ["-c", `user.name=${identity.name}`, "-c", `user.email=${identity.email}`] : [];
    // Argument vector, not a shell string: a message carrying a double quote breaks the interpolated form.
    await this.spawn("git", [...author, "commit", "--quiet", "-m", message]);
  }
  /** `git commit` exits non-zero on an empty index, so a re-runnable caller has to ask first. */
  async hasChanges() {
    return !!(await this.spawn("git", ["status", "--porcelain"])).trim();
  }
  /** Sorted workspace-relative paths; `untracked` adds uncommitted files, still honoring `.gitignore`. */
  async listGitFiles(paths: string[], { untracked = false }: { untracked?: boolean } = {}) {
    if (!paths.length) return [];
    const mode = untracked ? ["--cached", "--others", "--exclude-standard"] : ["--cached"];
    const stdout = await this.spawn("git", ["ls-files", "-z", ...mode, "--", ...paths]);
    return stdout
      .split("\0")
      .filter((file) => !!file)
      .sort();
  }
  async #getDirHasFile(basePath: string, targetFilename: string) {
    if (!(await FileSys.dirExists(basePath))) return [];
    //? `local/` is gitignored scratch: a test's temporary workspace there has a package.json of its own.
    const AVOID_DIRS = ["node_modules", "dist", "public", "webkit", "local"];
    const getDirs = async (dirname: string, maxDepth = 3, results: string[] = [], prefix = "") => {
      const dirs = await this.readdir(dirname);
      await Promise.all(
        dirs.map(async (dir) => {
          if (AVOID_DIRS.includes(dir)) return;
          const dirPath = path.join(dirname, dir);
          //* Not `stat`: a dangling symlink would throw, and this walk backs `getApps`, i.e. every command.
          if (await FileSys.dirExists(dirPath)) {
            const hasTargetFile = await FileSys.fileExists(path.join(dirPath, targetFilename));
            if (hasTargetFile) results.push(`${prefix}${dir}`);
            if (maxDepth > 0) await getDirs(dirPath, maxDepth - 1, results, `${prefix}${dir}/`);
          }
        }),
      );
      return results;
    };
    return (await getDirs(basePath)).sort((a, b) => a.localeCompare(b));
  }

  async #fromEverySys<T>(read: (sys: SysExecutor) => Promise<T[]>): Promise<T[]> {
    const [appNames, libNames] = await this.getSyss();
    //? Plain SysExecutors: AppExecutor and LibExecutor extend SysExecutor, which imports this file, so importing them here
    //? would load a subclass before its base. None of the readers below is overridden there.
    const fromApps = await Promise.all(
      appNames.map((name) => read(new SysExecutor({ workspace: this, name, type: "app" }))),
    );
    const fromLibs = await Promise.all(
      libNames.map((name) => read(new SysExecutor({ workspace: this, name, type: "lib" }))),
    );
    return [...fromApps.flat(), ...fromLibs.flat()];
  }
  async getScalarConstantFiles() {
    return await this.#fromEverySys((sys) => sys.getScalarConstantFiles());
  }
  async getConstantFiles() {
    return await this.#fromEverySys((sys) => sys.getConstantFiles());
  }
  async getDictionaryFiles() {
    return await this.#fromEverySys((sys) => sys.getDictionaryFiles());
  }
  async getViewFiles() {
    return await this.#fromEverySys((sys) => sys.getViewsSourceCode());
  }
}
