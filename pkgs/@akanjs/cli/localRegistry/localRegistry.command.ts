import { command, Workspace } from "@akanjs/devkit/commandDecorators";
import { LocalRegistryScript } from "./localRegistry.script";

export class LocalRegistryCommand extends command("local-registry", [LocalRegistryScript], ({ public: target }) => ({
  startRegistry: target({ devOnly: true, desc: "Start the local Verdaccio npm registry" })
    .with(Workspace)
    .option("registry", String, {
      desc: "local npm registry URL",
      default: process.env.AKAN_NPM_REGISTRY ?? "http://127.0.0.1:4873",
    })
    .exec(async function (workspace, registry) {
      await this.localRegistryScript.start(workspace, { registryUrl: registry });
    }),
  resetRegistry: target({ devOnly: true, desc: "Stop and clear the local Verdaccio npm registry" })
    .with(Workspace)
    .exec(async function (workspace) {
      await this.localRegistryScript.reset(workspace);
    }),
  smokeRegistry: target({ devOnly: true, desc: "Publish to local registry and build a generated workspace" })
    .with(Workspace)
    .option("tag", String, {
      flag: "g",
      desc: "dist-tag for local registry publish",
      default: "rc",
    })
    .option("test", Boolean, {
      desc: "run package tests before publishing",
      default: true,
    })
    .option("registry", String, {
      desc: "local npm registry URL",
      default: process.env.AKAN_NPM_REGISTRY,
    })
    .exec(async function (workspace, tag, test, registry) {
      await this.localRegistryScript.smoke(workspace, { tag, test, registryUrl: registry });
    }),
})) {}
