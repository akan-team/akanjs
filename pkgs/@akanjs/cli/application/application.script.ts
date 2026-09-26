import type { DevHostEvent } from "@akanjs/devkit/akanApp";
import type { AkanAppConfig, DatabaseMode, MobileEnv } from "@akanjs/devkit/akanConfig";
import { ApplicationBuildReporter } from "@akanjs/devkit/applicationBuildReporter";
import type { TypecheckOptions } from "@akanjs/devkit/applicationBuildRunner";
import type { ReleaseSourceOptions } from "@akanjs/devkit/applicationReleasePackager";
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
import { formatSlicePlan } from "@akanjs/devkit/slicePlanner";
import { confirm } from "@inquirer/prompts";
import { Logger } from "akanjs/common";
import { LibraryScript } from "../library/library.script";
import { ApplicationRunner, type LogsOptions } from "./application.runner";
import { DevPortReclaimer } from "./devPortReclaimer";
import { DevStreamView } from "./devStreamView";
import { DevSupervisor } from "./devSupervisor";
import { type DevUiMode, resolveDevUi } from "./devUiMode";
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

type MobileOperation = "local" | "release";
type MobileCommandOptions = {
  target?: string;
  env?: MobileEnv;
  write?: boolean;
  regenerate?: boolean;
};
type MobileReleaseOptions = MobileCommandOptions & {
  allowLocalRelease?: boolean;
};

