import { cp as cpEntry, lstat, mkdir, readdir as readDirEntries, realpath, symlink } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { AkanPlugin, AkanSyncContext } from "akanjs";
import { isRouteSourceFile, parseRouteModuleKey, validatePageSourceFile, validateSubRoutePageKey } from "akanjs/common";
import { AkanAppConfig, decreaseBuildNum, increaseBuildNum } from "../akanConfig";
import type { RouteSourceInfo } from "../app/routeSourceValidator";
import { getRootBoundarySegments, isRootBoundarySegments } from "../artifact/implicitRootLayout";
import { FileSys } from "../util/fileSys";
import type { AppInfo } from "../workspace/scanInfo";
import { Executor, execEmoji } from "./executor";
import { LibExecutor } from "./libExecutor";
import { type NamedExecutorOptions, SysExecutor } from "./sysExecutor";
import { WorkspaceExecutor } from "./workspaceExecutor";

export interface PageRoot {
  /** App-relative location of the route files, i.e. the symlink for a synced lib. */
  dir: string;
  /** Where the files actually live, which is what a file watcher reports. */
  realDir: string;
  /** Prefix that turns a `dir`-relative path into an app page key (empty for the app's own `page`). */
  keyPrefix: string;
}

export interface AppRouteSource {
  key: string;
  absPath: string;
  info: RouteSourceInfo;
}

