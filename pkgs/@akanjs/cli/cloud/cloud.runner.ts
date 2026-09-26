import path from "node:path";
import {
  CloudApi,
  GlobalConfig,
  getDefaultHostConfig,
  type RemoteEnvServerConfig,
  type WindowsTestTargetConfig,
} from "@akanjs/devkit/cloud";
import { runner, type Workspace } from "@akanjs/devkit/commandDecorators";
import { AppExecutor, WorkspaceExecutor } from "@akanjs/devkit/executors";
import { PlatformTestRun } from "@akanjs/devkit/platformTest/PlatformTestRun";
import type { RemoteTestPlatform } from "@akanjs/devkit/platformTest/PlatformTestTarget";
import { confirm, input, select } from "@inquirer/prompts";
import { Logger, sleep } from "akanjs/common";
import chalk from "chalk";
import * as QRcode from "qrcode";
import { getLatestPackageVersion, getNpmRegistryUrl } from "../npmRegistry";
import { openBrowser } from "../openBrowser";

interface SettlePlatformTestsOptions {
  interactive: boolean;
  recordStreaks: boolean;
  checkDrift: boolean;
}

interface RegistryOptions {
  registryUrl?: string;
  confirmPublish?: boolean;
  tag?: string;
}

/** The apps and libraries an env archive covers, when it carries a slice of the workspace rather than all of it. */
export interface EnvScope {
  apps: string[];
  libs: string[];
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
  async startPlatformTests(workspace: Workspace, platforms: RemoteTestPlatform[], pkgs: string[]) {
    const targets = await GlobalConfig.getTestTargets();
    if (platforms.includes("windows") && !targets.windows) {
      targets.windows = await this.#askWindowsTestTarget();
      await GlobalConfig.setTestTargets({ windows: targets.windows });
    }
    Logger.info(`Testing ${pkgs.join(", ")} on ${platforms.join(", ")} in the background...`);
    return await PlatformTestRun.start({
      workspaceRoot: workspace.workspaceRoot,
      platforms,
      pkgs,
      targets,
      onProgress: (message) => Logger.info(message),
    });
  }
  async settlePlatformTests(
    run: PlatformTestRun,
    { interactive, recordStreaks, checkDrift }: SettlePlatformTestsOptions,
  ) {
    const results = await run.results();
    Logger.rawLog(`\n${run.format(results)}\n`);
    if (recordStreaks) {
      const streak = await PlatformTestRun.recordStreaks(results);
      if (streak?.promoted)
        Logger.info(`${streak.platform} passed ${streak.greenStreak} deploys in a row and now gates every deploy`);
    }
    const { blocking, warning } = PlatformTestRun.verdict(results);
    const unreachable = blocking.filter((result) => result.infraError && !result.packages.length);
    const failing = blocking.filter((result) => !unreachable.includes(result));
    if (failing.length)
      throw new Error(
        `Platform tests failed on ${failing.map((result) => result.platform).join(", ")} — ${run.logDir}`,
      );
    for (const result of [...unreachable, ...warning]) {
      const reason = result.infraError ?? "failing tests";
      if (!interactive) continue;
      const proceed = await confirm({
        message: `${result.platform} did not pass (${reason}). Continue without it?`,
        default: false,
      });
      if (!proceed) throw new Error(`Stopped after ${result.platform} platform tests — ${run.logDir}`);
    }
    if (!interactive && unreachable.length)
      throw new Error(`Could not run ${unreachable.map((result) => result.platform).join(", ")} — ${run.logDir}`);
    if (!checkDrift) return results;
    const drift = await run.snapshot.drift();
    const drifted = [...drift.changed, ...drift.added, ...drift.removed];
    if (drifted.length)
      throw new Error(
        `The tree changed while it was being tested, so the results do not describe what would be published: ${drifted.slice(0, 20).join(", ")}${drifted.length > 20 ? ", …" : ""}`,
      );
    return results;
  }
  async #askWindowsTestTarget(): Promise<WindowsTestTargetConfig> {
    Logger.info("No Windows test target is configured yet; it is saved to ~/.akan/config.json once entered.");
    const host = (await input({ message: "Windows host (ip or name): ", validate: (value) => !!value.trim() })).trim();
    const user = (await input({ message: "SSH user: ", validate: (value) => !!value.trim() })).trim();
    const identityFile = (
      await input({ message: "SSH private key path: ", validate: (value) => !!value.trim() })
    ).trim();
    const knownHostsFile = (await input({ message: "known_hosts file (optional): " })).trim();
    const utmVm = (await input({ message: "UTM VM name, to start it and find its ip (optional): " })).trim();
    return {
      host,
      user,
      identityFile,
      ...(knownHostsFile ? { knownHostsFile } : {}),
      ...(utmVm ? { utmVm } : {}),
    };
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
    // The local registry carries its own token on every publish below, and `npm login` has no registry argument —
    // it would prompt for npmjs.org credentials to authorize a publish that never reaches npmjs.org, which also
    // makes the whole local-registry flow interactive and therefore unscriptable.
    if (!registry) {
      Logger.info("Logging in to npm...");
      await workspace.spawn("npm", ["login"], { stdio: "inherit" });
      Logger.info("Logged in to npm");
    }
    for (const library of akanPkgs) {
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
    }
    Logger.info(`All libraries are published to ${registry ?? "npm"}`);
  }
  async update(workspace: Workspace, tag: string = "latest", { registryUrl }: RegistryOptions = {}) {
    const registry = registryUrl ? getNpmRegistryUrl(registryUrl) : undefined;
    const registryArgs = this.#getRegistryArgs(registry);
    const env = this.#getRegistryEnv(registry);
    const globalCliArgs = ["add", "-g", `@akanjs/cli@${tag}`, ...registryArgs];
    if (!(await workspace.exists("package.json"))) await workspace.spawn("bun", globalCliArgs, { env });
    else
      await Promise.all([
        workspace.spawn("bun", globalCliArgs, { env }),
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
    await workspace.mkdir("local");
    const localPath = (await cloudApi.downloadEnv(workspaceId)) as string;
    // Pass a path relative to workspaceRoot so tar never sees a Windows drive letter
    // (e.g. "C:\...") which GNU tar would interpret as a remote "host:file" spec.
    const relativePath = path.relative(workspace.workspaceRoot, localPath).split(path.sep).join("/");
    await workspace.spawn("tar", ["-xf", relativePath], { cwd: workspace.workspaceRoot });
    await workspace.remove(localPath);
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

  async gatherEnvFiles(
    workspace: Workspace,
    { scope, archivePath = "local/env.tar" }: { scope?: EnvScope; archivePath?: string } = {},
  ) {
    const envFilePattern = /^env\.(client|server)\.(?!(type|example)\.ts$).+\.ts$/;
    const [workspaceAppNames, workspaceLibNames] = await workspace.getExecs();
    const appNames = scope?.apps ?? workspaceAppNames;
    const libNames = scope?.libs ?? workspaceLibNames;
    const envDirs = [
      ...appNames.map((appName) => `apps/${appName}/env`),
      ...libNames.map((libName) => `libs/${libName}/env`),
    ];
    const defaultEnvFilePaths = (
      await Promise.all(
        envDirs.map(async (envDir) =>
          (
            await workspace.readdir(envDir)
          )
            .filter((fileName) => envFilePattern.test(fileName))
            .map((fileName) => `${envDir}/${fileName}`),
        ),
      )
    ).flat();
    //* The managed block is a workspace-level file listing every app: syncing it from one slice would drop
    //* every other app's secret patterns from it.
    await this.#syncSecretGitignore(workspace, workspaceAppNames);
    const customSecretPaths = await this.#gatherCustomSecretFiles(workspace, appNames);
    const envFilePaths = [...new Set([...defaultEnvFilePaths, ...customSecretPaths])].sort();
    await workspace.mkdir("local");
    await workspace.remove(archivePath);
    if (envFilePaths.length === 0)
      throw new Error(
        scope
          ? `No environment files found to archive for ${appNames.join(", ") || "(no apps)"}`
          : "No environment files found to archive",
      );
    await workspace.spawn("tar", ["-cf", archivePath, ...envFilePaths], {
      cwd: workspace.workspaceRoot,
    });
    Logger.info(`Archived ${envFilePaths.length} environment files to ${archivePath}`);
    return { files: envFilePaths, path: archivePath };
  }

  async #gatherCustomSecretFiles(workspace: Workspace, appNames: string[]) {
    const secretPaths = await Promise.all(
      appNames.map(async (appName) => {
        const config = await AppExecutor.from(workspace, appName).getConfig();
        const secretGlobs = config.secrets ?? [];
        if (secretGlobs.length === 0) return [];
        const appDir = path.join(workspace.workspaceRoot, "apps", appName);
        return secretGlobs.flatMap((pattern) =>
          Array.from(new Bun.Glob(pattern).scanSync({ cwd: appDir, onlyFiles: true })).map(
            (match) => `apps/${appName}/${match.split(path.sep).join("/")}`,
          ),
        );
      }),
    );
    return secretPaths.flat();
  }

  async #syncSecretGitignore(workspace: Workspace, appNames: string[]) {
    const patterns = (
      await Promise.all(
        appNames.map(async (appName) => {
          const config = await AppExecutor.from(workspace, appName).getConfig();
          return (config.secrets ?? []).map((pattern) => `apps/${appName}/${pattern.replace(/^\/+/, "")}`);
        }),
      )
    ).flat();
    const uniquePatterns = [...new Set(patterns)].sort();
    const existing = (await workspace.exists(".gitignore")) ? await workspace.readFile(".gitignore") : "";
    const nextContent = this.#applySecretGitignoreBlock(existing, uniquePatterns);
    if (nextContent === existing) return;
    await workspace.writeFile(".gitignore", nextContent);
    Logger.info(
      uniquePatterns.length
        ? `Synced ${uniquePatterns.length} secret pattern(s) from akan.config.ts to .gitignore`
        : "Removed managed secret patterns from .gitignore",
    );
  }

  #applySecretGitignoreBlock(content: string, patterns: string[]) {
    const beginMarker = "# akan:secrets (managed by akan.config.ts — do not edit)";
    const endMarker = "# akan:secrets:end";
    const lines = content.split("\n");
    const beginIdx = lines.indexOf(beginMarker);
    const endIdx = lines.indexOf(endMarker);
    const stripped =
      beginIdx !== -1 && endIdx !== -1 && endIdx >= beginIdx
        ? [...lines.slice(0, beginIdx), ...lines.slice(endIdx + 1)]
        : [...lines];
    while (stripped.length && stripped[stripped.length - 1]?.trim() === "") stripped.pop();
    if (patterns.length === 0) return stripped.length ? `${stripped.join("\n")}\n` : "";
    const body = stripped.length ? `${stripped.join("\n")}\n\n` : "";
    return `${body}${[beginMarker, ...patterns, endMarker].join("\n")}\n`;
  }
}