export class ApplicationScript extends script("application", [ApplicationRunner, LibraryScript]) {
  /** Long enough for `docker compose down` on a healthy daemon, short enough that a wedged one still exits. */
  static dbShutdownTimeoutMs = 20_000;
  readonly #interrupt = new InterruptTeardown();
  async confirmDatabaseModeDependencyInstall(databaseMode: DatabaseMode, installSpecs: string[]) {
    return await confirm({
      message: [
        `Database mode '${databaseMode}' requires missing dependencies: ${installSpecs.join(", ")}.`,
        "Install them now?",
      ].join(" "),
      default: true,
    });
  }
  async syncDatabaseModeDependencies(app: App, akanConfig: AkanAppConfig, databaseMode: DatabaseMode) {
    const installSpecs = akanConfig.getMissingDatabaseModeDependencySpecs(databaseMode);
    if (installSpecs.length === 0) return;

    const shouldInstall = await this.confirmDatabaseModeDependencyInstall(databaseMode, installSpecs);
    if (!shouldInstall)
      throw new Error(`Database mode '${databaseMode}' requires missing dependencies: ${installSpecs.join(", ")}.`);

    const spinner = app.workspace.spinning(`Installing database dependencies for ${databaseMode} mode...`);
    try {
      await app.workspace.spawn("bun", ["add", ...installSpecs], {
        stdio: "inherit",
      });
      await app.workspace.getPackageJson({ refresh: true });
      spinner.succeed(`Installed database dependencies for ${databaseMode} mode`);
    } catch (error) {
      spinner.fail(`Failed to install database dependencies for ${databaseMode} mode`);
      throw error;
    }
  }
  async confirmMobileDependencyInstall(installSpecs: string[]) {
    return await confirm({
      message: [`Mobile builds require missing dependencies: ${installSpecs.join(", ")}.`, "Install them now?"].join(
        " ",
      ),
      default: true,
    });
  }
  async syncMobileDependencies(app: App, akanConfig: AkanAppConfig) {
    const installSpecs = akanConfig.getMissingMobileDependencySpecs();
    if (installSpecs.length === 0) return;

    const shouldInstall = await this.confirmMobileDependencyInstall(installSpecs);
    if (!shouldInstall) throw new Error(`Mobile builds require missing dependencies: ${installSpecs.join(", ")}.`);

    const spinner = app.workspace.spinning("Installing mobile dependencies...");
    try {
      await app.workspace.spawn("bun", ["add", ...installSpecs], {
        stdio: "inherit",
      });
      await app.workspace.getPackageJson({ refresh: true });
      spinner.succeed("Installed mobile dependencies");
    } catch (error) {
      spinner.fail("Failed to install mobile dependencies");
      throw error;
    }
  }
  // `npx cap sync` discovers plugins from the app directory's package.json, so the default Capacitor
  // plugins must be declared there (not just installed at the workspace root) before a mobile target
  // is built. Declaring the missing ones with a "*" range lets bun resolve them to the version
  // already hoisted at the workspace root.
  async syncMobileAppCapacitorPlugins(app: App, akanConfig: AkanAppConfig) {
    const plugins = akanConfig.getMobileAppCapacitorPlugins();
    if (plugins.length === 0) return;
    const packageJson = await app.getPackageJson({ refresh: true });
    const dependencies = packageJson.dependencies ?? {};
    const missing = plugins.filter((plugin) => !dependencies[plugin]);
    if (missing.length === 0) return;

    const spinner = app.workspace.spinning(`Adding default Capacitor plugins to ${app.name}...`);
    try {
      packageJson.dependencies = { ...dependencies, ...Object.fromEntries(missing.map((plugin) => [plugin, "*"])) };
      await app.setPackageJson(packageJson);
      await app.workspace.spawn("bun", ["install"], { stdio: "inherit" });
      await app.getPackageJson({ refresh: true });
      spinner.succeed(`Added default Capacitor plugins to ${app.name}: ${missing.join(", ")}`);
    } catch (error) {
      spinner.fail(`Failed to add default Capacitor plugins to ${app.name}`);
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
      const result = await this.applicationRunner.build(app, {
        fast,
        spinner: !quiet,
      });
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
      const spinner = exec.spinning(`Preparing ${exec.name}...`);
      spinner.succeed(`${exec.name} prepared`);
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
    const { mode, downgraded } = resolveDevUi(plain);
    if (downgraded) first.workspace.log("no sized terminal to draw on; printing prefixed lines instead");
    if (kill) await this.reclaimDevPorts(apps);
    const shares = share ? await this.#shareOnInterrupt(apps) : null;
    //? `--plain` on a single app is the pre-supervisor path, kept whole: no extra process, this
    //? process's own stdio, and the same Ctrl+C handling it always had.
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
    const akanAppHost = await this.applicationRunner.start(app, {
      open,
      onStart: () => {
        spinner.succeed(`${app.name} prepared, ready to start`);
      },
      onDevEvent,
      stdio,
    });
    return akanAppHost;
  }

  /**
   * Frees the ports this session is about to bind. Reported line by line rather than silently: the
   * holder is often another checkout's dev server, and "why did my other terminal die" must be
   * answerable from this output alone.
   */
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

  /**
   * The supervised session: one `akan start <app>` child per app, and this process owning the database,
   * the boot order and the terminal. The children are told `--dbup false` because a workspace-level
   * `docker compose down` on the first Ctrl+C would take the other apps' database with it.
   */
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
    const view =
      mode === "tui"
        ? await (await import("./devTuiView")).createDevTuiView(supervisor)
        : new DevStreamView(apps.map((app) => app.name));
    await supervisor.run(view);
    //* Only what this session brought up: the compose project is workspace-wide, so tearing down a
    //* database that was already running would take another checkout's dev servers with it.
    if (startedDatabase) await this.#stopDatabase(workspace);
  }

  /**
   * One `docker compose up` for every app that wants one. Apps may declare different modes, and the
   * services are a union rather than a choice: they share one compose project, so bringing up the
   * superset is what lets a `cluster` app and a `multiple` app run side by side.
   */
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

