import {
  type AkanAppConfig,
  type App,
  ApplicationBuildReporter,
  type DatabaseMode,
  type Exec,
  type Lib,
  LibExecutor,
  type MobileEnv,
  PkgExecutor,
  type ReleaseSourceOptions,
  type Sys,
  script,
  type TypecheckOptions,
  type Workspace,
} from "@akanjs/devkit";
import { confirm } from "@inquirer/prompts";
import { Logger } from "akanjs/common";
import { LibraryScript } from "../library/library.script";
import { ApplicationRunner } from "./application.runner";

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
    if (start) await this.start(app, { open: true });
  }
  async removeApplication(app: App) {
    const spinner = app.spinning("Removing application...");
    await this.applicationRunner.removeApplication(app);
    spinner.succeed(`Application ${app.name} (apps/${app.name}) removed`);
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
    app: App,
    {
      open = false,
      dbup = true,
      withInk = false,
      write = true,
    }: {
      open?: boolean;
      dbup?: boolean;
      withInk?: boolean;
      write?: boolean;
    } = {},
  ) {
    await app.scanSync({ write });
    const akanConfig = await app.getConfig();
    const databaseMode = (process.env.AKAN_DATABASE_MODE ?? akanConfig.defaultDatabaseMode ?? "single") as DatabaseMode;
    await this.syncDatabaseModeDependencies(app, akanConfig, databaseMode);
    if (app.getEnv() === "local" && dbup && databaseMode !== "single") {
      const wasDbAlreadyUp = await this.dbup(app.workspace, databaseMode);
      if (!wasDbAlreadyUp)
        process.on("SIGINT", async () => {
          await this.dbdown(app.workspace);
          process.exit(0);
        });
    }
    const spinner = app.spinning("Preparing backend...");
    const akanAppHost = await this.applicationRunner.start(app, {
      open,
      onStart: () => {
        spinner.succeed(`${app.name} prepared, ready to start`);
      },
      withInk,
    });
    return akanAppHost;
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
  async dbup(workspace: Workspace, mode: DatabaseMode = "multiple"): Promise<boolean> {
    const spinner = workspace.spinning(`Starting local database (${mode})...`);
    const wasAlreadyUp = await this.applicationRunner.dbup(workspace, mode);
    spinner.succeed(wasAlreadyUp ? `Local database (${mode}) was already up` : `Local database (${mode}) is up`);
    return wasAlreadyUp;
  }
  async dbdown(workspace: Workspace) {
    const spinner = workspace.spinning("Stopping local database...");
    await this.applicationRunner.dbdown(workspace);
    spinner.succeed("Local database (/local/docker-compose.yaml) is down");
  }
  async testSys(sys: Sys) {
    if (sys.type === "app") await this.testApplication(sys as App);
    else await this.libraryScript.testLibrary(sys as Lib);
  }
  async testApplication(app: App) {
    const spinner = app.spinning("Testing application...");
    await this.applicationRunner.testApplication(app);
    spinner.succeed(`Application ${app.name} (apps/${app.name}) test is successful`);
  }
}
