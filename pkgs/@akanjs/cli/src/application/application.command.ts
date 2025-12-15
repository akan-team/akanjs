import { App, Argument, Commands, Option, Sys, Target, Workspace } from "@akanjs/devkit";
import { select } from "@inquirer/prompts";

import { ApplicationScript } from "./application.script";

@Commands()
export class ApplicationCommand {
  applicationScript = new ApplicationScript();

  @Target.Public()
  async createApplication(
    @Argument("appName", { desc: "name of application" }) appName: string,
    @Option("start", { type: "boolean", desc: "start application", default: false }) start: boolean,
    @Workspace() workspace: Workspace
  ) {
    await this.applicationScript.createApplication(appName.toLowerCase().replace(/ /g, "-"), workspace, { start });
  }
  @Target.Public()
  async removeApplication(@App() app: App) {
    await this.applicationScript.removeApplication(app);
  }
  //* ================== prepare ================== * //
  @Target.Public()
  async sync(@Sys() sys: Sys) {
    await this.applicationScript.sync(sys);
  }
  @Target.Public()
  async script(
    @App() app: App,
    @Argument("filename", { desc: "name of script", nullable: true }) filename: string | null
  ) {
    await this.applicationScript.script(app, filename);
  }
  //* ================== prepare ================== * //

  //* ================== build ================== * //
  @Target.Public({ short: true })
  async build(@App() app: App) {
    await this.applicationScript.build(app);
  }

  @Target.Public({ short: true })
  async buildBackend(@App() app: App) {
    await this.applicationScript.buildBackend(app);
  }

  @Target.Public({ short: true })
  async buildFrontend(@App() app: App) {
    await this.applicationScript.buildFrontend(app, { standalone: true });
  }

  @Target.Public({ short: true })
  async buildCsr(@App() app: App) {
    await this.applicationScript.buildCsr(app);
  }

  @Target.Public({ short: true })
  async buildIos(@App() app: App) {
    await this.applicationScript.buildIos(app);
  }

  @Target.Public({ short: true })
  async buildAndroid(@App() app: App) {
    await this.applicationScript.buildAndroid(app);
  }
  //* ================== build ================== * //

  //* ================== start ================== * //
  @Target.Public({ short: true })
  async start(
    @App() app: App,
    @Option("open", { type: "boolean", desc: "open web browser?", default: false }) open: boolean,
    @Option("sync", { type: "boolean", desc: "sync application", default: true }) sync: boolean
  ) {
    await this.applicationScript.start(app, { open, sync });
  }

  @Target.Public({ short: true })
  async startBackend(
    @App() app: App,
    @Option("open", { type: "boolean", desc: "open graphql playground", default: false }) open: boolean,
    @Option("sync", { type: "boolean", desc: "sync application", default: true }) sync: boolean
  ) {
    await this.applicationScript.startBackend(app, { open, sync });
  }

  @Target.Public({ short: true })
  async startFrontend(
    @App() app: App,
    @Option("open", { type: "boolean", desc: "open web browser", default: false }) open: boolean,
    @Option("turbo", { type: "boolean", desc: "turbo", default: false }) turbo: boolean,
    @Option("sync", { type: "boolean", desc: "sync application", default: true }) sync: boolean
  ) {
    await this.applicationScript.startFrontend(app, { open, turbo, sync });
  }

  @Target.Public({ short: true })
  async startCsr(
    @App() app: App,
    @Option("open", { type: "boolean", desc: "open web browser", default: false }) open: boolean,
    @Option("sync", { type: "boolean", desc: "sync application", default: true }) sync: boolean
  ) {
    await this.applicationScript.startCsr(app, { open, sync });
  }

  @Target.Public({ short: true })
  async startIos(
    @App() app: App,
    @Option("open", { type: "boolean", desc: "open ios simulator", default: false }) open: boolean,
    @Option("release", { type: "boolean", desc: "release mode", default: false }) release: boolean,
    @Option("sync", { type: "boolean", desc: "sync application", default: true }) sync: boolean
  ) {
    //! 추후 param에서 select할 수 있도록 수정 필요
    const operation_: "local" | "release" = await select({
      message: "Select ios operation mode",
      choices: [
        { value: "local", name: "local", description: "Connect to the React web server." },
        { value: "release", name: "release", description: "Real production package environment." },
      ],
    });
    const host_: "local" | "debug" | "develop" | "main" = await select({
      message: "Select connect backend server.",
      choices: [
        { value: "local", name: "local", description: "connect to the localhost backend server." },
        { value: "debug", name: "debug", description: "connect to the debug cloud backend server." },
        { value: "develop", name: "develop", description: "connect to the develop cloud backend server." },
        { value: "main", name: "main", description: "connect to the main cloud backend server." },
      ],
    });

    await this.applicationScript.startIos(app, { open, host: host_, operation: operation_, sync });
  }