  async buildIos(app: App, { write = true, target, env = "debug", regenerate = false }: MobileCommandOptions = {}) {
    await app.scanSync({ write });
    await this.applicationRunner.buildIos(app, { target, env, regenerate });
  }
  async startIos(
    app: App,
    {
      open = false,
      operation = "local",
      env = "local",
      write = true,
      target,
      device,
      regenerate = false,
      noAllowProvisioningUpdates = false,
    }: {
      operation?: MobileOperation;
      env?: MobileEnv;
      open?: boolean;
      write?: boolean;
      target?: string;
      device?: string;
      regenerate?: boolean;
      noAllowProvisioningUpdates?: boolean;
    } = {},
  ) {
    await app.scanSync({ write });
    const akanConfig = await app.getConfig();
    await this.syncMobileDependencies(app, akanConfig);
    await this.syncMobileAppCapacitorPlugins(app, akanConfig);
    await this.applicationRunner.startIos(app, {
      open,
      operation,
      env,
      target,
      device,
      regenerate,
      noAllowProvisioningUpdates,
    });
  }
  async releaseIos(
    app: App,
    { write = true, target, env = "main", regenerate = false, allowLocalRelease = false }: MobileReleaseOptions = {},
  ) {
    await app.scanSync({ write });
    if (env === "local" && !allowLocalRelease)
      throw new Error(
        "releaseIos --env local is blocked. Pass allowLocalRelease only for explicit local release testing.",
      );
    await this.applicationRunner.releaseIos(app, { target, env, regenerate });
  }
  async buildAndroid(app: App, { write = true, target, env = "debug", regenerate = false }: MobileCommandOptions = {}) {
    await app.scanSync({ write });
    await this.applicationRunner.buildAndroid(app, { target, env, regenerate });
  }
  async startAndroid(
    app: App,
    {
      open = false,
      operation = "local",
      env = "local",
      write = true,
      target,
      regenerate = false,
    }: {
      open?: boolean;
      env?: MobileEnv;
      operation?: MobileOperation;
      write?: boolean;
      target?: string;
      regenerate?: boolean;
    } = {},
  ) {
    await app.scanSync({ write });
    const akanConfig = await app.getConfig();
    await this.syncMobileDependencies(app, akanConfig);
    await this.syncMobileAppCapacitorPlugins(app, akanConfig);
    await this.applicationRunner.startAndroid(app, {
      open,
      operation,
      env,
      target,
      regenerate,
    });
  }
  //* 안드로이드 릴리즈(apk or aab 추출) 메서드
  async releaseAndroid(
    app: App,
    assembleType: "apk" | "aab",
    { write = true, target, env = "main", regenerate = false, allowLocalRelease = false }: MobileReleaseOptions = {},
  ) {
    await app.scanSync({ write });
    if (env === "local" && !allowLocalRelease)
      throw new Error(
        "releaseAndroid --env local is blocked. Pass allowLocalRelease only for explicit local release testing.",
      );
    await this.applicationRunner.releaseAndroid(app, assembleType, {
      target,
      env,
      regenerate,
    });
  }

  async configureApp(app: App) {
    await this.applicationRunner.configureApp(app);
  }
  async releaseSource(app: App, options: ReleaseSourceOptions) {
    await this.applicationRunner.releaseSource(app, options);
  }
  async codepush(app: App, os: "ios" | "android") {
    await this.applicationRunner.codepush(app, os);
  }
  async transferDatabase(app: App, direction: "export" | "import", dir: string) {
    await this.applicationRunner.transferDatabase(app, direction, dir);
  }
  /** One compose project serves every app, so without a named mode it brings up what all of them declare. */
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
  /**
   * Opens a public share per app and hands the hostnames back when the session ends.
   *
   * The agent runs in *this* process rather than inside the dev server, so it is unaffected by which supervisor
   * mode `start` picked, and by the dev server restarting under it. A share opened before the app is listening
   * is not a problem either: until the origin answers, a public request is refused rather than dropped, and the
   * share starts working the moment the port opens.
   */
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
        // Printed for `--plain`; the full-screen view owns the terminal and carries the URL in its own
        // header instead, because anything written before `render` is wiped by the first repaint.
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

  /**
   * `docker compose down` takes tens of seconds on a healthy daemon and never returns on a wedged one, so the
   * teardown is bounded and the exit runs even when it fails.
   */
  #stopDatabaseOnInterrupt(workspace: Workspace) {
    this.#interrupt.add(async () => {
      await this.#stopDatabase(workspace);
    }, "Abandoning the local database teardown; containers are left running.");
  }
  async #stopDatabase(workspace: Workspace) {
    // Cleared rather than left to fire: the losing timer of this race is a live handle, and it holds the
    // event loop open for its full budget after a teardown that already succeeded.
    let timer: ReturnType<typeof setTimeout> | null = null;
    const timeout = new Promise<"timeout">((resolve) => {
      timer = setTimeout(() => resolve("timeout"), ApplicationScript.dbShutdownTimeoutMs);
    });
    try {
      const result = await Promise.race([this.dbdown(workspace).catch(() => undefined), timeout]);
      if (result !== "timeout") return;
      Logger.rawLog(
        `Local database did not stop within ${ApplicationScript.dbShutdownTimeoutMs}ms; run \`akan dbdown\` once Docker responds.`,
        undefined,
        "error",
      );
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}