export class AppExecutor extends SysExecutor {
  // Lazy: the validator pulls in `typescript` (~65MB resident).
  static #routeSourceValidator: typeof import("../app/routeSourceValidator").RouteSourceValidator | null = null;
  static async #getRouteSourceValidator() {
    AppExecutor.#routeSourceValidator ??= (await import("../app/routeSourceValidator")).RouteSourceValidator;
    return AppExecutor.#routeSourceValidator;
  }
  dist: Executor;
  override emoji = execEmoji.app;
  constructor({ workspace, name }: NamedExecutorOptions) {
    super({ workspace, name, type: "app" });
    this.dist = new Executor(`dist/${name}`, `${this.workspace.workspaceRoot}/dist/apps/${name}`);
  }
  static from(executor: SysExecutor | WorkspaceExecutor, name: string) {
    return new AppExecutor({ workspace: executor instanceof WorkspaceExecutor ? executor : executor.workspace, name });
  }
  //* Not dev output: the downloaded `bin` sources.
  static readonly #keptOnStart = [path.join(".akan", "cache", "bin")];
  //* Native builds moved to dist/native/<app>; the old folder may hold a signed release nobody uploaded yet.
  static readonly #legacyNative = path.join(".akan", "native");
  async #removeDevOutput(dir = ".akan") {
    const entries = await readDirEntries(this.getPath(dir)).catch(() => [] as string[]);
    await Promise.all(
      entries.map(async (name) => {
        const entry = path.join(dir, name);
        if (entry === AppExecutor.#legacyNative) {
          this.logger.warn(
            `apps/${this.name}/.akan/native holds native builds from before they moved to dist/native/${this.name}: upload any release waiting in its updates folders, then delete it.`,
          );
          return;
        }
        if (AppExecutor.#keptOnStart.includes(entry)) return;
        if (AppExecutor.#keptOnStart.some((kept) => kept.startsWith(`${entry}${path.sep}`)))
          return await this.#removeDevOutput(entry);
        await this.removeDir(entry);
      }),
    );
  }
  getEnv() {
    return WorkspaceExecutor.getBaseDevEnv().env;
  }
  /** `AKAN_DEV_PORT` pins it; the derived port moves whenever an app directory appears or disappears. */
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
    const { portOffset, repoName, serveDomain } = WorkspaceExecutor.getBaseDevEnv();
    const PORT = (8282 + portOffset).toString();
    return {
      ...process.env,
      AKAN_PUBLIC_REPO_NAME: repoName,
      AKAN_PUBLIC_SERVE_DOMAIN: serveDomain,
      AKAN_PUBLIC_APP_NAME: this.name,
      AKAN_WORKSPACE_ROOT: this.workspace.workspaceRoot,
      NODE_NO_WARNINGS: "1",
      PORT,
      AKAN_PUBLIC_CLIENT_PORT: PORT,
      ...(portOffset ? { AKAN_PUBLIC_SERVER_PORT: PORT } : {}),
      ...env,
    };
  }
  async getDatabaseModeEnv() {
    const akanConfig = await this.getConfig();
    return {
      AKAN_DATABASE_MODE: akanConfig.resolveDatabaseMode(),
      AKAN_DATABASE_MODES: akanConfig.database.modes.join(","),
    };
  }
  async prepareCommand(type: "build" | "start") {
    const akanConfig = await this.getConfig();
    const routeEnv = {
      AKAN_PUBLIC_BASE_PATHS: [...akanConfig.basePaths].join(","),
      AKAN_PUBLIC_API_PREFIX: akanConfig.api.prefix,
      AKAN_PUBLIC_WS_PREFIX: akanConfig.api.websocketPrefix,
      ...(await this.getDatabaseModeEnv()),
    };
    Object.assign(process.env, routeEnv);
    if (type === "build") {
      //* `scanSync` read the route set unfiltered; drop the cache so build phases re-read it without dev-only routes.
      this.#excludeDevOnlyPages = true;
      this.#pageKeys = null;
      await this.dist.removeDir(this.dist.cwdPath);
      await Promise.all([this.dist.mkdir("private"), this.dist.mkdir("public")]);
      //* Lib assets are symlinks, which neither the docker context nor the release tarball follows out of dist.
      //* Only the web router reads `public/`, so an api-only build leaves it out.
      await Promise.all([
        this.cp("private", `${this.dist.cwdPath}/private`, { dereference: true }),
        ...(akanConfig.web.ssr ? [this.cp("public", `${this.dist.cwdPath}/public`, { dereference: true })] : []),
      ]);
    } else {
      await this.#removeDevOutput();
      //? `akan start` keeps the full dev surface: the incremental builder is also the file watcher.
      if (!akanConfig.web.ssr || !akanConfig.web.csr)
        this.logger.verbose(
          `akan.config.ts disables web.${!akanConfig.web.ssr ? "ssr" : "csr"}; \`akan start\` still serves it, \`akan build\` will not`,
        );
    }
    //? Bun auto-loads `.env`, so NODE_ENV=production can arrive unexported and send the dev server to the production
    //? route cache. Set on `process.env` because the builder runs here and bakes NODE_ENV into its bundles.
    if (type === "start") process.env.NODE_ENV = "development";
    const devPort = type === "start" ? (await this.getDevPort()).toString() : undefined;
    const env = this.getCommandEnv({
      AKAN_COMMAND_TYPE: type,
      ...routeEnv,
      ...(devPort ? { PORT: devPort, AKAN_PUBLIC_CLIENT_PORT: devPort, AKAN_PUBLIC_SERVER_PORT: devPort } : {}),
    });
    // `build` runs its phases in this process, so the env is published here (only AKAN_PUBLIC_* reaches bundles).
    // Ports and the operation mode are dropped: `define` would bake them in and outrank the container's own values.
    if (type === "build") {
      const buildEnv = { ...env };
      for (const key of ["AKAN_PUBLIC_CLIENT_PORT", "AKAN_PUBLIC_SERVER_PORT", "AKAN_PUBLIC_OPERATION_MODE"]) {
        delete buildEnv[key];
        delete process.env[key];
      }
      Object.assign(process.env, buildEnv);
    }
    return { env };
  }
  #publicEnv: Record<string, string> | null = null;
  getPublicEnv(...patterns: string[]) {
    if (this.#publicEnv) return this.#publicEnv;
    const searchPatterns = [...patterns, "AKAN_PUBLIC_*"];
    const regexes = searchPatterns.map(
      (pattern) =>
        new RegExp(
          `^${pattern
            .split("*")
            .map((part) => part.replace(/[.+^${}()|[\]\\?]/g, "\\$&"))
            .join(".*")}$`,
        ),
    );
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
    this.#akanConfig = await AkanAppConfig.from(this, { bustImportCache: refresh });
    return this.#akanConfig;
  }

  #pageKeys: string[] | null = null;
  #routeSources: AppRouteSource[] = [];
  #excludeDevOnlyPages = false;
  async getPageKeys({ refresh }: { refresh?: boolean } = {}): Promise<string[]> {
    if (this.#pageKeys && !refresh) return this.#pageKeys;
    const akanConfig = await this.getConfig();
    const glob = new Bun.Glob("**/*");
    const pageKeys: string[] = [];
    const owners = new Map<string, { absPath: string; fromLib: boolean }>();
    const devOnlyKeys = new Set<string>();
    const devOnlyDirs: string[] = [];
    const pageRoots = await this.getPageRoots();
    const routeSources: AppRouteSource[] = [];
    const libKeyPrefixes = pageRoots.map((root) => root.keyPrefix).filter(Boolean);
    for (const root of pageRoots) {
      if (!(await FileSys.dirExists(root.dir))) continue;
      for await (const rel of glob.scan({
        cwd: root.dir,
        absolute: false,
        onlyFiles: true,
      })) {
        const segments = rel.split(path.sep);
        if (segments.some((s) => s === "node_modules")) continue;
        const posix = `${root.keyPrefix}${segments.join("/")}`;
        //* A lib folder that is a copy rather than a link (the Windows fallback) is walked into from `page` too.
        if (!root.keyPrefix && libKeyPrefixes.some((prefix) => posix.startsWith(prefix))) continue;
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
        //* App-owned routes may collide (two groups, one pattern); a synced lib cannot see the other side.
        if (owner && (owner.fromLib || fromLib)) {
          throw new Error(
            `[route-convention] duplicate ${parsed.kind} route "${parsed.pattern}" in app "${this.name}":\n- ${owner.absPath}\n- ${absPath}`,
          );
        }
        if (!owner) owners.set(routeId, { absPath, fromLib });
        const layoutSegments = getRootBoundarySegments(key);
        const isRootLayout = layoutSegments !== null && isRootBoundarySegments(layoutSegments, akanConfig.basePaths);
        const routeSource = await Bun.file(absPath).text();
        const validator = await AppExecutor.#getRouteSourceValidator();
        if (parsed.kind === "overrides") validator.validateOverridesSourceExports(routeSource, absPath);
        else {
          const info = validator.validateRouteSourceExports(routeSource, absPath, parsed.kind, {
            rootLayout: isRootLayout,
            pattern: parsed.pattern,
          });
          routeSources.push({ key, absPath, info });
          if (info.devOnly) {
            devOnlyKeys.add(key);
            //* A dev-only layout takes its whole subtree, or its pages would ship without their chrome.
            if (parsed.kind === "layout") devOnlyDirs.push(key.replace(/[^/]+$/, ""));
          }
        }
        pageKeys.push(key);
      }
    }
    pageKeys.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    this.#routeSources = routeSources.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
    this.#pageKeys = this.#excludeDevOnlyPages ? this.#dropDevOnlyPages(pageKeys, devOnlyKeys, devOnlyDirs) : pageKeys;
    return this.#pageKeys;
  }
  /** Each page and layout file `getPageKeys` read, with what its chain declares; overrides files are not listed. */
  async getRouteSources({ refresh }: { refresh?: boolean } = {}): Promise<AppRouteSource[]> {
    await this.getPageKeys({ refresh });
    return this.#routeSources;
  }
  #dropDevOnlyPages(pageKeys: string[], devOnlyKeys: Set<string>, devOnlyDirs: string[]): string[] {
    if (!devOnlyKeys.size) return pageKeys;
    const isDevOnly = (key: string) => devOnlyKeys.has(key) || devOnlyDirs.some((dir) => key.startsWith(dir));
    const dropped = pageKeys.filter(isDevOnly);
    this.verbose(`[route] excluded ${dropped.length} dev-only route file(s) from the build: ${dropped.join(", ")}`);
    return pageKeys.filter((key) => !isDevOnly(key));
  }
  /** Lib roots are the `syncPages` symlinks, listed because neither Bun's glob nor TS `include` crosses one. */
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
  static #pageLibParents(basePaths: Iterable<string>): string[] {
    const parents = [...basePaths].map((basePath) => `${basePath}/`);
    return parents.length ? parents : [""];
  }
  /** Whether the linked page set changed, which makes the app's route keys stale. */
  async syncPages(libDeps: string[]): Promise<boolean> {
    const akanConfig = await this.getConfig();
    const parents = AppExecutor.#pageLibParents(akanConfig.basePaths);
    const libs = await this.#resolvePageLibs(akanConfig.syncPageLibs, libDeps);
    //* Not `getPageRoots`: it drops links whose target is gone, exactly the ones a sync must clean up.
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
    //* A copy — the Windows fallback when a junction is refused — does not follow its lib, so only links are current.
    const isLink = async (key: string) =>
      (await lstat(`${this.cwdPath}/page/${key.slice(0, -1)}`).catch(() => null))?.isSymbolicLink() ?? false;
    if (linked.sort().join(",") === wanted.sort().join(",") && (await Promise.all(linked.map(isLink))).every(Boolean))
      return false;
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
    //* Relative, so it survives a remount (containers, CI); a Windows junction needs an absolute target.
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
      readFile: (rel) => this.readFile(rel),
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
  async increaseBuildNum() {
    await increaseBuildNum(this);
  }
  async decreaseBuildNum() {
    await decreaseBuildNum(this);
  }
}
