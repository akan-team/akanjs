import { GlobalConfig } from "@akanjs/devkit/cloud";
import { command, Workspace } from "@akanjs/devkit/commandDecorators";
import { PlatformTestRun } from "@akanjs/devkit/platformTest/PlatformTestRun";
import { CloudScript } from "./cloud.script";

const localRegistryUrl = () => process.env.AKAN_NPM_REGISTRY ?? "http://127.0.0.1:4873";
const resolveRegistryUrl = (registry: "npm" | "local") => (registry === "local" ? localRegistryUrl() : undefined);

export class CloudCommand extends command("cloud", [CloudScript], ({ public: target }) => ({
  login: target({ desc: "Login to Akan Cloud services" })
    .option("host", String, { desc: "host of the cloud", default: GlobalConfig.akanCloudHost })
    .with(Workspace)
    .exec(async function (host, workspace) {
      await this.cloudScript.login(workspace, host);
    }),
  logout: target({ desc: "Logout from Akan Cloud services" })
    .option("host", String, { desc: "host of the cloud", default: GlobalConfig.akanCloudHost })
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
  uploadSecret: target({
    desc: "Upload a named pipeline secret to the akasys project; write-only, it can never be read back",
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
    .option("subspace", String, { desc: "the subspace whose project gets it", nullable: true })
    .option("host", String, { desc: "host of the cloud to target", default: GlobalConfig.akanCloudHost })
    .with(Workspace)
    .exec(async function (name, branch, file, subspace, host, workspace) {
      await this.cloudScript.uploadSecret(workspace, { name, branch, file, subspace, host });
    }),
  listSecrets: target({ desc: "List the pipeline secrets of the akasys project: names and scopes, never values" })
    .option("branch", String, {
      desc: "only the secrets builds of this branch use: debug, develop or main",
      nullable: true,
    })
    .option("subspace", String, { desc: "the subspace whose project to list", nullable: true })
    .option("host", String, { desc: "host of the cloud to target", default: GlobalConfig.akanCloudHost })
    .with(Workspace)
    .exec(async function (branch, subspace, host, workspace) {
      await this.cloudScript.listSecrets(workspace, { branch, subspace, host });
    }),
  removeSecret: target({ desc: "Remove a named pipeline secret from the akasys project" })
    .arg("name", String, { desc: "secret name" })
    .option("branch", String, {
      desc: "the branch override to remove: debug, develop or main (default: the every-branch value)",
      nullable: true,
    })
    .option("subspace", String, { desc: "the subspace whose project holds it", nullable: true })
    .option("host", String, { desc: "host of the cloud to target", default: GlobalConfig.akanCloudHost })
    .with(Workspace)
    .exec(async function (name, branch, subspace, host, workspace) {
      await this.cloudScript.removeSecret(workspace, { name, branch, subspace, host });
    }),
  downloadEnv: target({ desc: "Download environment variables from cloud or SCP server" })
    .option("host", String, { desc: "host of the cloud to target", default: GlobalConfig.akanCloudHost })
    .with(Workspace)
    .exec(async function (host, workspace) {
      await this.cloudScript.downloadEnv(workspace, undefined, { host });
    }),
  uploadEnv: target({ desc: "Upload environment variables to cloud or SCP server" })
    .option("host", String, { desc: "host of the cloud to target", default: GlobalConfig.akanCloudHost })
    .with(Workspace)
    .exec(async function (host, workspace) {
      await this.cloudScript.uploadEnv(workspace, { host });
    }),
})) {}
