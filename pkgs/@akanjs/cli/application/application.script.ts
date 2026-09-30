import type { DevHostEvent } from "@akanjs/devkit/akanApp";
import type { AkanAppConfig, DatabaseMode } from "@akanjs/devkit/akanConfig";
import { ApplicationBuildReporter } from "@akanjs/devkit/applicationBuildReporter";
import type { TypecheckOptions } from "@akanjs/devkit/applicationBuildRunner";
import {
  type App,
  type Apps,
  type Exec,
  type Lib,
  type Sys,
  script,
  type Workspace,
} from "@akanjs/devkit/commandDecorators";
import { AppExecutor, LibExecutor, PkgExecutor } from "@akanjs/devkit/executors";
import type { DevStdioMode } from "@akanjs/devkit/incrementalBuilder";
import { DesktopServerStage } from "@akanjs/devkit/mobile";
import { formatSlicePlan } from "@akanjs/devkit/slicePlanner";
import { confirm } from "@inquirer/prompts";
import { Logger } from "akanjs/common";
import { LibraryScript } from "../library/library.script";
import {
  ApplicationRunner,
  type IosReleaseOptions,
  type LogsOptions,
  type MobileBuildOptions,
  type MobilePublishOptions,
  type MobileStartOptions,
  type MobileTargetOptions,
  type MobileUpdatePackOptions,
} from "./application.runner";
import { DevPortReclaimer } from "./devPortReclaimer";
import { DevStreamView } from "./devStreamView";
import { DevSupervisor, type DevUiMode } from "./devSupervisor";
import { InterruptTeardown } from "./interruptTeardown";

interface StartOptions {
  open?: boolean;
  dbup?: boolean;
  share?: boolean;
  write?: boolean;
  plain?: boolean;
  kill?: boolean;
  /** `null` is "nobody said", which `DevBootConcurrency` answers from the machine. */
  concurrency?: number | null;
}
interface StartOneOptions {
  open?: boolean;
  dbup?: boolean;
  stdio?: DevStdioMode;
  write?: boolean;
  onDevEvent?: (event: DevHostEvent) => void;
}

interface MobileWriteOptions {
  write?: boolean;
}
interface MobileReleaseGate {
  allowLocalRelease?: boolean;
}