  @Target.Public({ short: true })
  async startAndroid(
    @App() app: App,
    @Option("host", {
      type: "string",
      enum: ["local", "debug", "develop", "main"],
      desc: "host sever",
      default: "local",
    })
    host: "local" | "debug" | "develop" | "main",
    @Option("release", { type: "boolean", desc: "release mode", default: false }) release: boolean,
    @Option("open", { type: "boolean", desc: "open android simulator", default: false }) open: boolean,
    @Option("sync", { type: "boolean", desc: "sync application", default: true }) sync: boolean
  ) {
    //! 추후 param에서 select할 수 있도록 수정 필요
    const host_: "local" | "debug" | "develop" | "main" = await select({
      message: "Select  connect backend server.",
      choices: [
        { value: "local", name: "local", description: "connect to the localhost backend server." },
        { value: "debug", name: "debug", description: "connect to the debug cloud backend server." },
        { value: "develop", name: "develop", description: "connect to the develop cloud backend server." },
        { value: "main", name: "main", description: "connect to the main cloud backend server." },
      ],
    });
    const operation_: "local" | "release" = await select({
      message: "Select android operation mode",
      choices: [
        { value: "local", name: "local", description: "Connect to the React web server." },
        { value: "release", name: "release", description: "Real production package environment." },
      ],
    });
    await this.applicationScript.startAndroid(app, { open, operation: operation_, host: host_, sync });
  }

  //* ================== start ================== * //

  //* ================== release ================== * //
  @Target.Public()
  async releaseIos(@App() app: App) {
    await this.applicationScript.releaseIos(app);
  }

  @Target.Public()
  async releaseAndroid(
    @App() app: App,
    @Option("assembleType", { type: "string", enum: ["apk", "aab"], default: "apk" }) assembleType: "apk" | "aab"
  ) {
    await this.applicationScript.releaseAndroid(app, assembleType);
  }

  @Target.Public()
  async releaseSource(
    @App() app: App,
    @Option("rebuild", { type: "boolean", desc: "rebuild", default: false }) rebuild: boolean,
    @Option("buildNum", { desc: "build number", default: 0 }) buildNum: number,
    @Option("environment", { desc: "environment", default: "debug" }) environment: string,
    @Option("local", { type: "boolean", desc: "local", default: true }) local: boolean
  ) {
    await this.applicationScript.releaseSource(app, { rebuild, buildNum, environment, local });
  }

  @Target.Public()
  async codepush(@App() app: App) {
    //! 추후 param에서 select할 수 있도록 수정 필요
    const os: "ios" | "android" = await select({
      message: "Select os",
      choices: [
        { value: "ios", name: "ios", description: "ios" },
        { value: "android", name: "android", description: "android" },
      ],
    });
    await this.applicationScript.codepush(app, os);
  }
  //* ================== release ================== * //

  //* ================== database ================== * //
  @Target.Public()
  async dumpDatabase(
    @App() app: App,
    @Option("environment", {
      desc: "environment",
      default: "debug",
      enum: ["debug", "develop", "main"],
      ask: "Select the environment to dump the database",
    })
    environment: string
  ) {
    await this.applicationScript.dumpDatabase(app, environment);
  }

  @Target.Public()
  async restoreDatabase(
    @App() app: App,
    @Option("source", {
      desc: "source environment",
      enum: ["debug", "develop", "main"],
      ask: "Select the source environment of local dump",
    })
    source: string,
    @Option("target", {
      desc: "target environment",
      enum: ["debug", "develop", "main"],
      ask: "Select the target environment to restore the database",
    })
    target: string
  ) {
    await this.applicationScript.restoreDatabase(app, source, target);
  }

  @Target.Public()
  async dbup(@Workspace() workspace: Workspace) {
    await this.applicationScript.dbup(workspace);
  }

  @Target.Public()
  async dbdown(@Workspace() workspace: Workspace) {
    await this.applicationScript.dbdown(workspace);
  }

  @Target.Public()
  async pullDatabase(
    @App() app: App,
    @Option("env", { default: "debug" }) env: string,
    @Option("dump", { default: true }) dump: boolean
  ) {
    await this.applicationScript.pullDatabase(app, env, dump);
  }
  //* ================== database ================== * //

  @Target.Public()
  async configureApp(@App() app: App) {
    await this.applicationScript.configureApp(app);
  }
}
