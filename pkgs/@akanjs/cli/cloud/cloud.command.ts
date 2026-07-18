import { command, GlobalConfig, Workspace } from "@akanjs/devkit";

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
  setLlm: target({ desc: "Configure LLM (Large Language Model) API key" })
    .with(Workspace)
    .exec(async function (workspace) {
      await this.cloudScript.setLlm(workspace);
    }),
  resetLlm: target({ desc: "Reset LLM configuration to default" })
    .with(Workspace)
    .exec(function (workspace) {
      this.cloudScript.resetLlm(workspace);
    }),
  ask: target({
    devOnly: true,
    desc: "Ask AI assistant a question about your project",
  })
    .option("question", String, { ask: "question to ask" })
    .with(Workspace)
    .exec(async function (question, workspace) {
      await this.cloudScript.ask(question, workspace);
    }),
  deployAkan: target({
    devOnly: true,
    desc: "Deploy Akan.js framework to cloud (internal use)",
  })
    .option("test", Boolean, { desc: "test the deployment", default: true })
    .option("registry", String, {
      desc: "registry target for publishing Akan packages",
      ask: "Select a registry target",
      enum: [
        { label: "local", value: "local" },
        { label: "npm", value: "npm" },
      ],
    })
    .with(Workspace)
    .exec(async function (test, registry, workspace) {
      await this.cloudScript.deployAkan(workspace, {
        test,
        registryUrl: resolveRegistryUrl(registry as "npm" | "local"),
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
      await this.cloudScript.update(workspace, tag, {
        registryUrl: resolveRegistryUrl(registry as "npm" | "local"),
      });
    }),
  downloadEnv: target({
    desc: "Download environment variables from cloud or SCP server",
  })
    .option("host", String, { desc: "host of the cloud to target", default: GlobalConfig.akanCloudHost })
    .with(Workspace)
    .exec(async function (host, workspace) {
      await this.cloudScript.downloadEnv(workspace, undefined, { host });
    }),
  uploadEnv: target({
    desc: "Upload environment variables to cloud or SCP server",
  })
    .option("host", String, { desc: "host of the cloud to target", default: GlobalConfig.akanCloudHost })
    .with(Workspace)
    .exec(async function (host, workspace) {
      await this.cloudScript.uploadEnv(workspace, { host });
    }),
})) {}
