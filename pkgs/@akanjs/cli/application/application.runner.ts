import path from "node:path";
import { AkanAppHost, type DevHostEvent } from "@akanjs/devkit/akanApp";
import type { DatabaseMode, MobileEnv } from "@akanjs/devkit/akanConfig";
import type { BuildProgressReporter, BuildResult, TypecheckOptions } from "@akanjs/devkit/applicationBuildRunner";
import { resolveSignalTestPreloadPath } from "@akanjs/devkit/applicationTestPreload";
import { type App, type Exec, runner, type Workspace } from "@akanjs/devkit/commandDecorators";
import { AppExecutor, LibExecutor } from "@akanjs/devkit/executors";
import type { DevStdioMode } from "@akanjs/devkit/incrementalBuilder";
import {
  DesktopServerStage,
  NativeApp,
  type NativePlatform,
  type ResolvedMobileTarget,
  resolveMobileTargets,
} from "@akanjs/devkit/mobile";
import { SlicePlanner } from "@akanjs/devkit/slicePlanner";
import { Logger, type LogRecord } from "akanjs/common";
import { openBrowser } from "../openBrowser";
import type { InterruptTeardown } from "./interruptTeardown";

export interface LogsOptions {
  level?: string | null;
  grep?: string | null;
  endpoint?: string | null;
  trace?: string | null;
  child?: string | null;
  role?: string | null;
  origin?: string | null;
  since?: string | null;
  replay?: number;
  json?: boolean;
  follow?: boolean;
  runtimeDir?: string | null;
}
export interface MobileTargetOptions {
  target?: string;
  env?: MobileEnv;
}
export interface MobileBuildOptions extends MobileTargetOptions {
  profile?: "debug" | "release";
  /** A desktop build that carries the app's server. */
  server?: boolean;
}
export interface MobileStartOptions extends MobileTargetOptions {
  operation?: "local" | "release";
  /** A simulator, emulator or device: its id or name, as `akan-native devices` lists them. */
  device?: string;
  /** Narrows an iPhone's signing to one Apple team. */
  teamId?: string;
  /** A desktop release build that carries the app's server. */
  server?: boolean;
  /** Stops a dev session along with what the caller started for it, instead of this command's own Ctrl+C exit. */
  interrupt?: InterruptTeardown;
}
export interface IosReleaseOptions extends MobileTargetOptions {
  teamId?: string;
  adHoc?: boolean;
}

// Lazy, so the `akan start` hot path never loads the build, mobile and prompt stacks.
const loadBuildRunner = async () => (await import("@akanjs/devkit/applicationBuildRunner")).ApplicationBuildRunner;
const loadPrompts = async () => await import("@inquirer/prompts");

export class ApplicationRunner extends runner("application") {
  async createApplication(appName: string, workspace: Workspace, libs: string[] = []) {
    await workspace.applyTemplate({
      basePath: `apps/${appName}`,
      template: "app",
      dict: { appName },
      options: { libs },
    });
    return AppExecutor.from(workspace, appName);
  }
  async planSlice(app: App) {
    return await new SlicePlanner(app).plan();
  }
  async removeApplication(app: App) {
    await app.workspace.removeDir(`apps/${app.name}`);
  }

