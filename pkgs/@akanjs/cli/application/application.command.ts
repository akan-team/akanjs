import type { DatabaseMode } from "@akanjs/devkit/akanConfig";
import { App, Apps, command, Exec, Sys, Workspace } from "@akanjs/devkit/commandDecorators";
import { getMobileTargetChoices } from "@akanjs/devkit/mobile";
import { select } from "@inquirer/prompts";

import { ApplicationScript } from "./application.script";

const mobileTargetOption = {
  desc: "mobile target name or all",
  ask: "Select mobile target",
  enum: async ({ app }: { app: App }) => await getMobileTargetChoices(app),
};

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
  planSlice: target({ desc: "List the exact files an app needs to live in a workspace of its own" })
    .with(App)
    .option("format", String, { desc: "output format", default: "text", enum: ["text", "json"] })
    .exec(async function (app, format) {
      await this.applicationScript.planSlice(app, format as "text" | "json");
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
  logs: target({ desc: "Tail the running application's logs, filtered (attaches to akan-control.sock)" })
    .with(App)
    .option("level", String, { desc: "minimum level: trace, verbose, debug, info, warn, error", nullable: true })
    .option("grep", String, { desc: "substring the message must contain", nullable: true })
    .option("endpoint", String, {
      desc: "endpoint glob(s), comma-separated: mutation:*, query:userList",
      nullable: true,
    })
    .option("trace", String, { desc: "one request's traceId", nullable: true })
    .option("child", String, { desc: "replica index(es), comma-separated", nullable: true })
    .option("role", String, {
      flag: "R",
      desc: "process role(s): gateway, federation, batch, all, rsc-worker",
      nullable: true,
    })
    .option("origin", String, { desc: "call origin(s): http, websocket, mcp, internal, page", nullable: true })
    .option("since", String, {
      desc: "only records newer than this: a duration ago in ms, s, m, h or d (30s, 5m, 2h), or an epoch-ms timestamp",
      nullable: true,
    })
    .option("replay", Number, { flag: "n", desc: "records to replay from the buffer before following", default: 0 })
    .option("json", Boolean, { desc: "print NDJSON records instead of rendered lines", default: false })
    .option("follow", Boolean, { desc: "keep streaming; pass --follow false for history only", default: true })
    .option("runtimeDir", String, {
      flag: "d",
      desc: "runtime dir holding akan-control.sock (default: local/apps/<app>/runtime)",
      nullable: true,
    })
    .exec(
      async function (app, level, grep, endpoint, trace, child, role, origin, since, replay, json, follow, runtimeDir) {
        await this.applicationScript.logs(app, {
          level,
          grep,
          endpoint,
          trace,
          child,
          role,
          origin,
          since,
          replay,
          json,
          follow,
          runtimeDir,
        });
      },
    ),
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
    .option("target", String, mobileTargetOption)
    .option("env", String, {
      enum: ["local", "debug", "develop", "main"],
      desc: "backend environment",
      default: "debug",
    })
    .option("write", Boolean, { desc: "write code generation", default: true })
    .option("regenerate", Boolean, { flag: "g", desc: "delete and regenerate native project", default: false })
    .exec(async function (app, target, env, write, regenerate) {
      await this.applicationScript.buildIos(app, { target, env: env, write, regenerate });
    }),
  buildAndroid: target({ short: true, desc: "Build Android app with Capacitor" })
    .with(App)
    .option("target", String, mobileTargetOption)
    .option("env", String, {
      enum: ["local", "debug", "develop", "main"],
      desc: "backend environment",
      default: "debug",
    })
    .option("write", Boolean, { desc: "write code generation", default: true })
    .option("regenerate", Boolean, { flag: "g", desc: "delete and regenerate native project", default: false })
    .exec(async function (app, target, env, write, regenerate) {
      await this.applicationScript.buildAndroid(app, { target, env: env, write, regenerate });
    }),
  start: target({ short: true, desc: "Start development server(s) (frontend SSR + backend)" })
    .with(Apps)
    .option("plain", Boolean, { desc: "print prefixed lines instead of the full-screen view", default: false })
    .option("kill", Boolean, { flag: "k", desc: "free the dev ports first, whoever is holding them", default: false })
    .option("concurrency", Number, {
      desc: "apps to boot at a time (default: what this machine's memory and cores allow)",
      nullable: true,
    })
    .option("dbup", Boolean, { desc: "start the local database first", default: true })
    .option("open", Boolean, { desc: "open web browser?", default: false })
    .option("share", Boolean, { desc: "also share each app on a public URL through an akan tunnel", default: false })
    .option("write", Boolean, { desc: "write code generation", default: true })
    .exec(async function (apps, plain, kill, concurrency, dbup, open, share, write) {
      await this.applicationScript.start(apps, { plain, kill, concurrency, dbup, open, share, write });
    }),
  startIos: target({ short: true, desc: "Start iOS app in simulator or device" })
    .with(App)
    .option("target", String, mobileTargetOption)
    .option("env", String, {
      enum: ["local", "debug", "develop", "main"],
      desc: "backend environment",
      default: "local",
    })
    .option("open", Boolean, { desc: "open ios simulator", default: false })
    .option("release", Boolean, { desc: "release mode", default: false })
    .option("write", Boolean, { desc: "write code generation", default: true })
    .option("regenerate", Boolean, { flag: "g", desc: "delete and regenerate native project", default: false })
    .option("allowProvisioningUpdates", Boolean, {
      desc: "let Xcode create or update provisioning profiles for a physical device",
      default: true,
    })
    .option("device", String, {
      desc: "run target to select non-interactively: udid, device name, or runtime (e.g. 'iPhone 16' or 'iOS 18')",
      default: "",
    })
    .exec(async function (app, target, env, open, release, write, regenerate, allowProvisioningUpdates, device) {
      await this.applicationScript.startIos(app, {
        target,
        env: env,
        open,
        operation: release ? "release" : "local",
        write,
        regenerate,
        noAllowProvisioningUpdates: !allowProvisioningUpdates,
        device: device || undefined,
      });
    }),
  startAndroid: target({ short: true, desc: "Start Android app in emulator or device" })
    .with(App)
    .option("target", String, mobileTargetOption)
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
        env: env,
        open,
        operation: release ? "release" : "local",
        write,
        regenerate,
      });
    }),
  releaseIos: target({ desc: "Build and package iOS app for release (App Store)" })
    .with(App)
    .option("target", String, mobileTargetOption)
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
        env: env,
        write,
        regenerate,
        allowLocalRelease,
      });
    }),
  releaseAndroid: target({ desc: "Build and package Android app for release (Play Store)" })
    .with(App)
    .option("assembleType", String, { enum: ["apk", "aab"], default: "apk" })
    .option("target", String, mobileTargetOption)
    .option("env", String, {
      enum: ["debug", "develop", "main", "local"],
      desc: "backend environment",
      default: "main",
    })
    .option("write", Boolean, { desc: "write code generation", default: true })
    .option("regenerate", Boolean, { flag: "g", desc: "delete and regenerate native project", default: false })
    .option("allowLocalRelease", Boolean, { flag: "l", desc: "allow release with --env local", default: false })
    .exec(async function (app, assembleType, target, env, write, regenerate, allowLocalRelease) {
      await this.applicationScript.releaseAndroid(app, assembleType, {
        target,
        env: env,
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
      desc: "database mode; left out, every mode the workspace's apps declare",
      enum: ["single", "multiple", "cluster"],
      nullable: true,
    })
    .exec(async function (workspace, mode) {
      await this.applicationScript.dbupDeclared(workspace, mode as DatabaseMode | null);
    }),
  dbExport: target({ desc: "Write every model table of an app to one NDJSON file each" })
    .with(App)
    .option("dir", String, { desc: "directory under the workspace to write", default: "local/transfer" })
    .exec(async function (app, dir) {
      await this.applicationScript.transferDatabase(app, "export", dir);
    }),
  dbImport: target({ desc: "Read files db-export wrote into an app's database, in the mode the shell names" })
    .with(App)
    .option("dir", String, { desc: "directory under the workspace to read", default: "local/transfer" })
    .exec(async function (app, dir) {
      await this.applicationScript.transferDatabase(app, "import", dir);
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
