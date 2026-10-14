import type { DatabaseMode } from "@akanjs/devkit/akanConfig";
import { App, Apps, command, Exec, Sys, SysOrOnlyApp, Workspace } from "@akanjs/devkit/commandDecorators";
import { ApplicationScript } from "./application.script";
import { allowLocalOption, nativeTargetOption, releaseEnvOption, writeOption } from "./commandOptions";

const deviceOption = {
  desc: "simulator, emulator or device to run on: its id or name (e.g. 'iPhone 17' or 'Pixel_10')",
  default: "",
};
const teamOption = { flag: "T", desc: "Apple team id the signing is narrowed to", default: "" };
const signDesc =
  "sign with the identity AKAN_NATIVE_MACOS_* / AKAN_NATIVE_WINDOWS_* names (without it the env signs nothing)";
const notarizeDesc = "macOS: upload the signed app to Apple's notary service (takes --sign)";
const devEnvs = ["local", "debug", "develop", "main"] as const;
const buildEnvOption = { enum: devEnvs, desc: "backend environment", default: "debug" } as const;
const startEnvOption = {
  enum: devEnvs,
  desc: "backend environment of a --release build; a dev build follows `akan start`, which keeps its own",
  default: "local",
} as const;

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
    .option("write", Boolean, writeOption)
    .option("fast", Boolean, { desc: "fast build", default: false })
    .option("quiet", Boolean, { desc: "hide build progress output", default: false })
    .option("profile", String, {
      desc: "server env profile: bundle env/env.server.<env>.<profile>.ts in place of the environment's own file",
      nullable: true,
    })
    .exec(async function (app, write, fast, quiet, profile) {
      await this.applicationScript.build(app, { write, fast, quiet, profile: profile ?? undefined });
    }),
  typecheck: target({ short: true, desc: "Typecheck an app or a library, its tests and specs included" })
    .with(SysOrOnlyApp)
    .option("write", Boolean, writeOption)
    .option("clean", Boolean, { desc: "clear typecheck cache before running", default: false })
    .option("incremental", Boolean, { desc: "reuse TypeScript incremental cache", default: true })
    .option("tests", Boolean, { desc: "check its *.test.ts / *.spec.ts too, which nothing imports", default: true })
    .exec(async function (sys, write, clean, incremental, tests) {
      await this.applicationScript.typecheck(sys, { write, clean, incremental, tests });
    }),
  test: target({ desc: "Prepare and test an app, library, or package" })
    .with(Exec)
    .option("write", Boolean, writeOption)
    .exec(async function (exec, write) {
      await this.applicationScript.test(exec, { write });
    }),
  buildIos: target({ short: true, desc: "Build the iOS app on the native runtime" })
    .with(App)
    .option("target", String, nativeTargetOption)
    .option("env", String, buildEnvOption)
    .option("debug", Boolean, { desc: "debug build instead of release", default: false })
    .option("write", Boolean, writeOption)
    .exec(async function (app, target, env, debug, write) {
      await this.applicationScript.buildIos(app, { target, env, profile: debug ? "debug" : "release", write });
    }),
  buildAndroid: target({ short: true, desc: "Build the Android app (apk) on the native runtime" })
    .with(App)
    .option("target", String, nativeTargetOption)
    .option("env", String, buildEnvOption)
    .option("debug", Boolean, { desc: "debug build instead of release", default: false })
    .option("write", Boolean, writeOption)
    .exec(async function (app, target, env, debug, write) {
      await this.applicationScript.buildAndroid(app, { target, env, profile: debug ? "debug" : "release", write });
    }),
  buildDesktop: target({ short: true, desc: "Build the desktop app for this computer (macOS, Windows or Linux)" })
    .with(App)
    .option("target", String, nativeTargetOption)
    .option("env", String, buildEnvOption)
    .option("debug", Boolean, { desc: "debug build instead of release", default: false })
    .option("installer", Boolean, {
      desc: "also what a person downloads: a Windows setup program (NSIS, /S for silent), a macOS dmg, a Linux AppImage",
      default: false,
    })
    .option("arch", String, {
      desc: "the CPU the app runs on, arm64 or x64 of this OS (default this computer's); a macOS app is arm64 only",
      enum: ["arm64", "x64"] as const,
      nullable: true,
    })
    .option("sign", Boolean, { desc: signDesc, default: false })
    .option("notarize", Boolean, { desc: notarizeDesc, default: false })
    .option("write", Boolean, writeOption)
    .exec(async function (app, target, env, debug, installer, arch, sign, notarize, write) {
      await this.applicationScript.buildDesktop(app, {
        target,
        env,
        profile: debug ? "debug" : "release",
        installer,
        write,
        ...(sign ? { sign } : {}),
        ...(notarize ? { notarize } : {}),
        ...(arch ? { arch } : {}),
      });
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
    .option("write", Boolean, writeOption)
    .exec(async function (apps, plain, kill, concurrency, dbup, open, share, write) {
      await this.applicationScript.start(apps, { plain, kill, concurrency, dbup, open, share, write });
    }),
  startIos: target({ short: true, desc: "Run the iOS app in a simulator or on an iPhone, following `akan start`" })
    .with(App)
    .option("target", String, nativeTargetOption)
    .option("env", String, startEnvOption)
    .option("release", Boolean, { desc: "run a release build of its own bundle instead", default: false })
    .option("device", String, deviceOption)
    .option("team", String, teamOption)
    .option("write", Boolean, writeOption)
    .exec(async function (app, target, env, release, device, team, write) {
      await this.applicationScript.startIos(app, {
        target,
        env,
        operation: release ? "release" : "local",
        device: device || undefined,
        teamId: team || undefined,
        write,
      });
    }),
  startAndroid: target({
    short: true,
    desc: "Run the Android app in an emulator or on a device, following `akan start`",
  })
    .with(App)
    .option("target", String, nativeTargetOption)
    .option("env", String, startEnvOption)
    .option("release", Boolean, { desc: "run a release build of its own bundle instead", default: false })
    .option("device", String, deviceOption)
    .option("write", Boolean, writeOption)
    .exec(async function (app, target, env, release, device, write) {
      await this.applicationScript.startAndroid(app, {
        target,
        env,
        operation: release ? "release" : "local",
        device: device || undefined,
        write,
      });
    }),
  startDesktop: target({
    short: true,
    desc: "Run the desktop app on this computer (macOS, Windows or Linux), following `akan start`",
  })
    .with(App)
    .option("target", String, nativeTargetOption)
    .option("env", String, startEnvOption)
    .option("release", Boolean, { desc: "run a release build of its own bundle instead", default: false })
    .option("write", Boolean, writeOption)
    .exec(async function (app, target, env, release, write) {
      await this.applicationScript.startDesktop(app, {
        target,
        env,
        operation: release ? "release" : "local",
        write,
      });
    }),
  releaseIos: target({ desc: "Build and sign the iOS app for the App Store (.ipa)" })
    .with(App)
    .option("target", String, nativeTargetOption)
    .option("env", String, releaseEnvOption)
    .option("team", String, teamOption)
    .option("adHoc", Boolean, { desc: "sign with an ad-hoc profile instead of app-store", default: false })
    .option("write", Boolean, writeOption)
    .option("allowLocalRelease", Boolean, allowLocalOption("release"))
    .exec(async function (app, target, env, team, adHoc, write, allowLocalRelease) {
      await this.applicationScript.releaseIos(app, {
        target,
        env,
        teamId: team || undefined,
        adHoc,
        write,
        allowLocalRelease,
      });
    }),
  releaseAndroid: target({ desc: "Build and sign the Android app for the Play Store (aab, or apk)" })
    .with(App)
    .option("assembleType", String, { enum: ["aab", "apk"], default: "aab" })
    .option("target", String, nativeTargetOption)
    .option("env", String, releaseEnvOption)
    .option("write", Boolean, writeOption)
    .option("allowLocalRelease", Boolean, allowLocalOption("release"))
    .exec(async function (app, assembleType, target, env, write, allowLocalRelease) {
      await this.applicationScript.releaseAndroid(app, assembleType as "aab" | "apk", {
        target,
        env,
        write,
        allowLocalRelease,
      });
    }),
  packUpdate: target({
    desc: "Pack an unsigned over-the-air update of the mobile web bundle for a signer; records it in <out>/pack.json. Exits 2 when --against needs a new store build, 1 on any other failure",
  })
    .with(App)
    .option("platform", String, { enum: ["ios", "android"], desc: "the app it updates" })
    .option("target", String, nativeTargetOption)
    .option("env", String, releaseEnvOption)
    .option("out", String, {
      desc: "output folder (default: dist/native/<app>/<target>/updates/<platform>)",
      nullable: true,
    })
    .option("against", String, {
      desc: "bundle.json of the store build it must run in; fails when it needs a new one",
      nullable: true,
    })
    .option("write", Boolean, writeOption)
    .option("allowLocalRelease", Boolean, allowLocalOption("packing"))
    .exec(async function (app, platform, target, env, out, against, write, allowLocalRelease) {
      await this.applicationScript.packUpdate(app, platform as "ios" | "android", {
        target,
        env,
        out: out ?? undefined,
        against: against ?? undefined,
        write,
        allowLocalRelease,
      });
    }),
  updateKeygen: target({ desc: "Make (once) the key an app's update releases are signed with; print its public key" })
    .with(App)
    .option("platform", String, {
      enum: ["desktop", "android", "ios"],
      default: "desktop",
      desc: "the platform whose app id the key signs for (an appId may differ per platform)",
    })
    .option("target", String, nativeTargetOption)
    .exec(async function (app, platform, target) {
      await this.applicationScript.updateKeygen(app, platform as "desktop" | "android" | "ios", { target });
    }),
  publishUpdate: target({ desc: "Build and sign an update release installed apps take (desktop, android or ios)" })
    .with(App)
    .option("platform", String, {
      enum: ["desktop", "android", "ios"],
      default: "desktop",
      desc: "desktop is this computer's OS and CPU; android and ios publish the web bundle",
    })
    .option("target", String, nativeTargetOption)
    .option("env", String, releaseEnvOption)
    .option("channel", String, {
      desc: "the manifest to publish to (default: the target's updates.channel, else --env)",
      nullable: true,
    })
    .option("upload", String, {
      desc: "s3://<bucket>/<prefix> the release goes to, its manifests last (credentials: S3_* or AWS_* env)",
      nullable: true,
    })
    .option("arch", String, {
      desc: "desktop: the CPU of the apps it updates, arm64 or x64 of this OS (default this computer's)",
      enum: ["arm64", "x64"] as const,
      nullable: true,
    })
    .option("sign", Boolean, {
      desc: `${signDesc}; a signed app takes only a release signed the same way`,
      default: false,
    })
    .option("notarize", Boolean, { desc: notarizeDesc, default: false })
    .option("revoke", String, {
      desc: "android, ios: keyIds of updates.publicKeys this release starts revoking, comma-separated (update-keygen prints a key's); it is signed with a key listed after them",
      nullable: true,
    })
    .option("resetSequence", Boolean, {
      flag: "R",
      desc: "android, ios: with --revoke, phones compare the release with their own bundle instead of the running one",
      default: false,
    })
    .option("write", Boolean, writeOption)
    .option("allowLocalRelease", Boolean, allowLocalOption("release"))
    .exec(
      async function (
        app,
        platform,
        target,
        env,
        channel,
        upload,
        arch,
        sign,
        notarize,
        revoke,
        resetSequence,
        write,
        allowLocalRelease,
      ) {
        const revoked = revoke
          ?.split(",")
          .map((keyId) => keyId.trim())
          .filter(Boolean);
        await this.applicationScript.publishUpdate(app, platform as "desktop" | "android" | "ios", {
          target,
          env,
          ...(sign ? { sign } : {}),
          ...(notarize ? { notarize } : {}),
          ...(channel ? { channel } : {}),
          ...(upload ? { upload } : {}),
          ...(arch ? { arch } : {}),
          ...(revoked?.length ? { revoke: revoked } : {}),
          ...(resetSequence ? { resetSequence } : {}),
          write,
          allowLocalRelease,
        });
      },
    ),
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
})) {}