export class ApplicationScript extends script("application", [ApplicationRunner, LibraryScript]) {
  /** Long enough for `docker compose down` on a healthy daemon, short enough that a wedged one still exits. */
  static dbShutdownTimeoutMs = 20_000;
  /** A cold `akan start`: the base build, then the SSR registry's, before the first request is answered. */
  static devServerReadyTimeoutMs = DevSupervisor.bootTimeoutMs;
  readonly #interrupt = new InterruptTeardown();
  async confirmDatabaseModeDependencyInstall(databaseMode: DatabaseMode, installSpecs: string[]) {
    return await confirm({
      message: `Database mode '${databaseMode}' requires missing dependencies: ${installSpecs.join(", ")}. Install them now?`,
      default: true,
    });
  }
  async syncDatabaseModeDependencies(app: App, akanConfig: AkanAppConfig, databaseMode: DatabaseMode) {
    const installSpecs = akanConfig.getMissingDatabaseModeDependencySpecs(databaseMode);
    if (installSpecs.length === 0) return;

    const shouldInstall = await this.confirmDatabaseModeDependencyInstall(databaseMode, installSpecs);
    if (!shouldInstall)
      throw new Error(`Database mode '${databaseMode}' requires missing dependencies: ${installSpecs.join(", ")}.`);
    await this.#addDependencies(app, installSpecs, `database dependencies for ${databaseMode} mode`);
  }
  async #addDependencies(app: App, installSpecs: string[], what: string) {
    const spinner = app.workspace.spinning(`Installing ${what}...`);
    try {
      await app.workspace.spawn("bun", ["add", ...installSpecs], { stdio: "inherit" });
      await app.workspace.getPackageJson({ refresh: true });
      spinner.succeed(`Installed ${what}`);
    } catch (error) {
      spinner.fail(`Failed to install ${what}`);
      throw error;
    }
  }
  async createApplication(
    appName: string,
    workspace: Workspace,
    { start = false, libs = [] }: { start?: boolean; libs?: string[] } = {},
  ) {
    const spinner = workspace.spinning("Creating application...");
    const app = await this.applicationRunner.createApplication(appName, workspace, libs);
    spinner.succeed(`Application created in apps/${app.name}`);
    await app.scanSync();
    if (start) await this.startOne(app, { open: true });
  }
  async removeApplication(app: App) {
    const spinner = app.spinning("Removing application...");
    await this.applicationRunner.removeApplication(app);
    spinner.succeed(`Application ${app.name} (apps/${app.name}) removed`);
  }
  async planSlice(app: App, format: "text" | "json" = "text") {
    const spinner = app.spinning("Planning distributable slice...");
    const plan = await this.applicationRunner.planSlice(app);
    spinner.succeed(`Slice planned (${plan.libs.length} libs, ${plan.warnings.length} warnings)`);
    Logger.rawLog(format === "json" ? JSON.stringify(plan, null, 2) : formatSlicePlan(plan));
  }
  async sync(sys: Sys) {
    if (sys.type === "app") await (sys as App).scanSync();
    else await this.libraryScript.syncLibrary(sys as Lib);
  }

  async script(app: App, filename: string | null) {
    const scriptFilename = filename ?? (await this.applicationRunner.getScriptFilename(app));
    await app.scanSync();
    await this.applicationRunner.runScript(app, scriptFilename);
  }

  async console(app: App) {
    await app.scanSync();
    await this.applicationRunner.runConsole(app);
  }

  async logs(app: App, options: LogsOptions) {
    await this.applicationRunner.runLogs(app, options);
  }

  async build(
    app: App,
    { write = true, fast = false, quiet = false }: { write?: boolean; fast?: boolean; quiet?: boolean } = {},
  ) {
    await app.scanSync({ write });
    if (!quiet) Logger.rawLog(`Creating an optimized production build for ${app.name}...`);
    try {
      const result = await this.applicationRunner.build(app, { fast, spinner: !quiet });
      Logger.rawLog(`${app.name} built in dist/apps/${app.name}`);
      if (!quiet) ApplicationBuildReporter.printSummary(result);
    } catch (error) {
      Logger.rawLog(`${app.name} build failed in dist/apps/${app.name}`, undefined, "error");
      Logger.rawLog(ApplicationBuildReporter.formatError(error), undefined, "error");
      throw error;
    }
  }

  async typecheck(
    app: App,
    { write = true, clean = false, incremental = true }: TypecheckOptions & { write?: boolean } = {},
  ) {
    await app.scanSync({ write });
    const spinner = app.spinning(`Typechecking ${app.name}...`);
    try {
      await this.applicationRunner.typecheck(app, { clean, incremental });
      spinner.succeed(`${app.name} typechecked`);
    } catch (error) {
      spinner.fail(`${app.name} typecheck failed`);
      Logger.rawLog(ApplicationBuildReporter.formatError(error), undefined, "error");
      throw error;
    }
  }

  async test(exec: Exec, { write = true }: { write?: boolean } = {}) {
    if (exec instanceof LibExecutor) {
      await this.libraryScript.syncLibrary(exec);
      exec.spinning(`Preparing ${exec.name}...`).succeed(`${exec.name} prepared`);
      await this.applicationRunner.test(exec);
      return;
    }

    const spinner = exec.spinning(`Preparing ${exec.name}...`);
    try {
      if (exec instanceof PkgExecutor) await exec.scan({ refresh: true });
      else await (exec as App).scanSync({ write });
      spinner.succeed(`${exec.name} prepared`);
    } catch (error) {
      spinner.fail(`${exec.name} prepare failed`);
      throw error;
    }
    await this.applicationRunner.test(exec);
  }

  async start(
    apps: Apps,
    {
      open = false,
      dbup = true,
      write = true,
      plain = false,
      kill = false,
      share = false,
      concurrency = null,
    }: StartOptions = {},
  ) {
    const first = apps[0];
    if (!first) throw new Error("No app selected to start");
    const { mode, downgraded } = DevSupervisor.resolveDevUi(plain);
    if (downgraded) first.workspace.log("no sized terminal to draw on; printing prefixed lines instead");
    if (kill) await this.reclaimDevPorts(apps);
    const shares = share ? await this.#shareOnInterrupt(apps) : null;
    //? `--plain` on one app keeps the pre-supervisor path: no extra process, own stdio and Ctrl+C handling.
    if (mode === "stream" && apps.length === 1)
      return await this.startOne(first, { open, dbup, write, ...DevSupervisor.childHooks() });
    this.#interrupt.ownsExit = false;
    await this.#startMany(apps, { open, dbup, write, mode, concurrency, shares });
  }

  async startOne(
    app: App,
    { open = false, dbup = true, stdio = "inherit", write = true, onDevEvent }: StartOneOptions = {},
  ) {
    await app.scanSync({ write });
    const akanConfig = await app.getConfig();
    const databaseMode = akanConfig.resolveDatabaseMode();
    await this.syncDatabaseModeDependencies(app, akanConfig, databaseMode);
    if (app.getEnv() === "local" && dbup && databaseMode !== "single") {
      const wasDbAlreadyUp = await this.dbup(app.workspace, databaseMode);
      if (!wasDbAlreadyUp) this.#stopDatabaseOnInterrupt(app.workspace);
    }
    const spinner = app.spinning("Preparing backend...");
    return await this.applicationRunner.start(app, {
      open,
      onStart: () => spinner.succeed(`${app.name} prepared, ready to start`),
      onDevEvent,
      stdio,
    });
  }

  // Reported line by line: the holder is often another checkout's dev server, which must be explainable from here.
  async reclaimDevPorts(apps: Apps) {
    const workspace = apps[0]?.workspace;
    if (!workspace) return;
    const ports = await Promise.all(apps.map(async (app) => await app.getDevPort()));
    const { killed, foreign } = await new DevPortReclaimer().reclaim(ports);
    for (const holder of killed)
      workspace.log(`freed port ${holder.port} — killed pid ${holder.pid} (${holder.command})`);
    for (const holder of foreign)
      Logger.rawLog(
        `port ${holder.port} is held by pid ${holder.pid} and was left alone: ${holder.command}`,
        undefined,
        "error",
      );
    if (killed.length === 0 && foreign.length === 0) workspace.log("dev ports are free; nothing to kill");
  }

  // Children get `--dbup false`: a child's `docker compose down` on Ctrl+C would take the other apps' database.
  async #startMany(
    apps: Apps,
    {
      open,
      dbup,
      write,
      mode,
      concurrency,
      shares,
    }: Required<Omit<StartOptions, "plain" | "kill" | "share">> & {
      mode: DevUiMode;
      shares: Map<string, string> | null;
    },
  ) {
    const workspace = apps[0]?.workspace;
    if (!workspace) throw new Error("No app selected to start");
    const startedDatabase = dbup ? await this.#prepareSharedDatabase(apps) : false;
    const supervisor = new DevSupervisor({ apps, mode, concurrency, open, write, shares });
    // `ink` stays behind `import()`: entryModuleGraph.test.ts fails if the CLI entry reaches it eagerly.
    const view =
      mode === "tui"
        ? new (await import("./devTui")).DevTui(supervisor)
        : new DevStreamView(apps.map((app) => app.name));
    await supervisor.run(view);
    //* Only what this session brought up: the compose project is workspace-wide, shared with other checkouts.
    if (startedDatabase) await this.#stopDatabase(workspace);
  }

  // A union of services, not a choice: one compose project serves every app, whatever mode each declares.
  async #prepareSharedDatabase(apps: Apps): Promise<boolean> {
    const workspace = apps[0]?.workspace;
    if (!workspace) return false;
    const modes = new Set<DatabaseMode>();
    for (const app of apps) {
      if (app.getEnv() !== "local") continue;
      const akanConfig = await app.getConfig();
      const mode = akanConfig.resolveDatabaseMode();
      await this.syncDatabaseModeDependencies(app, akanConfig, mode);
      if (mode !== "single") modes.add(mode);
    }
    let started = false;
    for (const mode of modes) if (!(await this.dbup(workspace, mode))) started = true;
    return started;
  }

  async buildIos(app: App, { write = true, ...options }: MobileBuildOptions & MobileWriteOptions = {}) {
    await app.scanSync({ write });
    await this.applicationRunner.buildMobile(app, "ios", options);
  }
  async buildAndroid(app: App, { write = true, ...options }: MobileBuildOptions & MobileWriteOptions = {}) {
    await app.scanSync({ write });
    await this.applicationRunner.buildMobile(app, "android", options);
  }
  async buildDesktop(app: App, { write = true, ...options }: MobileBuildOptions & MobileWriteOptions = {}) {
    await app.scanSync({ write });
    await this.applicationRunner.buildDesktop(app, options);
  }
  async startIos(app: App, { write = true, ...options }: MobileStartOptions & MobileWriteOptions = {}) {
    await app.scanSync({ write });
    await this.applicationRunner.startMobile(app, "ios", options);
  }
  async startAndroid(app: App, { write = true, ...options }: MobileStartOptions & MobileWriteOptions = {}) {
    await app.scanSync({ write });
    await this.applicationRunner.startMobile(app, "android", options);
  }
  async startDesktop(
    app: App,
    { write = true, ...options }: Omit<MobileStartOptions, "device" | "teamId" | "interrupt"> & MobileWriteOptions = {},
  ) {
    await app.scanSync({ write });
    if (options.operation === "release") return await this.applicationRunner.startDesktop(app, options);
    //? Before a dev server boots for nothing: an app with several targets names one.
    const mobileTarget = await ApplicationRunner.startTarget(app, undefined, options.target);
    //? A desktop app that carries its server calls no other backend, so its dev build needs this app's dev server.
    if (!ApplicationRunner.carriesServer(mobileTarget)) return await this.applicationRunner.startDesktop(app, options);
    DesktopServerStage.assertCarriable(await app.getConfig());
    const upstream = `http://localhost:${await app.getDevPort()}`;
    try {
      if (await ApplicationRunner.answers(upstream, app.name, app.workspace.workspaceRoot))
        app.log(`The desktop app follows the dev server on ${upstream}.`);
      else await this.#startDevServerFor(app, upstream);
      await this.applicationRunner.startDesktop(app, { ...options, interrupt: this.#interrupt });
    } finally {
      await this.#interrupt.runAll();
    }
  }
  //* `akan start` in this process, as `--plain` runs it: the full-screen view would take the terminal from the app's logs.
  async #startDevServerFor(app: App, upstream: string) {
    app.log(`No dev server answers on ${upstream}; starting \`akan start ${app.name}\` for the desktop app.`);
    let settle: (state: "ready" | "failed") => void = () => {};
    const settled = new Promise<"ready" | "failed">((resolve) => (settle = resolve));
    const appHost = await this.startOne(app, {
      write: false,
      onDevEvent: (event) => {
        if ("state" in event && (event.state === "ready" || event.state === "failed")) settle(event.state);
      },
    });
    this.#interrupt.add(
      async () => {
        await appHost.stop();
      },
      "Abandoning the dev server shutdown; its processes may still be running.",
      130,
    );
    let state: "ready" | "failed" | undefined;
    const timedOut = await DevSupervisor.timesOut(
      settled.then((settledState) => (state = settledState)),
      ApplicationScript.devServerReadyTimeoutMs,
    );
    if (state === "ready") return;
    await this.#interrupt.runAll();
    throw new Error(
      timedOut
        ? `akan start ${app.name} did not answer within ${ApplicationScript.devServerReadyTimeoutMs / 1000}s; see its log above.`
        : `akan start ${app.name} gave up restarting its server; see its log above.`,
    );
  }
  async releaseIos(
    app: App,
    {
      write = true,
      allowLocalRelease = false,
      ...options
    }: IosReleaseOptions & MobileWriteOptions & MobileReleaseGate = {},
  ) {
    await app.scanSync({ write });
    ApplicationScript.#assertReleaseEnv("releaseIos", options.env ?? "main", allowLocalRelease);
    await this.applicationRunner.releaseIos(app, options);
  }
  async releaseAndroid(
    app: App,
    format: "apk" | "aab",
    {
      write = true,
      allowLocalRelease = false,
      ...options
    }: MobileTargetOptions & MobileWriteOptions & MobileReleaseGate = {},
  ) {
    await app.scanSync({ write });
    ApplicationScript.#assertReleaseEnv("releaseAndroid", options.env ?? "main", allowLocalRelease);
    await this.applicationRunner.releaseAndroid(app, format, options);
  }
  async packUpdate(
    app: App,
    platform: "ios" | "android",
    {
      write = true,
      allowLocalRelease = false,
      ...options
    }: MobileUpdatePackOptions & MobileWriteOptions & MobileReleaseGate = {},
  ) {
    await app.scanSync({ write });
    ApplicationScript.#assertReleaseEnv("packUpdate", options.env ?? "main", allowLocalRelease);
    await this.applicationRunner.packUpdate(app, platform, options);
  }
  async updateKeygen(app: App, platform: "desktop" | "android" | "ios", { target }: { target?: string } = {}) {
    await this.applicationRunner.updateKeygen(app, platform, target);
  }
  async publishUpdate(
    app: App,
    platform: "desktop" | "android" | "ios",
    {
      write = true,
      allowLocalRelease = false,
      ...options
    }: MobilePublishOptions & MobileWriteOptions & MobileReleaseGate = {},
  ) {
    await app.scanSync({ write });
    ApplicationScript.#assertReleaseEnv("publishUpdate", options.env ?? "main", allowLocalRelease);
    await this.applicationRunner.publishUpdate(app, platform, options);
  }
  static #assertReleaseEnv(command: string, env: string, allowLocalRelease: boolean) {
    if (env === "local" && !allowLocalRelease)
      throw new Error(
        `${command} --env local is blocked. Pass allowLocalRelease only for explicit local release testing.`,
      );
  }
  async transferDatabase(app: App, direction: "export" | "import", dir: string) {
    await this.applicationRunner.transferDatabase(app, direction, dir);
  }
  // One compose project serves every app, so without a named mode it brings up what all of them declare.
  async dbupDeclared(workspace: Workspace, mode: DatabaseMode | null) {
    const declared = mode
      ? [mode]
      : await Promise.all(
          (await workspace.getApps()).map(
            async (appName) => (await AppExecutor.from(workspace, appName).getConfig()).database.modes,
          ),
        ).then((modes) => [...new Set(modes.flat())]);
    const needing = declared.filter((each) => each !== "single");
    if (!needing.length) {
      workspace.log("No app here declares a database mode that runs on local services; single needs none.");
      return;
    }
    for (const each of needing) await this.dbup(workspace, each);
  }
  async dbup(workspace: Workspace, mode: DatabaseMode = "multiple"): Promise<boolean> {
    const spinner = workspace.spinning(`Starting local database (${mode})...`);
    const wasAlreadyUp = await this.applicationRunner.dbup(workspace, mode);
    spinner.succeed(wasAlreadyUp ? `Local database (${mode}) was already up` : `Local database (${mode}) is up`);
    return wasAlreadyUp;
  }
  async dbdown(workspace: Workspace) {
    const spinner = workspace.spinning("Stopping local database...");
    try {
      await this.applicationRunner.dbdown(workspace);
    } catch (error) {
      spinner.fail("Local database failed to stop");
      throw error;
    }
    spinner.succeed("Local database (/local/docker-compose.yaml) is down");
  }
  // Runs in this process, so dev server restarts do not touch it; until the port opens, requests are refused.
  async #shareOnInterrupt(apps: Apps): Promise<Map<string, string>> {
    const shares: { close: () => Promise<void> }[] = [];
    const urls = new Map<string, string>();
    this.#interrupt.add(async () => {
      await Promise.all(shares.map(async (share) => await share.close()));
    }, "Abandoning the tunnel release; the shares expire on their own.");
    await Promise.all(
      apps.map(async (app) => {
        const { TunnelShare } = await import("../tunnel/TunnelShare");
        const share = await TunnelShare.open(app, { workspace: app.workspace });
        shares.push(share);
        urls.set(app.name, share.url);
        // For `--plain`; the full-screen view's first repaint wipes this, so its header carries the URL.
        Logger.rawLog(`${app.name} is shared at ${share.url}`);
      }),
    ).catch((error: unknown) => {
      Logger.rawLog(
        `Could not open the tunnel: ${error instanceof Error ? error.message : String(error)}`,
        undefined,
        "error",
      );
    });
    return urls;
  }

  #stopDatabaseOnInterrupt(workspace: Workspace) {
    this.#interrupt.add(async () => {
      await this.#stopDatabase(workspace);
    }, "Abandoning the local database teardown; containers are left running.");
  }
  async #stopDatabase(workspace: Workspace) {
    const stopped = this.dbdown(workspace).catch(() => undefined);
    if (!(await DevSupervisor.timesOut(stopped, ApplicationScript.dbShutdownTimeoutMs))) return;
    Logger.rawLog(
      `Local database did not stop within ${ApplicationScript.dbShutdownTimeoutMs}ms; run \`akan dbdown\` once Docker responds.`,
      undefined,
      "error",
    );
  }
}
