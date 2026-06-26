import { App, command, Exec, getMobileTargetChoices, Sys, Workspace } from "@akanjs/devkit";
import { select } from "@inquirer/prompts";

import { ApplicationScript } from "./application.script";

const asMobileEnv = (env: string) => env as "local" | "debug" | "develop" | "main";

export class ApplicationCommand extends command("application", [ApplicationScript], ({ public: target }) => ({
  createApplication: target({ desc: "Create a new application in the workspace" })
    .arg("appName", String, { desc: "name of application" })
    .option("start", Boolean, { desc: "start application", default: false })
    .with(Workspace)
    .exec(async function (appName, start, workspace) {
      await this.applicationScript.createApplication(appName.toLowerCase().replace(/ /g, "-"), workspace, { start });
    }),
  removeApplication: target({ desc: "Remove an application from the workspace" })
    .with(App)
    .exec(async function (app) {
      await this.applicationScript.removeApplication(app);
    }),
  sync: target({ desc: "Sync dependencies and configuration for an app or library" })
    .with(Sys)
    .exec(async function (sys) {
      await this.applicationScript.sync(sys);
    }),
  script: target({ desc: "Run a custom script in the application" })
    .with(App)
    .arg("filename", String, { desc: "name of script", nullable: true })
    .exec(async function (app, filename) {
      await this.applicationScript.script(app, filename);
    }),
  console: target({ desc: "Open an interactive server console for the application" })
    .with(App)
    .exec(async function (app) {
      await this.applicationScript.console(app);
    }),
  build: target({ short: true, desc: "Build the application for production (frontend + backend)" })
    .with(App)
    .option("write", Boolean, { desc: "write code generation", default: true })
    .option("fast", Boolean, { desc: "fast build", default: false })
    .option("quiet", Boolean, { desc: "hide build progress output", default: false })
    .exec(async function (app, write, fast, quiet) {
      await this.applicationScript.build(app, { write, fast, quiet });
    }),
  typecheck: target({ short: true, desc: "Typecheck the application" })
    .with(App)
    .option("write", Boolean, { desc: "write code generation", default: true })
    .option("clean", Boolean, { desc: "clear typecheck cache before running", default: false })
    .option("incremental", Boolean, { desc: "reuse TypeScript incremental cache", default: true })
    .exec(async function (app, write, clean, incremental) {
      await this.applicationScript.typecheck(app, { write, clean, incremental });
    }),
  test: target({ desc: "Prepare and test an app, library, or package" })
    .with(Exec)
    .option("write", Boolean, { desc: "write code generation", default: true })
    .exec(async function (exec, write) {
      await this.applicationScript.test(exec, { write });
    }),
  buildIos: target({ short: true, desc: "Build iOS app with Capacitor" })
    .with(App)
    .option("target", String, {
      desc: "mobile target name or all",
      ask: "Select mobile target",
      enum: async ({ app }) => await getMobileTargetChoices(app),
    })
    .option("env", String, {
      enum: ["local", "debug", "develop", "main"],
      desc: "backend environment",
      default: "debug",
    })
    .option("write", Boolean, { desc: "write code generation", default: true })
    .option("regenerate", Boolean, { flag: "g", desc: "delete and regenerate native project", default: false })
    .exec(async function (app, target, env, write, regenerate) {
      await this.applicationScript.buildIos(app, { target, env: asMobileEnv(env), write, regenerate });
    }),
  buildAndroid: target({ short: true, desc: "Build Android app with Capacitor" })
    .with(App)
    .option("target", String, {
      desc: "mobile target name or all",
      ask: "Select mobile target",
      enum: async ({ app }) => await getMobileTargetChoices(app),
    })
    .option("env", String, {
      enum: ["local", "debug", "develop", "main"],
      desc: "backend environment",
      default: "debug",
    })
    .option("write", Boolean, { desc: "write code generation", default: true })
    .option("regenerate", Boolean, { flag: "g", desc: "delete and regenerate native project", default: false })
    .exec(async function (app, target, env, write, regenerate) {
      await this.applicationScript.buildAndroid(app, { target, env: asMobileEnv(env), write, regenerate });
    }),
  start: target({ short: true, desc: "Start development server (frontend SSR + backend)" })
    .with(App)
    .option("open", Boolean, { desc: "open web browser?", default: false })
    .option("write", Boolean, { desc: "write code generation", default: true })
    .exec(async function (app, open, write) {
      await this.applicationScript.start(app, { open, write });
    }),
  startIos: target({ short: true, desc: "Start iOS app in simulator or device" })
    .with(App)
    .option("target", String, {
      ask: "Select mobile target",
      enum: async ({ app }) => await getMobileTargetChoices(app),
    })
    .option("env", String, {
      enum: ["local", "debug", "develop", "main"],
      desc: "backend environment",
      default: "local",
    })
    .option("open", Boolean, { desc: "open ios simulator", default: false })
    .option("release", Boolean, { desc: "release mode", default: false })
    .option("write", Boolean, { desc: "write code generation", default: true })
    .option("regenerate", Boolean, { flag: "g", desc: "delete and regenerate native project", default: false })
    .option("noAllowProvisioningUpdates", Boolean, {
      desc: "disable automatic iOS provisioning updates for physical devices",
      default: false,
    })
    .exec(async function (app, target, env, open, release, write, regenerate, noAllowProvisioningUpdates) {
      await this.applicationScript.startIos(app, {
        target,
        env: asMobileEnv(env),
        open,
        operation: release ? "release" : "local",
        write,
        regenerate,
        noAllowProvisioningUpdates,
      });
    }),
  startAndroid: target({ short: true, desc: "Start Android app in emulator or device" })
    .with(App)
    .option("target", String, { desc: "mobile target name or all" })
    .option("env", String, {
      enum: ["local", "debug", "develop", "main"],
      desc: "backend environment",
      default: "local",
    })
    .option("release", Boolean, { desc: "release mode", default: false })
    .option("open", Boolean, { desc: "open android simulator", default: false })
    .option("write", Boolean, { desc: "write code generation", default: true })
    .option("regenerate", Boolean, { flag: "g", desc: "delete and regenerate native project", default: false })
    .exec(async function (app, target, env, release, open, write, regenerate) {
      await this.applicationScript.startAndroid(app, {
        target,
        env: asMobileEnv(env),
        open,
        operation: release ? "release" : "local",
        write,
        regenerate,
      });
    }),
  releaseIos: target({ desc: "Build and package iOS app for release (App Store)" })
    .with(App)
    .option("target", String, { desc: "mobile target name or all" })
    .option("env", String, {
      enum: ["debug", "develop", "main", "local"],
      desc: "backend environment",
      default: "main",
    })
    .option("write", Boolean, { desc: "write code generation", default: true })
    .option("regenerate", Boolean, { flag: "g", desc: "delete and regenerate native project", default: false })
    .option("allowLocalRelease", Boolean, { flag: "l", desc: "allow release with --env local", default: false })
    .exec(async function (app, target, env, write, regenerate, allowLocalRelease) {
      await this.applicationScript.releaseIos(app, {
        target,
        env: asMobileEnv(env),
        write,
        regenerate,
        allowLocalRelease,
      });
    }),
  releaseAndroid: target({ desc: "Build and package Android app for release (Play Store)" })
    .with(App)
    .option("assembleType", String, { enum: ["apk", "aab"], default: "apk" })
    .option("target", String, { desc: "mobile target name or all" })
    .option("env", String, {
      enum: ["debug", "develop", "main", "local"],
      desc: "backend environment",
      default: "main",
    })
    .option("write", Boolean, { desc: "write code generation", default: true })
    .option("regenerate", Boolean, { flag: "g", desc: "delete and regenerate native project", default: false })
    .option("allowLocalRelease", Boolean, { flag: "l", desc: "allow release with --env local", default: false })
    .exec(async function (app, assembleType, target, env, write, regenerate, allowLocalRelease) {
      await this.applicationScript.releaseAndroid(app, assembleType as "apk" | "aab", {
        target,
        env: asMobileEnv(env),
        write,
        regenerate,
        allowLocalRelease,
      });
    }),
  releaseSource: target({ desc: "Release app source code with OTA update support" })
    .with(App)
    .option("rebuild", Boolean, { desc: "rebuild", default: false })
    .option("buildNum", Number, { desc: "build number", default: 0 })
    .option("environment", String, { desc: "environment", default: "debug" })
    .option("local", Boolean, { desc: "local", default: true })
    .exec(async function (app, rebuild, buildNum, environment, local) {
      await this.applicationScript.releaseSource(app, { rebuild, buildNum, environment, local });
    }),
  codepush: target({ desc: "Deploy over-the-air (OTA) update for mobile app" })
    .with(App)
    .exec(async function (app) {
      const os: "ios" | "android" = await select({
        message: "Select os",
        choices: [
          { value: "ios", name: "ios", description: "ios" },
          { value: "android", name: "android", description: "android" },
        ],
      });
      await this.applicationScript.codepush(app, os);
    }),
  dbup: target({ desc: "Start local database services for a database mode" })
    .with(Workspace)
    .option("mode", String, {
      desc: "database mode",
      default: "multiple",
      enum: ["single", "multiple", "cluster"],
    })
    .exec(async function (workspace, mode) {
      await this.applicationScript.dbup(workspace, mode as "single" | "multiple" | "cluster");
    }),
  dbdown: target({ desc: "Stop local database services" })
    .with(Workspace)
    .exec(async function (workspace) {
      await this.applicationScript.dbdown(workspace);
    }),
  configureApp: target({ desc: "Configure application settings interactively" })
    .with(App)
    .exec(async function (app) {
      await this.applicationScript.configureApp(app);
    }),
})) {}
