import { App, command, Workspace } from "@akanjs/devkit/commandDecorators";
import { PlatformTestRun } from "@akanjs/devkit/platformTest/PlatformTestRun";
import {
  allowLocalOption,
  hostOption,
  nativeEnvs,
  oneNativeTargetOption,
  releaseEnvOption,
  subspaceOption,
  writeOption,
} from "../application/commandOptions";
import { CloudScript } from "./cloud.script";

const localRegistryUrl = () => process.env.AKAN_NPM_REGISTRY ?? "http://127.0.0.1:4873";
const resolveRegistryUrl = (registry: "npm" | "local") => (registry === "local" ? localRegistryUrl() : undefined);

export class CloudCommand extends command("cloud", [CloudScript], ({ public: target }) => ({
  login: target({ desc: "Login to Akan Cloud services" })
    .option("host", String, hostOption)
    .with(Workspace)
    .exec(async function (host, workspace) {
      await this.cloudScript.login(workspace, host);
    }),
  logout: target({ desc: "Logout from Akan Cloud services" })
    .option("host", String, hostOption)
    .with(Workspace)
    .exec(async function (host, workspace) {
      await this.cloudScript.logout(workspace, host);
    }),
  deployAkan: target({ devOnly: true, desc: "Deploy Akan.js framework to cloud (internal use)" })
    .option("test", Boolean, { desc: "test the deployment", default: true })
    .option("registry", String, {
      desc: "registry target for publishing Akan packages",
      ask: "Select a registry target",
      enum: [
        { label: "local", value: "local" },
        { label: "npm", value: "npm" },
      ],
    })
    .option("platforms", String, {
      desc: "platforms to test on besides this machine, comma-separated: linux, windows (none to skip)",
      default: "linux,windows",
    })
    .with(Workspace)
    .exec(async function (test, registry, platforms, workspace) {
      await this.cloudScript.deployAkan(workspace, {
        test,
        registryUrl: resolveRegistryUrl(registry),
        platforms: PlatformTestRun.parsePlatforms(platforms),
      });
    }),
  testPlatforms: target({
    devOnly: true,
    desc: "Run the Akan package suites on Linux (Docker) and Windows (SSH) against a snapshot of this tree",
  })
    .option("platforms", String, {
      desc: "platforms to test on, comma-separated: linux, windows",
      default: "linux,windows",
    })
    .option("pkgs", String, {
      flag: "k",
      desc: "packages to test, comma-separated (default: every Akan package)",
      nullable: true,
    })
    .with(Workspace)
    .exec(async function (platforms, pkgs, workspace) {
      await this.cloudScript.testPlatforms(workspace, {
        platforms: PlatformTestRun.parsePlatforms(platforms),
        pkgs: pkgs
          ?.split(",")
          .map((pkg) => pkg.trim())
          .filter(Boolean),
      });
    }),
  update: target({ desc: "Update Akan.js framework to the latest version" })
    .with(Workspace)
    .option("tag", String, {
      desc: "tag of the update",
      default: "latest",
      enum: ["latest", "dev", "canary", "beta", "rc", "alpha"],
    })
    .option("registry", String, {
      desc: "registry target for resolving Akan packages",
      ask: "Select a registry target",
      enum: [
        { label: "npm", value: "npm" },
        { label: "local", value: "local" },
      ],
      default: process.env.USE_AKANJS_PKGS === "true" ? undefined : "npm",
    })
    .exec(async function (workspace, tag, registry) {
      await this.cloudScript.update(workspace, tag, { registryUrl: resolveRegistryUrl(registry) });
    }),
  pushUpdate: target({
    desc: "Pack an over-the-air update of a phone's web bundle, or take the folder `akan pack-update` wrote, and upload it to the Akan Cloud project, which signs and publishes it. Exits 2 when the pack needs a new store build or the project rejects it, 1 on any other failure",
  })
    .with(App)
    .option("platform", String, {
      enum: ["ios", "android"],
      desc: "the app it updates (with --pack, default: the pack's)",
      nullable: true,
    })
    .option("target", String, {
      desc: "native target name, a key of native.targets (default: the only one; with --pack, the pack's)",
      nullable: true,
    })
    .option("env", String, {
      enum: nativeEnvs,
      desc: "backend environment (default: main; with --pack, the pack's)",
      nullable: true,
    })
    .option("channel", String, { desc: "the channel (default: the target's updates.channel)", nullable: true })
    .option("notes", String, { desc: "release notes shown in the project", nullable: true })
    .option("subspace", String, subspaceOption("gets it"))
    .option("host", String, hostOption)
    .option("write", Boolean, writeOption)
    .option("allowLocalRelease", Boolean, {
      flag: "l",
      desc: "allow packing, or uploading a pack made, with --env local",
      default: false,
    })
    .option("pack", String, {
      flag: "d",
      desc: "a folder `akan pack-update` wrote, uploaded instead of packing; --platform, --target and --env must match it",
      nullable: true,
    })
    .with(Workspace)
    .exec(
      async function (
        app,
        platform,
        target,
        env,
        channel,
        notes,
        subspace,
        host,
        write,
        allowLocalRelease,
        pack,
        workspace,
      ) {
        await this.cloudScript.pushUpdate(workspace, app, {
          platform,
          target,
          env,
          channel,
          notes,
          subspace,
          host,
          write,
          allowLocalRelease,
          pack,
        });
      },
    ),
  registerBinary: target({
    desc: "Register the store build of a phone app with the Akan Cloud project, with a pack of the same commit as its embedded bundle. Exits 2 when the store build differs natively from this commit's pack, 1 on any other failure",
  })
    .with(App)
    .option("platform", String, { enum: ["ios", "android"], desc: "the store build to register" })
    .option("distribution", String, {
      enum: ["appStore", "testFlight", "playStore", "playTesting", "direct"],
      desc: "where the binary ships",
    })
    .option("target", String, oneNativeTargetOption)
    .option("env", String, releaseEnvOption)
    .option("subspace", String, subspaceOption("gets it"))
    .option("host", String, hostOption)
    .option("write", Boolean, writeOption)
    .option("allowLocalRelease", Boolean, allowLocalOption("packing"))
    .with(Workspace)
    .exec(
      async function (app, platform, distribution, target, env, subspace, host, write, allowLocalRelease, workspace) {
        await this.cloudScript.registerBinary(workspace, app, {
          platform,
          distribution,
          target,
          env,
          subspace,
          host,
          write,
          allowLocalRelease,
        });
      },
    ),
  uploadSecret: target({
    desc: "Upload a named pipeline secret to the Akan Cloud project; write-only, it can never be read back",
  })
    .arg("name", String, { desc: "secret name, e.g. DISCORD_WEBHOOK" })
    .option("branch", String, {
      desc: "only builds of this branch use it: debug, develop or main (default: every branch)",
      nullable: true,
    })
    .option("file", String, {
      desc: "read the value from this file instead of stdin or a hidden prompt",
      nullable: true,
    })
    .option("subspace", String, subspaceOption("gets it"))
    .option("host", String, hostOption)
    .with(Workspace)
    .exec(async function (name, branch, file, subspace, host, workspace) {
      await this.cloudScript.uploadSecret(workspace, { name, branch, file, subspace, host });
    }),
  listSecrets: target({ desc: "List the pipeline secrets of the Akan Cloud project: names and scopes, never values" })
    .option("branch", String, {
      desc: "only the secrets builds of this branch use: debug, develop or main",
      nullable: true,
    })
    .option("subspace", String, subspaceOption("to list"))
    .option("host", String, hostOption)
    .with(Workspace)
    .exec(async function (branch, subspace, host, workspace) {
      await this.cloudScript.listSecrets(workspace, { branch, subspace, host });
    }),
  removeSecret: target({ desc: "Remove a named pipeline secret from the Akan Cloud project" })
    .arg("name", String, { desc: "secret name" })
    .option("branch", String, {
      desc: "the branch override to remove: debug, develop or main (default: the every-branch value)",
      nullable: true,
    })
    .option("subspace", String, subspaceOption("holds it"))
    .option("host", String, hostOption)
    .with(Workspace)
    .exec(async function (name, branch, subspace, host, workspace) {
      await this.cloudScript.removeSecret(workspace, { name, branch, subspace, host });
    }),
  downloadEnv: target({ desc: "Download environment variables from cloud or SCP server" })
    .option("host", String, hostOption)
    .with(Workspace)
    .exec(async function (host, workspace) {
      await this.cloudScript.downloadEnv(workspace, undefined, { host });
    }),
  uploadEnv: target({ desc: "Upload environment variables to cloud or SCP server" })
    .option("host", String, hostOption)
    .with(Workspace)
    .exec(async function (host, workspace) {
      await this.cloudScript.uploadEnv(workspace, { host });
    }),
})) {}
