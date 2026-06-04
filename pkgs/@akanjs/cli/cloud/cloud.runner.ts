import path from "node:path";
import {
  AiSession,
  CloudApi,
  GlobalConfig,
  getDefaultHostConfig,
  type RemoteEnvServerConfig,
  runner,
  type Workspace,
  WorkspaceExecutor,
} from "@akanjs/devkit";
import { confirm, input, select } from "@inquirer/prompts";
import { Logger, sleep } from "akanjs/common";
import chalk from "chalk";
import * as QRcode from "qrcode";
import { getLatestPackageVersion, getNpmRegistryUrl } from "../npmRegistry";
import { openBrowser } from "../openBrowser";

interface RegistryOptions {
  registryUrl?: string;
  confirmPublish?: boolean;
  tag?: string;
}

interface SelectedRemoteEnvServer {
  name: string;
  config: RemoteEnvServerConfig;
}

const addRemoteEnvServerValue = "__addRemoteEnvServer";
const removeRemoteEnvServerValue = "__removeRemoteEnvServer";

export class CloudRunner extends runner("cloud") {
  #akanFrameworkPackages = new Set(["akanjs", "@akanjs/devkit", "@akanjs/cli", "create-akan-workspace"]);

  #getRegistryArgs(registryUrl?: string) {
    return registryUrl ? ["--registry", getNpmRegistryUrl(registryUrl)] : [];
  }

  #getLocalRegistryAuthArgs(registryUrl?: string) {
    if (!registryUrl) return [];
    const { host, pathname } = new URL(getNpmRegistryUrl(registryUrl));
    const registryPath = pathname === "/" ? "/" : `${pathname.replace(/\/+$/, "")}/`;
    return [`--//${host}${registryPath}:_authToken=akan-local-registry`];
  }

  #getRegistryEnv(registryUrl?: string) {
    return registryUrl
      ? {
          ...process.env,
          AKAN_NPM_REGISTRY: getNpmRegistryUrl(registryUrl),
          NPM_CONFIG_REGISTRY: getNpmRegistryUrl(registryUrl),
        }
      : process.env;
  }

  async #addRemoteEnvServer(): Promise<SelectedRemoteEnvServer> {
    const name = (
      await input({
        message: "Remote server name: ",
        validate: (value) => (value.trim() ? true : "Remote server name is required"),
      })
    ).trim();
    const host = (
      await input({
        message: "Remote server host: ",
        validate: (value) => (value.trim() ? true : "Remote server host is required"),
      })
    ).trim();
    const username = (await input({ message: "Remote server username (optional): " })).trim() || undefined;
    const portInput = (
      await input({
        message: "Remote server SSH port (optional): ",
        validate: (value) => {
          const trimmed = value.trim();
          if (!trimmed) return true;
          const port = Number(trimmed);
          return Number.isInteger(port) && port > 0 ? true : "SSH port must be a positive integer";
        },
      })
    ).trim();
    const config: RemoteEnvServerConfig = {
      host,
      ...(username ? { username } : {}),
      ...(portInput ? { port: Number(portInput) } : {}),
    };
    await GlobalConfig.setRemoteEnvServer(name, config);
    return { name, config };
  }

  async #selectRemoteEnvServer(): Promise<SelectedRemoteEnvServer> {
    const servers = await GlobalConfig.getRemoteEnvServers();
    const serverEntries = Object.entries(servers).sort(([nameA], [nameB]) => nameA.localeCompare(nameB));
    if (serverEntries.length === 0) {
      Logger.info("No remote env servers configured. Add the first remote server for SCP mode.");
      return await this.#addRemoteEnvServer();
    }
    const selectedName = await select<string>({
      message: "Select the remote env server",
      choices: [
        ...serverEntries.map(([name, config]) => ({
          name: `${name} (${config.username ? `${config.username}@` : ""}${config.host}${config.port ? `:${config.port}` : ""})`,
          value: name,
        })),
        { name: "Add new remote server", value: addRemoteEnvServerValue },
        { name: "Remove remote server", value: removeRemoteEnvServerValue },
      ],
    });
    if (selectedName === addRemoteEnvServerValue) return await this.#addRemoteEnvServer();
    if (selectedName === removeRemoteEnvServerValue) {
      await this.#removeRemoteEnvServer(serverEntries);
      return await this.#selectRemoteEnvServer();
    }
    const config = servers[selectedName];
    if (!config) throw new Error(`Remote env server is not found: ${selectedName}`);
    return { name: selectedName, config };
  }

  async #removeRemoteEnvServer(serverEntries: [string, RemoteEnvServerConfig][]) {
    const selectedName = await select<string>({
      message: "Select the remote env server to remove",
      choices: serverEntries.map(([name, config]) => ({
        name: `${name} (${config.username ? `${config.username}@` : ""}${config.host}${config.port ? `:${config.port}` : ""})`,
        value: name,
      })),
    });
    const shouldRemove = await confirm({
      message: `Remove remote env server "${selectedName}"?`,
      default: false,
    });
    if (!shouldRemove) return;
    await GlobalConfig.removeRemoteEnvServer(selectedName);
    Logger.info(`Removed remote env server "${selectedName}"`);
  }

  async #getRemoteEnvServerWithUsername(): Promise<SelectedRemoteEnvServer> {
    const remoteServer = await this.#selectRemoteEnvServer();
    if (remoteServer.config.username) return remoteServer;
    const username = (
      await input({
        message: `SSH username for ${remoteServer.config.host} (optional): `,
      })
    ).trim();
    return {
      ...remoteServer,
      config: {
        ...remoteServer.config,
        ...(username ? { username } : {}),
      },
    };
  }

  #getRemoteEnvArchivePath() {
    return `${this.#getRemoteEnvArchiveDir()}/env.tar`;
  }

  #getRemoteEnvArchiveDir() {
    const { repoName } = WorkspaceExecutor.getBaseDevEnv();
    return `~/secrets/${repoName}`;
  }

  #getScpTarget(config: RemoteEnvServerConfig, remotePath: string) {
    return `${config.username ? `${config.username}@` : ""}${config.host}:${remotePath}`;
  }

  #getSshTarget(config: RemoteEnvServerConfig) {
    return `${config.username ? `${config.username}@` : ""}${config.host}`;
  }

  #getScpArgs(config: RemoteEnvServerConfig, source: string, target: string) {
    return [...(config.port ? ["-P", config.port.toString()] : []), source, target];
  }

  #getSshArgs(config: RemoteEnvServerConfig, command: string) {
    return [...(config.port ? ["-p", config.port.toString()] : []), this.#getSshTarget(config), command];
  }

  async login(host: string, workspace: Workspace) {
    const config = await GlobalConfig.getHostConfig(host);
    const cloudApi = new CloudApi(workspace, config);
    const self = config.auth ? await cloudApi.getRemoteSelf() : null;
    if (self) {
      Logger.rawLog(chalk.green(`\n✓ Already logged in akan cloud as ${self.nickname}\n`));
      return true;
    }
    const remoteId = crypto.randomUUID();
    const signinUrl = `${cloudApi.host}/remoteAuth?remoteId=${encodeURIComponent(remoteId)}`;

    Logger.rawLog(chalk.bold(`\n${chalk.green("➤")} Authentication Required`));
    Logger.rawLog(chalk.dim("Please visit or click the following URL:"));
    Logger.rawLog(`${chalk.cyan.underline(signinUrl)}\n`);

    try {
      const qrcode = await new Promise<string>((resolve, reject) => {
        QRcode.toString(signinUrl, { type: "terminal", small: true }, (err, data) => {
          if (err) reject(err);
          resolve(data);
        });
      });
      Logger.rawLog(qrcode);
      await openBrowser(signinUrl);
      Logger.rawLog(chalk.dim("Opening browser..."));
    } catch {
      Logger.rawLog(chalk.yellow("Could not open browser. Please visit the URL manually."));
    }

    Logger.rawLog(chalk.dim("Waiting for authentication..."));
    const MAX_RETRY = 300;
    for (let i = 0; i < MAX_RETRY; i++) {
      const accessToken = await cloudApi.getRemoteAuthToken(remoteId);
      const self = await cloudApi.getRemoteSelf();
      if (accessToken && self) {
        await GlobalConfig.setHostConfig({ host: config.host, auth: { accessToken, self } });
        Logger.rawLog(chalk.green(`\r✓ Authentication successful!`));
        Logger.rawLog(chalk.green.bold(`\n✨ Welcome aboard, ${self.nickname ?? "anonymous"}!`));
        Logger.rawLog(chalk.dim("You're now ready to use Akan CLI!\n"));
        return true;
      }
      await sleep(2000);
    }
    throw new Error(chalk.red("✖ Authentication timed out after 10 minutes. Please try again."));
  }
  async logout(host: string) {
    const config = await GlobalConfig.getHostConfig(host);
    if (config.auth?.self) {
      await GlobalConfig.setHostConfig(getDefaultHostConfig(config.host));
      Logger.rawLog(chalk.magenta.bold(`\n👋 Goodbye, ${config.auth.self.nickname ?? "anonymous"}!`));
      Logger.rawLog(chalk.dim("───────────────────────────────────────────────\n"));
      Logger.rawLog(chalk.cyan("You have been successfully logged out."));
      Logger.rawLog(chalk.dim("Thank you for using Akan CLI. Come back soon! 🌟\n"));
    } else {
      Logger.rawLog(chalk.yellow.bold("\n⚠️  No active session found"));
      Logger.rawLog(chalk.dim("You were not logged in to begin with\n"));
    }
  }
  async setLlm() {
    await AiSession.init({ useExisting: false });
  }
  resetLlm() {
    AiSession.setLlmConfig(null);
    Logger.rawLog(chalk.green("☑️ LLM model config is cleared. Please run `akan set-llm` to set a new LLM model."));
  }
  async getAkanPkgs(workspace: Workspace) {
    const pkgs = await workspace.getPkgs();
    return pkgs.filter((pkg) => pkg === "akanjs" || pkg === "create-akan-workspace" || pkg.startsWith("@akanjs/"));
  }
  async deployAkan(
    workspace: Workspace,
    akanPkgs: string[],
    { registryUrl, confirmPublish = true, tag: distTag }: RegistryOptions = {},
  ) {
    const registry = registryUrl ? getNpmRegistryUrl(registryUrl) : undefined;
    const akanPackageJson = (await workspace.readJson("pkgs/akanjs/package.json")) as { version: string };
    const [majorVersion, minorVersion, patchVersion, devPatchVersion] = akanPackageJson.version.split(".");
    const isOfficialRelease = !devPatchVersion;
    const targetVersionPrefix = isOfficialRelease
      ? `${majorVersion}.${minorVersion}`
      : `${majorVersion}.${minorVersion}.${patchVersion}`;
    const tag = distTag ?? (isOfficialRelease ? "latest" : (patchVersion.split("-").at(1) ?? "dev"));
    const getNextVersion = async (prefix: string, tag: string) => {
      try {
        const latestPublishedVersion = await getLatestPackageVersion("akanjs", tag, registry);
        const latestPatch = latestPublishedVersion.startsWith(prefix)
          ? parseInt(latestPublishedVersion.split(".").at(-1) ?? "-1")
          : -1;
        const nextVersion = `${prefix}.${latestPatch + 1}`;
        return { nextVersion, latestPublishedVersion };
      } catch {
        return { nextVersion: `${prefix}.0`, latestPublishedVersion: null };
      }
    };
    const { nextVersion, latestPublishedVersion } = await getNextVersion(targetVersionPrefix, tag);
    Logger.info(`Latest published version of akanjs: ${latestPublishedVersion ?? "none"}`);
    Logger.info(`Next version of akanjs: ${nextVersion}`);
    for (const library of akanPkgs) {
      const packageJson = (await workspace.readJson(`pkgs/${library}/package.json`)) as { version: string };
      const newPackageJsonStr = JSON.stringify(
        this.#normalizeAkanPackageJson(packageJson, library, nextVersion),
        null,
        2,
      );
      await workspace.writeFile(`pkgs/${library}/package.json`, newPackageJsonStr);
      const distPackageJson = (await workspace.readJson(`dist/pkgs/${library}/package.json`)) as {
        version: string;
        dependencies?: Record<string, string>;
      };
      const newDistPackageJson = this.#normalizeAkanPackageJson(distPackageJson, library, nextVersion);
      await workspace.writeJson(`dist/pkgs/${library}/package.json`, newDistPackageJson);
    }
    if (confirmPublish) {
      const isDeployConfirmed = await confirm({
        message: "Are you sure you want to deploy the libraries?",
      });
      if (!isDeployConfirmed) {
        Logger.error("Deployment cancelled");
        return;
      }
    }

    await Promise.all(
      akanPkgs.map(async (library) => {
        Logger.info(`Publishing ${library}@${nextVersion} to ${registry ?? "npm"}...`);
        await workspace.spawn(
          "npm",
          ["publish", "--tag", tag, ...this.#getRegistryArgs(registry), ...this.#getLocalRegistryAuthArgs(registry)],
          {
            cwd: path.join(workspace.workspaceRoot, "dist/pkgs", library),
            env: this.#getRegistryEnv(registry),
            stdio: "inherit",
          },
        );
        Logger.info(`${library}@${nextVersion} is published to ${registry ?? "npm"}`);
      }),
    );
    Logger.info(`All libraries are published to ${registry ?? "npm"}`);
  }
  async update(workspace: Workspace, tag: string = "latest", { registryUrl }: RegistryOptions = {}) {
    const registry = registryUrl ? getNpmRegistryUrl(registryUrl) : undefined;
    const registryArgs = this.#getRegistryArgs(registry);
    const env = this.#getRegistryEnv(registry);
    if (!(await workspace.exists("package.json")))
      await workspace.spawn("bun", ["update", "-g", "akanjs", "--latest", `--tag=${tag}`, ...registryArgs], { env });
    else
      await Promise.all([
        workspace.spawn("bun", ["update", "-g", "akanjs", "--latest", `--tag=${tag}`, ...registryArgs], { env }),
        this.#updateAkanPkgs(workspace, tag, registry),
      ]);
  }
  async #updateAkanPkgs(workspace: Workspace, tag: string = "latest", registryUrl?: string) {
    const latestPublishedVersion = await getLatestPackageVersion("akanjs", tag, registryUrl);
    const rootPackageJson = await workspace.getPackageJson();
    if (!rootPackageJson.dependencies) throw new Error("No dependencies found in package.json");
    if (rootPackageJson.dependencies.akanjs) rootPackageJson.dependencies.akanjs = latestPublishedVersion;
    if (rootPackageJson.devDependencies?.akanjs) rootPackageJson.devDependencies.akanjs = latestPublishedVersion;
    if (rootPackageJson.dependencies["@akanjs/devkit"])
      rootPackageJson.dependencies["@akanjs/devkit"] = latestPublishedVersion;
    if (rootPackageJson.devDependencies?.["@akanjs/devkit"])
      rootPackageJson.devDependencies["@akanjs/devkit"] = latestPublishedVersion;
    await workspace.setPackageJson(rootPackageJson);
    await workspace.spawn("bun", ["install", ...this.#getRegistryArgs(registryUrl)], {
      env: this.#getRegistryEnv(registryUrl),
    });
  }

  #normalizeAkanPackageJson<T extends { version: string }>(packageJson: T, packageName: string, version: string): T {
    const normalized = { ...packageJson, version } as T & {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
      peerDependencies?: Record<string, string>;
      optionalDependencies?: Record<string, string>;
    };
    for (const field of ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"] as const) {
      const dependencies = normalized[field];
      if (!dependencies) continue;
      normalized[field] = Object.fromEntries(
        Object.entries(dependencies).map(([dep, depVersion]) => [
          dep,
          dep !== packageName && this.#akanFrameworkPackages.has(dep) ? version : depVersion,
        ]),
      );
    }
    return normalized;
  }

  async downloadEnv(cloudApi: CloudApi, workspace: Workspace, workspaceId: string) {
    const envArchivePath = "local/env.tar";
    await workspace.mkdir("local");
    await workspace.remove(envArchivePath);
    await cloudApi.downloadEnv(workspaceId);
    await workspace.spawn("tar", ["-xf", envArchivePath], {
      cwd: workspace.workspaceRoot,
    });
    await workspace.remove(envArchivePath);
  }
  async uploadEnv(cloudApi: CloudApi, workspaceId: string, filePath: string) {
    const file = new File([Bun.file(filePath)], path.basename(filePath));
    await cloudApi.uploadEnv(workspaceId, file);
  }
  async downloadEnvByScp(workspace: Workspace) {
    const envArchivePath = "local/env.tar";
    const remoteServer = await this.#getRemoteEnvServerWithUsername();
    const remoteArchivePath = this.#getRemoteEnvArchivePath();
    const remoteTarget = this.#getScpTarget(remoteServer.config, remoteArchivePath);
    await workspace.mkdir("local");
    await workspace.remove(envArchivePath);
    try {
      Logger.info(`Downloading env archive from remote server "${remoteServer.name}"...`);
      await workspace.spawn("scp", this.#getScpArgs(remoteServer.config, remoteTarget, envArchivePath), {
        cwd: workspace.workspaceRoot,
        stdio: "inherit",
      });
      await workspace.spawn("tar", ["-xf", envArchivePath], {
        cwd: workspace.workspaceRoot,
      });
      await workspace.remove(envArchivePath);
    } catch (error) {
      throw new Error(`Failed to download env archive from remote server "${remoteServer.name}"`, { cause: error });
    }
  }
  async uploadEnvByScp(workspace: Workspace, filePath: string) {
    const remoteServer = await this.#getRemoteEnvServerWithUsername();
    const remoteArchiveDir = this.#getRemoteEnvArchiveDir();
    const remoteArchivePath = this.#getRemoteEnvArchivePath();
    const remoteTarget = this.#getScpTarget(remoteServer.config, remoteArchivePath);
    try {
      await workspace.spawn("ssh", this.#getSshArgs(remoteServer.config, `mkdir -p ${remoteArchiveDir}`), {
        cwd: workspace.workspaceRoot,
        stdio: "inherit",
      });
      Logger.info(`Uploading env archive to remote server "${remoteServer.name}"...`);
      await workspace.spawn("scp", this.#getScpArgs(remoteServer.config, filePath, remoteTarget), {
        cwd: workspace.workspaceRoot,
        stdio: "inherit",
      });
    } catch (error) {
      throw new Error(`Failed to upload env archive to remote server "${remoteServer.name}"`, { cause: error });
    }
  }

  async gatherEnvFiles(workspace: Workspace) {
    const envFilePattern = /^env\.(client|server)\.(?!(type|example)\.ts$).+\.ts$/;
    const [appNames, libNames] = await workspace.getExecs();
    const envDirs = [
      ...appNames.map((appName) => `apps/${appName}/env`),
      ...libNames.map((libName) => `libs/${libName}/env`),
    ];
    const envFilePaths = (
      await Promise.all(
        envDirs.map(async (envDir) =>
          (
            await workspace.readdir(envDir)
          )
            .filter((fileName) => envFilePattern.test(fileName))
            .map((fileName) => `${envDir}/${fileName}`),
        ),
      )
    )
      .flat()
      .sort();
    await workspace.mkdir("local");
    await workspace.remove("local/env.tar");
    if (envFilePaths.length === 0) throw new Error("No environment files found to archive");
    await workspace.spawn("tar", ["-cf", "local/env.tar", ...envFilePaths], {
      cwd: workspace.workspaceRoot,
    });
    Logger.info(`Archived ${envFilePaths.length} environment files to local/env.tar`);
    return { files: envFilePaths, path: "local/env.tar" };
  }
}
