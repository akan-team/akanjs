import { Logger, sleep } from "@akanjs/common";
import {
  AiSession,
  akanCloudBackendUrl,
  akanCloudClientUrl,
  akanCloudHost,
  getHostConfig,
  getSelf,
  setHostConfig,
  type Workspace,
} from "@akanjs/devkit";
import { confirm } from "@inquirer/prompts";
import chalk from "chalk";
import latestVersion from "latest-version";
import open from "open";
import * as QRcode from "qrcode";
import { v4 as uuidv4 } from "uuid";

export class CloudRunner {
  async login() {
    const config = getHostConfig();
    const self = config.auth ? await getSelf(config.auth.token) : null;
    if (self) {
      Logger.rawLog(chalk.green(`\n✓ Already logged in akan cloud as ${self.nickname}\n`));
      return true;
    }
    const remoteId = uuidv4();
    const signinUrl = `${akanCloudClientUrl}/signin?remoteId=${remoteId}`;

    Logger.rawLog(chalk.bold(`\n${chalk.green("➤")} Authentication Required`));
    Logger.rawLog(chalk.dim("Please visit or click the following URL:"));
    Logger.rawLog(chalk.cyan.underline(signinUrl) + "\n");

    try {
      const qrcode = await new Promise<string>((resolve, reject) => {
        QRcode.toString(signinUrl, { type: "terminal", small: true }, (err, data) => {
          if (err) reject(err);
          resolve(data);
        });
      });
      Logger.rawLog(qrcode);
      await open(signinUrl);
      Logger.rawLog(chalk.dim("Opening browser..."));
    } catch {
      Logger.rawLog(chalk.yellow("Could not open browser. Please visit the URL manually."));
    }

    Logger.rawLog(chalk.dim("Waiting for authentication..."));
    const MAX_RETRY = 300;
    for (let i = 0; i < MAX_RETRY; i++) {
      const res = await fetch(`${akanCloudBackendUrl}/user/getRemoteAuthToken/${remoteId}`);
      const { jwt } = (await res.json()) as { jwt: string | null };
      const self = jwt ? await getSelf(jwt) : null;
      if (jwt && self) {
        setHostConfig(akanCloudHost, { auth: { token: jwt, self } });
        Logger.rawLog(chalk.green(`\r✓ Authentication successful!`));
        Logger.rawLog(chalk.green.bold(`\n✨ Welcome aboard, ${self.nickname}!`));
        Logger.rawLog(chalk.dim("You're now ready to use Akan CLI!\n"));
        return true;
      }
      await sleep(2000);
    }
    throw new Error(chalk.red("✖ Authentication timed out after 10 minutes. Please try again."));
  }
  logout() {
    const config = getHostConfig();
    if (config.auth) {
      setHostConfig(akanCloudHost, {});
      Logger.rawLog(chalk.magenta.bold(`\n👋 Goodbye, ${config.auth.self.nickname}!`));
      Logger.rawLog(chalk.dim("───────────────────────────────────────────────\n"));
      Logger.rawLog(chalk.cyan("You have been successfully logged out."));
      Logger.rawLog(chalk.dim("Thank you for using Akan CLI. Come back soon! 🌟\n"));
    } else {
      Logger.rawLog(chalk.yellow.bold("\n⚠️  No active session found"));
      Logger.rawLog(chalk.dim("You were not logged in to begin with\n"));
    }
  }
  async setLlm() {
    await AiSession.init({ useExisting: true });
  }
  resetLlm() {
    AiSession.setLlmConfig(null);
    Logger.rawLog(chalk.green("☑️ LLM model config is cleared. Please run `akan set-llm` to set a new LLM model."));
  }
  async getAkanPkgs(workspace: Workspace) {
    const pkgs = await workspace.getPkgs();
    const akanPkgs = pkgs.filter((pkg) => pkg.startsWith("@akanjs/"));
    return [...akanPkgs, "create-akan-workspace"];
  }
  async deployAkan(workspace: Workspace, akanPkgs: string[]) {
    const basePackageJson = workspace.readJson("pkgs/@akanjs/base/package.json") as { version: string };
    const [majorVersionOfBase, minorVersionOfBase, patchVersionOfBase, devPatchVersionOfBase] =
      basePackageJson.version.split(".");
    const isOfficialRelease = !devPatchVersionOfBase;
    const targetVersionPrefix = isOfficialRelease
      ? `${majorVersionOfBase}.${minorVersionOfBase}`
      : `${majorVersionOfBase}.${minorVersionOfBase}.${patchVersionOfBase}`;
    const tag = isOfficialRelease ? "latest" : (patchVersionOfBase.split("-").at(1) ?? "dev");
    const getNextVersion = async (prefix: string, tag: string) => {
      try {
        const latestPublishedVersionOfBase = await latestVersion("@akanjs/base", { version: tag });
        const latestPatch = latestPublishedVersionOfBase.startsWith(prefix)
          ? parseInt(latestPublishedVersionOfBase.split(".").at(-1) ?? "-1")
          : -1;
        const nextVersion = `${prefix}.${latestPatch + 1}`;
        return { nextVersion, latestPublishedVersion: latestPublishedVersionOfBase };
      } catch (e) {
        return { nextVersion: `${prefix}.0`, latestPublishedVersion: null };
      }
    };
    const { nextVersion, latestPublishedVersion } = await getNextVersion(targetVersionPrefix, tag);
    Logger.info(`Latest published version of @akanjs/base: ${latestPublishedVersion ?? "none"}`);
    Logger.info(`Next version of @akanjs/base: ${nextVersion}`);
    for (const library of akanPkgs) {
      const packageJson = workspace.readJson(`pkgs/${library}/package.json`) as { version: string };
      const newPackageJsonStr = JSON.stringify({ ...packageJson, version: nextVersion }, null, 2);
      workspace.writeFile(`pkgs/${library}/package.json`, newPackageJsonStr);
      const distPackageJson = workspace.readJson(`dist/pkgs/${library}/package.json`) as {
        version: string;
        dependencies?: Record<string, string>;
      };
      const newDistPackageJson = { ...distPackageJson, version: nextVersion };
      workspace.writeJson(`dist/pkgs/${library}/package.json`, newDistPackageJson);
    }
    const isDeployConfirmed = await confirm({
      message: "Are you sure you want to deploy the libraries?",
    });
    if (!isDeployConfirmed) {
      Logger.error("Deployment cancelled");
      return;
    }

    await Promise.all(
      akanPkgs.map(async (library) => {
        Logger.info(`Publishing ${library}@${nextVersion} to npm...`);
        await workspace.exec(`npm publish --tag ${tag}`, { cwd: `dist/pkgs/${library}` });
        Logger.info(`${library}@${nextVersion} is published to npm`);
      })
    );
    Logger.info("All libraries are published to npm");
  }
  async update(workspace: Workspace, tag: string = "latest") {
    if (!workspace.exists("package.json"))
      await workspace.spawn("npm", ["update", "-g", "@akanjs/cli", "--latest", `--tag=${tag}`]);
    else
      await Promise.all([
        workspace.spawn("npm", ["update", "-g", "@akanjs/cli", "--latest", `--tag=${tag}`]),
        this.#updateAkanPkgs(workspace, tag),
      ]);
  }
  async #updateAkanPkgs(workspace: Workspace, tag: string = "latest") {
    const latestPublishedVersionOfBase = await latestVersion("@akanjs/base", { version: tag });
    const rootPackageJson = workspace.getPackageJson();
    if (!rootPackageJson.dependencies) throw new Error("No dependencies found in package.json");
    Object.keys(rootPackageJson.dependencies).forEach((dependency) => {
      if (dependency.startsWith("@akanjs/"))
        Object.assign(rootPackageJson.dependencies ?? {}, { [dependency]: latestPublishedVersionOfBase });
    });
    Object.keys(rootPackageJson.devDependencies ?? {}).forEach((dependency) => {
      if (dependency.startsWith("@akanjs/"))
        Object.assign(rootPackageJson.devDependencies ?? {}, { [dependency]: latestPublishedVersionOfBase });
    });
    workspace.setPackageJson(rootPackageJson);
    await workspace.spawn("pnpm", ["install"]);
  }
}
