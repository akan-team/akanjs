import type { App, Lib, Sys, Workspace } from "@akanjs/devkit";

import { LibraryScript } from "../library/library.script";
import { Interface } from "./application.interface";
import { ApplicationRunner, type ReleaseSourceOptions } from "./application.runner";

export class ApplicationScript {
  #runner = new ApplicationRunner();
  libraryScript = new LibraryScript();

  async createApplication(
    appName: string,
    workspace: Workspace,
    { start = false, libs = [] }: { start?: boolean; libs?: string[] } = {}
  ) {
    const spinner = workspace.spinning("Creating application...");
    const app = await this.#runner.createApplication(appName, workspace, libs);
    spinner.succeed(`Application created in apps/${app.name}`);
    await this.syncApplication(app);
    if (start) await this.start(app, { open: true });
  }
  async removeApplication(app: App) {
    const spinner = app.spinning("Removing application...");
    await this.#runner.removeApplication(app);
    spinner.succeed(`Application ${app.name} (apps/${app.name}) removed`);
  }
  async sync(sys: Sys) {
    if (sys.type === "app") await this.syncApplication(sys as App);
    else await this.libraryScript.syncLibrary(sys as Lib);
  }

  async syncApplication(app: App) {
    const spinner = app.spinning("Scanning application...");
    const scanInfo = await this.#runner.scanSync(app);
    spinner.succeed("Application scanned");
    return scanInfo;
  }

  async script(app: App, filename: string | null) {
    const scriptFilename = filename ?? (await this.#runner.getScriptFilename(app));
    await this.syncApplication(app);
    await this.#runner.runScript(app, scriptFilename);
  }

  async build(app: App) {
    await this.syncApplication(app);
    await Promise.all([this.buildBackend(app, { sync: false }), this.buildFrontend(app, { sync: false })]);
  }

  async start(
    app: App,
    { dbup = true, open = false, sync = true }: { dbup?: boolean; open?: boolean; sync?: boolean } = {}
  ) {
    const needDbup = app.getEnv() === "local" && dbup;
    if (sync) await this.syncApplication(app);
    if (needDbup) await this.dbup(app.workspace);
    const [backend, frontend, { server: csrServer, eventEmitter: csr }] = await Promise.all([
      this.startBackend(app, { open, withInk: true, sync: false }),
      this.startFrontend(app, { open, withInk: true, sync: false }),
      this.startCsr(app, { open, withInk: true, sync: false }),
    ]);
    process.on("SIGINT", async () => {
      await csrServer.close();
      backend.kill();
      frontend.kill();
      csr.removeAllListeners();
      if (needDbup) await this.dbdown(app.workspace);
      process.exit(0);
    });
    Interface.Start(app.name, backend, frontend, csr);
  }

  async buildBackend(app: App, { sync = true }: { sync?: boolean } = {}) {
    if (sync) await this.syncApplication(app);
    const spinner = app.spinning("Building backend...");
    await this.#runner.buildBackend(app);
    spinner.succeed(`Backend built in dist/apps/${app.name}/backend`);
  }

  async startBackend(
    app: App,
    {
      open = false,
      dbup = true,
      sync = true,
      withInk = false,
    }: { open?: boolean; dbup?: boolean; sync?: boolean; withInk?: boolean } = {}
  ) {
    if (app.getEnv() === "local" && dbup) {
      await this.dbup(app.workspace);
      process.on("SIGINT", async () => {
        await this.dbdown(app.workspace);
        process.exit(0);
      });
    }
    if (sync) await this.syncApplication(app);
    const spinner = app.spinning("Preparing backend...");
    const childProcess = await this.#runner.startBackend(app, {
      open,
      onStart: () => {
        spinner.succeed(`Backend prepared, ready to start`);
      },
      withInk,
    });
    return childProcess;

