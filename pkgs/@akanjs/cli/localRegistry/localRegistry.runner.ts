import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { runner, type Workspace } from "@akanjs/devkit/commandDecorators";
import { parseEnvFile } from "@akanjs/devkit/executors";
import { Logger } from "akanjs/common";
import { getNpmRegistryUrl, npmRegistryFromEnv } from "../npmRegistry";

const defaultLocalRegistryUrl = "http://127.0.0.1:4873";
const containerName = "akan-verdaccio";
const smokeRepoName = "akan-local-smoke";
const smokeAppName = "demo";

const ipv4Pattern = /^\d{1,3}(?:\.\d{1,3}){3}$/;

interface ContainerPortBindings {
  HostConfig?: { PortBindings?: Record<string, { HostIp?: string }[] | null> };
}

export class LocalRegistryRunner extends runner("localRegistry") {
  getRegistryUrl(registryUrl = npmRegistryFromEnv() ?? defaultLocalRegistryUrl) {
    return getNpmRegistryUrl(registryUrl);
  }

  //? Anyone who reaches the port can publish, so it listens where the URL points: loopback unless an IP says otherwise.
  static publishAddressOf(registry: string) {
    const { hostname, port } = new URL(registry);
    return { host: ipv4Pattern.test(hostname) ? hostname : "127.0.0.1", port: port || "4873" };
  }

  static #listensEverywhere(inspectOutput: string) {
    try {
      const [container] = JSON.parse(inspectOutput) as ContainerPortBindings[];
      return Object.values(container?.HostConfig?.PortBindings ?? {}).some((bindings) =>
        (bindings ?? []).some(({ HostIp }) => !HostIp || HostIp === "0.0.0.0" || HostIp === "::"),
      );
    } catch {
      return false;
    }
  }

  async start(workspace: Workspace, { registryUrl }: { registryUrl?: string } = {}) {
    const registry = this.getRegistryUrl(registryUrl);
    const address = LocalRegistryRunner.publishAddressOf(registry);
    try {
      const inspected = await workspace.spawn("docker", ["inspect", containerName]);
      if (address.host !== "0.0.0.0" && LocalRegistryRunner.#listensEverywhere(inspected))
        Logger.warn(
          `The running ${containerName} container listens on every network interface; run \`docker rm -f ${containerName}\` and start it again to bind it to ${address.host}.`,
        );
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
        `${address.host}:${address.port}:4873`,
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
    //? Bun loaded this repo's .env into process.env, where it would outrank the smoke workspace's own .env.
    const repoDotenv = parseEnvFile(path.join(workspace.workspaceRoot, ".env"));
    const env = {
      ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !(key in repoDotenv))),
      AKAN_NPM_REGISTRY: registry,
      NPM_CONFIG_REGISTRY: registry,
    };
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
      { env, stdio: "inherit" },
    );
    for (const command of ["typecheck", "build"])
      await workspace.spawn("akan", [command, smokeAppName], {
        cwd: path.join(smokeRoot, smokeRepoName),
        env,
        stdio: "inherit",
      });
    Logger.info(`Local registry smoke test completed for ${smokeRepoName}/${smokeAppName}`);
  }
}
