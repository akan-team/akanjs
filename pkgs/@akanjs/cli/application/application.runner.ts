import { realpathSync } from "node:fs";
import path from "node:path";
import { AkanAppHost, type DevHostEvent } from "@akanjs/devkit/akanApp";
import type { DatabaseMode, NativeEnv } from "@akanjs/devkit/akanConfig";
import type { BuildProgressReporter, BuildResult, TypecheckOptions } from "@akanjs/devkit/applicationBuildRunner";
import { resolveSignalTestPreloadPath } from "@akanjs/devkit/applicationTestPreload";
import { type App, type Exec, runner, type Workspace } from "@akanjs/devkit/commandDecorators";
import { AppExecutor, LibExecutor } from "@akanjs/devkit/executors";
import type { DevStdioMode } from "@akanjs/devkit/incrementalBuilder";
import {
  DesktopServerStage,
  type MobilePlatform,
  NativeApp,
  type NativePlatform,
  type ResolvedMobileTarget,
  resolveAppId,
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
  env?: NativeEnv;
}
export interface MobileUpdatePackOptions extends MobileTargetOptions {
  out?: string;
  /** The bundle.json of the store build the update is for; a bundle it cannot run fails the pack. */
  against?: string;
}
export interface MobilePublishOptions extends MobileTargetOptions {
  /** The manifest to publish to; default the target's updates.channel, else the backend env it is built for. */
  channel?: string;
}
export interface MobileBuildOptions extends MobileTargetOptions {
  profile?: "debug" | "release";
  /** What a person downloads too: a Windows setup program, a macOS dmg, a Linux AppImage. */
  installer?: boolean;
  /** Desktop: the CPU the app runs on, of the same OS; a macOS app is arm64 only. */
  arch?: "arm64" | "x64";
}
export interface MobileStartOptions extends MobileTargetOptions {
  operation?: "local" | "release";
  /** A simulator, emulator or device: its id or name, as `akan-native devices` lists them. */
  device?: string;
  /** Narrows an iPhone's signing to one Apple team. */
  teamId?: string;
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
    { target, env = "debug", profile = "release", installer = false, arch }: MobileBuildOptions = {},
  ) {
    const targets = await resolveMobileTargets(app, target);
    NativeApp.assertInstaller(platform, installer);
    if (arch && platform !== "macos" && platform !== "windows" && platform !== "linux")
      throw new Error(`--arch picks a desktop app's CPU; ${platform} builds for its own.`);
    if (arch === "x64" && platform === "macos") throw new Error("A macOS app is built for Apple silicon (arm64) only.");
    const carried = await this.#stageMobile(app, platform, targets, env, arch);
    await this.#runMobileTargets(targets, async (mobileTarget) => {
      this.#reportBuild(
        app,
        mobileTarget,
        await new NativeApp(app, mobileTarget, env).build(platform, {
          profile,
          ...(carried && ApplicationRunner.carriesServer(mobileTarget, platform) ? { server: carried } : {}),
          ...(installer ? { installer } : {}),
          ...(arch ? { arch } : {}),
        }),
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
    { target, env = "local", operation = "local", device, teamId, interrupt }: MobileStartOptions = {},
  ) {
    const mobileTarget = await ApplicationRunner.startTarget(app, platform, target);
    const nativeApp = new NativeApp(app, mobileTarget, env);
    const selection = { ...(device ? { device } : {}), ...(teamId ? { teamId } : {}) };
    if (operation === "release") {
      const carried = await this.#stageMobile(app, platform, [mobileTarget], env);
      const running = await nativeApp.run(platform, {
        ...selection,
        profile: "release",
        ...(carried ? { server: carried } : {}),
      });
      await running.exited;
      return;
    }
    const upstream = `http://localhost:${await app.getDevPort()}`;
    if (!(await ApplicationRunner.answers(upstream, app.name, app.workspace.workspaceRoot)))
      throw new Error(`No dev server answers on ${upstream}; run \`akan start ${app.name}\` first.`);
    const { i18n } = await app.getConfig();
    const session = await nativeApp.dev(platform, { upstream, lang: i18n.defaultLocale, ...selection });
    if (interrupt)
      interrupt.add(async () => await session.stop(), "Abandoning the app's shutdown; its window may stay open.", 130);
    else
      process.once("SIGINT", () => {
        void session.stop().finally(() => process.exit(130));
      });
    await session.exited;
  }
  async startDesktop(app: App, options: Omit<MobileStartOptions, "device" | "teamId"> = {}) {
    await this.startMobile(app, NativeApp.desktopPlatform(), options);
  }
  /** The one native target a `start-*` session runs; `platform` defaults to this computer's desktop. */
  static async startTarget(app: App, platform: NativePlatform = NativeApp.desktopPlatform(), target?: string) {
    const targets = await resolveMobileTargets(app, target);
    const [mobileTarget] = targets;
    if (!mobileTarget || targets.length > 1)
      throw new Error(
        `start-${platform === "ios" || platform === "android" ? platform : "desktop"} runs one native target at a time; pass --target <name>.`,
      );
    return mobileTarget;
  }
  //? The health and info routes, not the page: the gateway answers them itself, while `/` waits for a cold render (or a
  //? builder that idled out) past these 3 s. Another app's dev server may hold the port, so the name has to match.
  static async answers(url: string, appName: string, workspaceRoot: string) {
    const signal = AbortSignal.timeout(3_000);
    const health = await fetch(new URL("/_akan/app/health", url), { signal }).catch(() => null);
    // Nothing listening, which the caller turns into what to run.
    if (!health) return false;
    const info = (await fetch(new URL("/_akan/app/info", url), { signal })
      .then(async (res) => (res.ok ? await res.json() : null))
      .catch(() => null)) as { appName?: unknown; workspaceRoot?: unknown } | null;
    const stopIt = `Stop it (\`akan start ${appName} --kill\` takes the port over) or give ${appName} another port with AKAN_DEV_PORT`;
    if (info?.appName === appName) {
      if (typeof info.workspaceRoot !== "string" || ApplicationRunner.#sameCheckout(info.workspaceRoot, workspaceRoot))
        return true;
      //? Another checkout's server of the app (a worktree) would hand it that checkout's pages, API and data.
      throw new Error(
        `${url} is the dev server of ${appName} in ${info.workspaceRoot}, not in ${workspaceRoot}. ${stopIt}.`,
      );
    }
    if (typeof info?.appName === "string")
      throw new Error(`${url} is the dev server of ${info.appName}, not ${appName}. ${stopIt}.`);
    //? An akan older than /_akan/app/info still puts its pid in the health answer.
    const { pid } = ((await health.json().catch(() => null)) ?? {}) as { pid?: unknown };
    throw new Error(
      typeof pid === "number"
        ? `${url} is an akan dev server (pid ${pid}) too old to say which app it serves. ${stopIt}.`
        : `${url} answers, but not as an akan dev server. Stop what holds the port or give ${appName} another port with AKAN_DEV_PORT.`,
    );
  }
  static #sameCheckout(reported: string, own: string) {
    const canonical = (root: string) => {
      try {
        return realpathSync.native(root);
      } catch {
        return path.resolve(root);
      }
    };
    return canonical(reported) === canonical(own);
  }

  async releaseIos(app: App, { target, env = "main", teamId, adHoc = false }: IosReleaseOptions = {}) {
    const targets = await resolveMobileTargets(app, target);
    await this.#buildMobileCsr(app, env);
    for (const mobileTarget of targets)
      this.#reportBuild(app, mobileTarget, await new NativeApp(app, mobileTarget, env).releaseIos({ teamId, adHoc }));
  }

  async releaseAndroid(app: App, format: "apk" | "aab", { target, env = "main" }: MobileTargetOptions = {}) {
    const targets = await resolveMobileTargets(app, target);
    NativeApp.androidSigning();
    await this.#buildMobileCsr(app, env);
    for (const mobileTarget of targets)
      this.#reportBuild(
        app,
        mobileTarget,
        await new NativeApp(app, mobileTarget, env).releaseAndroid({ formats: [format] }),
      );
  }

  async packUpdate(
    app: App,
    platform: MobilePlatform,
    { target, env = "main", out, against }: MobileUpdatePackOptions,
  ) {
    const targets = await resolveMobileTargets(app, target);
    const [mobileTarget] = targets;
    if (!mobileTarget || targets.length > 1)
      throw new Error("pack-update packs one native target at a time; pass --target <name>.");
    await this.#buildMobileCsr(app, env);
    const packed = await new NativeApp(app, mobileTarget, env).packUpdate(platform, { out });
    const size = packed.manifest.files.reduce((sum, file) => sum + file.size, 0);
    app.logger.info(
      `packed ${mobileTarget.name} ${platform} for channel '${packed.channel}' to ${packed.out}: ${packed.manifest.files.length} files, ${(size / 1024).toFixed(0)} KiB, native API ${packed.manifest.nativeApi}`,
    );
    if (!against) return;
    const bundle = path.join(packed.out, "bundle.json");
    const compat = await NativeApp.compareBundles(app.cwdPath, against, bundle);
    await Bun.write(path.join(packed.out, "compat.json"), `${JSON.stringify({ against, ...compat }, null, 2)}\n`);
    if (!compat.compatible)
      throw new Error(
        `This bundle needs a new store build; the one ${against} came from provides another native API:\n- ${compat.problems.join("\n- ")}`,
      );
    app.logger.info(`runs in the store build of ${against}`);
  }

  //* A target that shares its app id with another shares its key too, so each id is answered once.
  async updateKeygen(app: App, platform: "desktop" | "android" | "ios", target?: string) {
    const nativePlatform = platform === "desktop" ? NativeApp.desktopPlatform() : platform;
    const seen = new Set<string>();
    for (const mobileTarget of await resolveMobileTargets(app, target ?? "all")) {
      const appId = resolveAppId(mobileTarget.config.appId, nativePlatform);
      if (seen.has(appId)) continue;
      seen.add(appId);
      const { publicKey, keyPath, created } = await new NativeApp(app, mobileTarget).updateKeygen(nativePlatform);
      app.log(
        `${appId}: ${created ? "made" : "read"} ${keyPath}${created ? " (keep it private and backed up: without it, installed apps take no more updates)" : ""}`,
      );
      app.log(`  native: { updates: { url: "https://…/${app.name}", publicKey: ${JSON.stringify(publicKey)} } }`);
      const declared = mobileTarget.config.updates?.publicKey;
      if (declared && declared !== publicKey)
        app.logger.warn(
          `native.targets.${mobileTarget.name}.updates.publicKey is another key's; releases would not verify.`,
        );
    }
  }

  async publishUpdate(
    app: App,
    platform: "desktop" | "android" | "ios",
    { target, env = "main", channel }: MobilePublishOptions = {},
  ) {
    const targets = await resolveMobileTargets(app, target);
    const nativePlatform = platform === "desktop" ? NativeApp.desktopPlatform() : platform;
    //? Every target before anything builds: one refused after the build would leave the targets before it published.
    for (const mobileTarget of targets)
      await new NativeApp(app, mobileTarget, env).assertPublishable(nativePlatform, {
        server: ApplicationRunner.carriesServer(mobileTarget, nativePlatform),
        ...(channel ? { channel } : {}),
      });
    const carried = await this.#stageMobile(app, nativePlatform, targets, env);
    for (const mobileTarget of targets) {
      const nativeApp = new NativeApp(app, mobileTarget, env);
      const published = await nativeApp.publishUpdate(nativePlatform, {
        ...(channel ? { channel } : {}),
        ...(carried && ApplicationRunner.carriesServer(mobileTarget, nativePlatform) ? { server: carried } : {}),
      });
      this.#reportBuild(app, mobileTarget, published.build);
      app.log(
        `${app.name}/${mobileTarget.name} ${published.bundle}: ${published.dir}/${published.channel}.json, ${published.files} files, ${Math.round(published.size / 1024)} KiB`,
      );
      app.log(`Upload ${nativeApp.updatesDir} to ${mobileTarget.config.updates?.url}, the manifests last.`);
    }
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

  static carriesServer({ config }: ResolvedMobileTarget, platform: NativePlatform = NativeApp.desktopPlatform()) {
    return platform !== "ios" && platform !== "android" && !!config.desktop?.server;
  }
  //? One build stages one server, so the targets that carry it must leave the same packages out of it.
  static serverOmit(targets: ResolvedMobileTarget[], platform: NativePlatform): string[] {
    const carrying = targets.filter((target) => ApplicationRunner.carriesServer(target, platform));
    const omits = carrying.map(({ config }) => {
      const server = config.desktop?.server;
      return typeof server === "object" ? (server.omit ?? []) : [];
    });
    const [first = [], ...rest] = omits;
    if (rest.some((omit) => omit.join("\0") !== first.join("\0")))
      throw new Error(
        `The targets that carry the server omit different packages (${carrying.map(({ name }, idx) => `${name}: ${omits[idx]?.join(", ") || "none"}`).join("; ")}); build them one --target at a time.`,
      );
    return first;
  }
  //* The server's packages, the web build, then the server once for every target that carries it: one dist for all.
  async #stageMobile(
    app: App,
    platform: NativePlatform,
    targets: ResolvedMobileTarget[],
    env: NativeEnv,
    arch?: "arm64" | "x64",
  ) {
    const stage = targets.some((mobileTarget) => ApplicationRunner.carriesServer(mobileTarget, platform))
      ? new DesktopServerStage(app)
      : null;
    await stage?.install(arch, ApplicationRunner.serverOmit(targets, platform));
    await this.#buildMobileCsr(app, env);
    return await stage?.prepare(env);
  }
  async #buildMobileCsr(app: App, env: NativeEnv) {
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
      await new (await loadBuildRunner())(app, { environment: env }).build({ spinner: true });
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
      Logger.rawLog(`Native target ${failure.target} failed: ${message}`, undefined, "error");
    }
    throw new Error(`${failures.length}/${results.length} native targets failed`);
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
