import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { runner, type Workspace } from "@akanjs/devkit";
import { Logger } from "akanjs/common";
import { getNpmRegistryUrl } from "../npmRegistry";

const defaultLocalRegistryUrl = "http://127.0.0.1:4873";
const containerName = "akan-verdaccio";
const smokeRepoName = "akan-local-smoke";
const smokeAppName = "demo";

export class LocalRegistryRunner extends runner("localRegistry") {
  getRegistryUrl(registryUrl = process.env.AKAN_NPM_REGISTRY ?? defaultLocalRegistryUrl) {
    return getNpmRegistryUrl(registryUrl);
  }

  async start(workspace: Workspace, { registryUrl }: { registryUrl?: string } = {}) {
    const registry = this.getRegistryUrl(registryUrl);
    try {
      await workspace.spawn("docker", ["inspect", containerName]);
      Logger.info(`Local registry is already running at ${registry}`);
      return registry;
    } catch {
      // The container is not running yet.
    }

    const configPath = path.join(workspace.workspaceRoot, "pkgs/@akanjs/cli/localRegistry/verdaccio.yaml");
    const storagePath = path.join(workspace.workspaceRoot, ".akan/verdaccio/storage");
    await mkdir(storagePath, { recursive: true });
    await workspace.spawn(
      "docker",
      [
        "run",
        "--rm",
        "-d",
        "--name",
        containerName,
        "-p",
        "4873:4873",
        "-v",
        `${configPath}:/verdaccio/conf/config.yaml:ro`,
        "-v",
        `${storagePath}:/verdaccio/storage`,
        "verdaccio/verdaccio:6",
      ],
      { stdio: "inherit" },
    );
    Logger.info(`Local registry is running at ${registry}`);
    return registry;
  }

  async reset(workspace: Workspace) {
    try {
      await workspace.spawn("docker", ["rm", "-f", containerName], { stdio: "inherit" });
    } catch {
      // The container may not exist.
    }
    await rm(path.join(workspace.workspaceRoot, ".akan/verdaccio"), { recursive: true, force: true });
    Logger.info("Local registry storage has been reset");
  }

  async smoke(workspace: Workspace, { registryUrl }: { registryUrl?: string } = {}) {
    const registry = this.getRegistryUrl(registryUrl);
    const smokeRoot = path.join(workspace.workspaceRoot, ".akan/e2e");
    await rm(path.join(smokeRoot, smokeRepoName), { recursive: true, force: true });
    await workspace.spawn(
      process.execPath,
      [
        "dist/pkgs/create-akan-workspace/index.js",
        smokeRepoName,
        "--app",
        smokeAppName,
        "--dir",
        ".akan/e2e",
        "--init",
        "true",
        "--registry",
        registry,
      ],
      {
        env: { ...process.env, AKAN_NPM_REGISTRY: registry, NPM_CONFIG_REGISTRY: registry },
        stdio: "inherit",
      },
    );
    await workspace.spawn("akan", ["typecheck", smokeAppName], {
      cwd: path.join(smokeRoot, smokeRepoName),
      env: { ...process.env, AKAN_NPM_REGISTRY: registry, NPM_CONFIG_REGISTRY: registry },
      stdio: "inherit",
    });
    await workspace.spawn("akan", ["build", smokeAppName], {
      cwd: path.join(smokeRoot, smokeRepoName),
      env: { ...process.env, AKAN_NPM_REGISTRY: registry, NPM_CONFIG_REGISTRY: registry },
      stdio: "inherit",
    });
    Logger.info(`Local registry smoke test completed for ${smokeRepoName}/${smokeAppName}`);
  }
}