  async getScriptFilename(app: App) {
    if (!(await app.exists("script"))) {
      await app.mkdir("script");
      throw new Error(`No script files found. make a script file in apps/${app.name}/script folder`);
    }
    const scriptFiles = (await app.readdir("script")).filter((file) => file.endsWith(".ts"));
    const scriptFile = await (await loadPrompts()).select({
      message: "Select script to run",
      choices: scriptFiles.map((file) => ({ name: file, value: file.replace(".ts", "") })),
    });
    return scriptFile;
  }
  async runScript(app: App, filename: string) {
    const scriptName = filename.endsWith(".ts") ? filename.slice(0, -3) : filename;
    if (scriptName.includes("/") || scriptName.includes("\\") || scriptName.includes("..")) {
      throw new Error(`Invalid script filename: ${filename}`);
    }
    const scriptPath = `script/${scriptName}.ts`;
    if (!(await app.exists(scriptPath))) throw new Error(`Script file not found: apps/${app.name}/${scriptPath}`);
    await app.spawn("bun", [scriptPath], {
      env: app.getCommandEnv({ AKAN_COMMAND_TYPE: "script", ...(await app.getDatabaseModeEnv()) }),
      stdio: "inherit",
    });
  }
  // Must match what `resolveRuntimeDir` answers from the workspace root.
  #runtimeDirOf(app: App, override?: string | null) {
    return path.resolve(
      override ??
        process.env.AKAN_RUNTIME_DIR ??
        path.join(app.workspace.workspaceRoot, "local", "apps", app.name, "runtime"),
    );
  }
  async runLogs(app: App, options: LogsOptions) {
    const { LogControlUnavailableError, LogTailClient } = await import("akanjs/server/logging/logTailClient");
    const { LogQueryMatcher } = await import("akanjs/server/logging/logQuery");
    const runtimeDir = this.#runtimeDirOf(app, options.runtimeDir);
    const socketPath = LogTailClient.socketPath(runtimeDir);
    const { level, grep, endpoint, trace, child, role, origin, since } = options;
    const query = Object.fromEntries(
      Object.entries({ level, grep, endpoint, trace, child, role, origin, since }).filter(
        ([, value]) => value !== undefined && value !== null && value !== "",
      ),
    ) as Record<string, string>;
    const print = (record: LogRecord) =>
      process.stdout.write(options.json ? `${JSON.stringify(record)}\n` : Logger.render(record));
    const note = (text: string) => process.stderr.write(`[akan logs] ${text}\n`);
    const { promise: closed, resolve: finish } = Promise.withResolvers<void>();
    let client: Awaited<ReturnType<typeof LogTailClient.connect>>;
    try {
      client = await LogTailClient.connect(socketPath, {
        onRecord: (entry) => print(entry.record),
        onEvent: (response) => {
          if (response.type === "dropped") note(`${response.count} records dropped (reader too slow)`);
        },
        onClose: () => finish(),
      });
    } catch (error) {
      if (error instanceof LogControlUnavailableError)
        throw new Error(
          `${app.name} is not running (no ${path.basename(socketPath)} in ${runtimeDir}). Start it with \`akan start ${app.name}\`, or pass --runtime-dir for a built app.`,
        );
      throw error;
    }
    const sinceMs = since ? LogQueryMatcher.parseSince(since) : undefined;
    const noteCoverage = (coverage: { from: number | null; count: number }) => {
      if (sinceMs !== undefined && coverage.from !== null && sinceMs < coverage.from)
        note(
          `${LogTailClient.describeCoverage(coverage as Parameters<typeof LogTailClient.describeCoverage>[0])}; older records are not retained`,
        );
    };
    if (endpoint) note("requests served by the primitive query fast path carry no endpoint and are not shown");
    if (options.follow === false) {
      const { entries, coverage } = await client.history({
        ...query,
        ...(options.replay ? { limit: options.replay } : {}),
      });
      for (const entry of entries) print(entry.record);
      noteCoverage(coverage);
      client.close();
      return;
    }
    const subscribed = await client.subscribe(query, { replay: options.replay });
    noteCoverage(subscribed.coverage);
    const stop = () => client.close();
    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
    await closed;
  }
  async runConsole(app: App) {
    const serverPath = `${app.cwdPath}/server.ts`;
    if (!(await app.exists("server.ts"))) throw new Error(`Server file not found: apps/${app.name}/server.ts`);
    const runtimeDir = this.#runtimeDirOf(app);
    const code = `
const serverModule = await import(${JSON.stringify(serverPath)});
const { assertAkanConsoleAllowed, startAkanConsole } = await import("akanjs/server");
const server = serverModule.server;
if (!server?.start) throw new Error("server.ts must export server with start()");
assertAkanConsoleAllowed();
await server.start({ listen: false, web: false });
try {
  await startAkanConsole(server, {
    runtimeDir: ${JSON.stringify(runtimeDir)},
    globals: {
      srv: serverModule.srv,
      sig: serverModule.sig,
      db: serverModule.db,
      cnst: serverModule.cnst,
      dict: serverModule.dict,
      option: serverModule.option,
    },
  });
} finally {
  await server.stop();
}
`;
    await app.spawn("bun", ["-e", code], {
      env: app.getCommandEnv({ AKAN_COMMAND_TYPE: "console", ...(await app.getDatabaseModeEnv()) }),
      stdio: "inherit",
    });
  }
  // Booted as a script (no listener, cron or init job), so nothing writes beside the import.
  async transferDatabase(app: App, direction: "export" | "import", dir: string) {
    const serverPath = `${app.cwdPath}/server.ts`;
    if (!(await app.exists("server.ts"))) throw new Error(`Server file not found: apps/${app.name}/server.ts`);
    const target = path.resolve(app.workspace.workspaceRoot, dir);
    const code = `
const { server } = await import(${JSON.stringify(serverPath)});
const { DatabaseAdaptorRole, DocumentTransfer } = await import("akanjs/service");
await server.start({ listen: false, web: false });
try {
  const transfer = new DocumentTransfer(server.get(DatabaseAdaptorRole));
  const reports = await transfer.${direction === "export" ? "exportTo" : "importFrom"}(${JSON.stringify(target)});
  for (const { table, rows } of reports) console.info(\`${direction === "export" ? "exported" : "imported"} \${table}: \${rows} rows\`);
} finally {
  await server.stop();
}
`;
    await app.spawn("bun", ["-e", code], {
      env: app.getCommandEnv({ AKAN_COMMAND_TYPE: "script", ...(await app.getDatabaseModeEnv()) }),
      stdio: "inherit",
    });
  }
  async typecheck(app: App, options: TypecheckOptions = {}) {
    await new (await loadBuildRunner())(app).typecheck(options);
  }
  async test(exec: Exec) {
    const isSignalTarget = exec instanceof AppExecutor || exec instanceof LibExecutor;
    const preloadPath = isSignalTarget ? await resolveSignalTestPreloadPath(exec) : null;
    const env = isSignalTarget
      ? {
          AKAN_TEST_SIGNAL: "1",
          AKAN_TEST_TARGET_TYPE: exec.type,
          AKAN_TEST_TARGET_NAME: exec.name,
          AKAN_TEST_LIBS: exec.getScanInfo({ allowEmpty: true })?.getLibs().join(",") ?? "",
        }
      : {};
    const args = preloadPath ? ["test", "--isolate", "--preload", preloadPath] : ["test", "--isolate"];
    await exec.spawn("bun", args, {
      ...(isSignalTarget ? { env: { ...process.env, ...env } } : {}),
      stdio: "inherit",
    });
  }
  async build(
    app: App,
    {
      fast = false,
      reporter,
      spinner = false,
    }: { fast?: boolean; reporter?: BuildProgressReporter; spinner?: boolean } = {},
  ): Promise<BuildResult> {
    return new (await loadBuildRunner())(app, { fast, reporter }).build({ spinner });
  }
  async start(
    app: App,
    {
      open = false,
      onStart,
      onDevEvent,
      stdio = "inherit",
    }: {
      open?: boolean;
      onStart?: () => void;
      onDevEvent?: (event: DevHostEvent) => void;
      stdio?: DevStdioMode;
    } = {},
  ) {
    const { env } = await app.prepareCommand("start");
    const appHost = await new AkanAppHost(app, { env, stdio, onDevEvent }).start();
    onStart?.();
    if (open)
      setTimeout(() => openBrowser(`http://localhost:${env.AKAN_PUBLIC_CLIENT_PORT ?? env.PORT ?? "8282"}`), 3000);
    return appHost;
  }

  async buildMobile(
    app: App,
    platform: NativePlatform,
    { target, env = "debug", profile = "release", server = false }: MobileBuildOptions = {},
  ) {
    const targets = await resolveMobileTargets(app, target);
    if (server) DesktopServerStage.assertCarriable(await app.getConfig());
    await this.#buildMobileCsr(app, env);
    const carried = server ? await new DesktopServerStage(app).prepare(env) : undefined;
    await this.#runMobileTargets(targets, async (mobileTarget) => {
      this.#reportBuild(
        app,
        mobileTarget,
        await new NativeApp(app, mobileTarget).build(platform, { profile, ...(carried ? { server: carried } : {}) }),
      );
    });
  }
  async buildDesktop(app: App, options: MobileBuildOptions = {}) {
    await this.buildMobile(app, NativeApp.desktopPlatform(), options);
  }

  //* A dev build loads its pages from `akan start`, so it follows every save; a release build carries its own bundle.
  async startMobile(
    app: App,
    platform: NativePlatform,
    { target, env = "local", operation = "local", device, teamId, server = false, interrupt }: MobileStartOptions = {},
  ) {
    const targets = await resolveMobileTargets(app, target);
    const [mobileTarget] = targets;
    if (!mobileTarget || targets.length > 1)
      throw new Error(
        `start-${platform === "ios" || platform === "android" ? platform : "desktop"} runs one mobile target at a time; pass --target <name>.`,
      );
    const nativeApp = new NativeApp(app, mobileTarget);
    const selection = { ...(device ? { device } : {}), ...(teamId ? { teamId } : {}) };
    if (operation === "release") {
      if (server) DesktopServerStage.assertCarriable(await app.getConfig());
      await this.#buildMobileCsr(app, env);
      const carried = server ? await new DesktopServerStage(app).prepare(env) : undefined;
      const running = await nativeApp.run(platform, {
        ...selection,
        profile: "release",
        ...(carried ? { server: carried } : {}),
      });
      await running.exited;
      return;
    }
    const upstream = `http://localhost:${await app.getDevPort()}`;
    if (!(await ApplicationRunner.answers(upstream)))
      throw new Error(`No dev server answers on ${upstream}; run \`akan start ${app.name}\` first.`);
    const { i18n } = await app.getConfig();
    const session = await nativeApp.dev(platform, { upstream, lang: i18n.defaultLocale, ...selection });
    app.log(`${app.name}/${mobileTarget.name} on ${platform} follows ${upstream} through ${session.gateway}.`);
    if (interrupt)
      interrupt.add(async () => await session.stop(), "Abandoning the app's shutdown; its window may stay open.");
    else
      process.once("SIGINT", () => {
        void session.stop().finally(() => process.exit(130));
      });
    await session.exited;
  }
  async startDesktop(app: App, options: Omit<MobileStartOptions, "device" | "teamId"> = {}) {
    await this.startMobile(app, NativeApp.desktopPlatform(), options);
  }
  //? The gateway answers its health route itself: the root path waits for a cold page render, which took a Windows VM
  //? longer than these 3 s.
  static async answers(url: string) {
    try {
      await fetch(`${url}/_akan/app/health`, { signal: AbortSignal.timeout(3_000) });
      return true;
    } catch {
      // Nothing listening, which the caller turns into what to run.
      return false;
    }
  }

  async releaseIos(app: App, { target, env = "main", teamId, adHoc = false }: IosReleaseOptions = {}) {
    const targets = await resolveMobileTargets(app, target);
    await this.#buildMobileCsr(app, env);
    for (const mobileTarget of targets)
      this.#reportBuild(app, mobileTarget, await new NativeApp(app, mobileTarget).releaseIos({ teamId, adHoc }));
  }

  async releaseAndroid(app: App, format: "apk" | "aab", { target, env = "main" }: MobileTargetOptions = {}) {
    const targets = await resolveMobileTargets(app, target);
    NativeApp.androidSigning();
    await this.#buildMobileCsr(app, env);
    for (const mobileTarget of targets)
      this.#reportBuild(
        app,
        mobileTarget,
        await new NativeApp(app, mobileTarget).releaseAndroid({ formats: [format] }),
      );
  }

  #reportBuild(
    app: App,
    mobileTarget: ResolvedMobileTarget,
    { artifacts, warnings, signing }: Awaited<ReturnType<NativeApp["build"]>>,
  ) {
    for (const warning of warnings) app.logger.warn(warning);
    if (signing) app.log(`Signed with ${signing.identity} (${signing.profile}, team ${signing.teamId})`);
    for (const artifact of artifacts) app.log(`${app.name}/${mobileTarget.name} ${artifact.kind}: ${artifact.path}`);
  }

  async #buildMobileCsr(app: App, env: MobileEnv) {
    const prevEnv = {
      AKAN_PUBLIC_ENV: process.env.AKAN_PUBLIC_ENV,
      AKAN_PUBLIC_OPERATION_MODE: process.env.AKAN_PUBLIC_OPERATION_MODE,
      APP_OPERATION_MODE: process.env.APP_OPERATION_MODE,
    };
    Object.assign(process.env, {
      AKAN_PUBLIC_ENV: env,
      AKAN_PUBLIC_OPERATION_MODE: env === "local" ? "local" : "cloud",
      APP_OPERATION_MODE: "release",
    });
    try {
      await new (await loadBuildRunner())(app).build({ spinner: true });
    } finally {
      for (const [key, value] of Object.entries(prevEnv)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  }
  async #runMobileTargets(targets: ResolvedMobileTarget[], task: (target: ResolvedMobileTarget) => Promise<void>) {
    const results: { target: string; error?: unknown }[] = [];
    for (const target of targets) {
      try {
        await task(target);
        results.push({ target: target.name });
      } catch (error) {
        results.push({ target: target.name, error });
      }
    }
    const failures = results.filter((result) => result.error);
    if (failures.length === 0) return;
    for (const failure of failures) {
      const message = failure.error instanceof Error ? failure.error.message : String(failure.error);
      Logger.rawLog(`Mobile target ${failure.target} failed: ${message}`, undefined, "error");
    }
    throw new Error(`${failures.length}/${results.length} mobile targets failed`);
  }

  // multiple keeps its data in the SQLite file single uses, so only Redis joins it; cluster adds Postgres.
  #getLocalDatabaseServices(mode: DatabaseMode): string[] {
    if (mode === "single") return [];
    if (mode === "multiple") return ["redis"];
    return ["redis", "postgres"];
  }
  // docker-compose.yaml is written once and left to the developer, so an older one may lack a service.
  async #assertComposeHas(workspace: Workspace, services: string[]) {
    const compose = Bun.YAML.parse(await Bun.file(`${workspace.workspaceRoot}/local/docker-compose.yaml`).text()) as {
      services?: Record<string, unknown>;
    } | null;
    const missing = services.filter((service) => !compose?.services?.[service]);
    if (missing.length)
      throw new Error(
        `local/docker-compose.yaml declares no ${missing.join(" or ")} service. Add it, or move the file aside so the next akan dbup writes the current template.`,
      );
  }
  async #isLocalDatabaseUp(workspace: Workspace, mode: DatabaseMode) {
    const requiredServices = this.#getLocalDatabaseServices(mode);
    if (!requiredServices.length) return true;
    const output = await workspace.spawn("docker", ["compose", "ps", "--services", "--status", "running"], {
      cwd: `${workspace.workspaceRoot}/local`,
    });
    const runningServices = new Set(output.split(/\s+/).filter(Boolean));
    return requiredServices.every((service) => runningServices.has(service));
  }
  async dbup(workspace: Workspace, mode: DatabaseMode = "multiple"): Promise<boolean> {
    if (mode === "single") return true;
    const services = this.#getLocalDatabaseServices(mode);
    await workspace.applyTemplate({
      basePath: "local",
      template: "localDev",
      dict: { repoName: workspace.repoName },
      overwrite: false,
    });
    await this.#assertComposeHas(workspace, services);
    try {
      const wasAlreadyUp = await this.#isLocalDatabaseUp(workspace, mode);
      if (!wasAlreadyUp)
        await workspace.spawn(`docker`, ["compose", "up", "-d", ...services], {
          cwd: `${workspace.workspaceRoot}/local`,
        });
      return wasAlreadyUp;
    } catch (error) {
      const detail =
        error instanceof Error
          ? error.message
          : typeof error === "string"
            ? error
            : JSON.stringify(error) || "Unknown error";
      throw new Error(
        [
          "Docker daemon may not be running. Please install Docker or start the Docker daemon and try again.",
          `Original error:\n${detail}`,
        ].join("\n\n"),
      );
    }
  }
  async dbdown(workspace: Workspace) {
    await workspace.spawn(`docker`, ["compose", "down"], { cwd: `${workspace.workspaceRoot}/local` });
  }
}