    // Interface.Backend(app.name, childProcess);
  }

  async buildFrontend(app: App, { sync = true, standalone = false }: { sync?: boolean; standalone?: boolean } = {}) {
    if (sync) await this.syncApplication(app);
    if (standalone) await this.#runner.buildFrontend(app, { spawnOptions: { stdio: "inherit" } });
    else {
      const spinner = app.spinning("Building frontend...");
      await this.#runner.buildFrontend(app);
      spinner.succeed(`Frontend built in dist/apps/${app.name}/frontend`);
    }
  }
  async startFrontend(
    app: App,
    {
      open = false,
      turbo = false,
      sync = true,
      withInk = false,
    }: { open?: boolean; turbo?: boolean; sync?: boolean; withInk?: boolean } = {}
  ) {
    if (sync) await this.syncApplication(app);
    const spinner = app.spinning("Preparing frontend...");
    const childProcess = await this.#runner.startFrontend(app, {
      open,
      turbo,
      onStart: () => {
        spinner.succeed(`Frontend prepared, ready to start`);
      },
      withInk,
    });
    return childProcess;
  }
  async buildCsr(app: App, { sync = true }: { sync?: boolean } = {}) {
    if (sync) await this.syncApplication(app);
    const spinner = app.spinning("Building CSR...");
    await this.#runner.buildCsr(app);
    spinner.succeed(`Successfully built in dist/apps/${app.name}/csr`);
  }
  async startCsr(
    app: App,
    { open = false, sync = true, withInk = false }: { open?: boolean; sync?: boolean; withInk?: boolean } = {}
  ) {
    if (sync) await this.syncApplication(app);
    const { eventEmitter, server } = await this.#runner.startCsr(app, {
      open,
      onStart: () => {
        //
      },
      withInk,
    });

    return { eventEmitter, server };
  }
  async buildIos(app: App, { sync = true }: { sync?: boolean } = {}) {
    if (sync) await this.syncApplication(app);
    await this.#runner.buildIos(app);
  }
  async startIos(
    app: App,
    {
      open = false,
      operation = "local",
      host = "local",
      sync = true,
    }: {
      operation: "local" | "release";
      host: "local" | "debug" | "develop" | "main";
      open?: boolean;
      sync?: boolean;
    }
  ) {
    if (sync) await this.syncApplication(app);

    await this.#runner.startIos(app, { open, operation });
  }
  async releaseIos(app: App, { sync = true }: { sync?: boolean } = {}) {
    await this.buildCsr(app, { sync });
    await this.#runner.releaseIos(app);
  }
  async buildAndroid(app: App, { sync = true }: { sync?: boolean } = {}) {
    if (sync) await this.syncApplication(app);
    await this.#runner.buildAndroid(app);
  }
  async startAndroid(
    app: App,
    {
      open = false,
      operation = "local",
      host = "local",
      sync = true,
    }: {
      open?: boolean;
      host?: "local" | "debug" | "develop" | "main";
      operation?: "local" | "release";
      sync?: boolean;
    } = {}
  ) {
    if (sync) await this.syncApplication(app);
    await this.#runner.startAndroid(app, { open, operation, host });
  }
  //* 안드로이드 릴리즈(apk or aab 추출) 메서드
  async releaseAndroid(app: App, assembleType: "apk" | "aab") {
    try {
      await app.increaseBuildNum();
      await this.buildCsr(app, { sync: true });
      await this.#runner.releaseAndroid(app, assembleType);
    } catch (e) {
      await app.decreaseBuildNum();
    }
  }

  async dumpDatabase(app: App, environment: string) {
    await this.dbdown(app.workspace);
    const spinner = app.spinning(`Dumping database ${app.name} (${environment})...`);
    await this.#runner.dumpDatabase(app, environment);
    spinner.succeed(`Database ${app.name} (${environment}) dumped to dump/${app.name}-${environment}`);
  }
  async restoreDatabase(app: App, source: string, target: string) {
    const spinner = app.spinning(`Restoring database ${app.name} (${source}) to ${target}...`);
    await this.#runner.restoreDatabase(app, source, target);
    spinner.succeed(`Database ${app.name} (${source}) restored to ${target}`);
  }
  async pullDatabase(app: App, environment: string, dump?: boolean) {
    const hasDump = app.workspace.exists(`dump/${app.name}-${environment}`);
    if (dump || !hasDump) await this.dumpDatabase(app, environment);
    await this.dbup(app.workspace);
    await this.restoreDatabase(app, environment, "local");
  }

  async configureApp(app: App) {
    await this.#runner.configureApp(app);
  }
  async releaseSource(app: App, options: ReleaseSourceOptions) {
    await this.#runner.releaseSource(app, options);
  }
  async codepush(app: App, os: "ios" | "android") {
    await this.#runner.codepush(app, os);
  }
  async dbup(workspace: Workspace) {
    const spinner = workspace.spinning("Starting local database...");
    await this.#runner.dbup(workspace);
    spinner.succeed("Local database (/local/docker-compose.yaml) is up");
  }
  async dbdown(workspace: Workspace) {
    const spinner = workspace.spinning("Stopping local database...");
    await this.#runner.dbdown(workspace);
    spinner.succeed("Local database (/local/docker-compose.yaml) is down");
  }
  async testSys(sys: Sys) {
    if (sys.type === "app") await this.testApplication(sys as App);
    else await this.libraryScript.testLibrary(sys as Lib);
  }
  async testApplication(app: App) {
    const spinner = app.spinning("Testing application...");
    await this.#runner.testApplication(app);
    spinner.succeed(`Application ${app.name} (apps/${app.name}) test is successful`);
  }
}
