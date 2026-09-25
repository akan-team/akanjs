import path from "node:path";
import { type Exec, script, type Workspace } from "@akanjs/devkit/commandDecorators";
import { AppExecutor, LibExecutor, PkgExecutor } from "@akanjs/devkit/executors";
import { Logger } from "akanjs/common";

import { AgentScript } from "../agent/agent.script";
import { ApplicationScript } from "../application/application.script";
import { CloudScript } from "../cloud/cloud.script";
import { ContextScript } from "../context/context.script";
import { LibraryScript } from "../library/library.script";
import { PackageScript } from "../package/package.script";
import { WorkspaceRunner } from "./workspace.runner";

export class WorkspaceScript extends script("workspace", [
  WorkspaceRunner,
  ApplicationScript,
  LibraryScript,
  PackageScript,
  CloudScript,
  ContextScript,
  AgentScript,
]) {
  async createWorkspace(
    repoName: string,
    appName: string,
    {
      dirname = ".",
      installLibs = false,
      init = true,
      registryUrl,
      owner,
      mcpInstall = true,
      agentInstall = true,
    }: {
      dirname?: string;
      installLibs?: boolean;
      init?: boolean;
      registryUrl?: string;
      owner?: string | null;
      mcpInstall?: boolean;
      agentInstall?: boolean;
    },
  ) {
    const akanVersion = await this.packageScript.version(null, { log: false });
    const workspace = await this.workspaceRunner.createWorkspace(repoName, appName, {
      dirname,
      init,
      akanVersion,
      ...(registryUrl ? { registryUrl } : {}),
      ...(owner ? { owner } : {}),
    });
    if (installLibs) {
      await this.libraryScript.installLibrary(workspace, "util");
      await this.libraryScript.installLibrary(workspace, "shared");
    }
    await this.applicationScript.createApplication(appName, workspace, { libs: installLibs ? ["util", "shared"] : [] });
    await workspace.applyTemplate({
      basePath: `apps/${appName}`,
      template: "appSample",
      dict: { appName },
      options: { libs: installLibs ? ["util", "shared"] : [] },
    });
    if (agentInstall) await this.agentScript.agent(workspace, "install", "all", { force: true });
    if (mcpInstall) await this.contextScript.mcpInstall(workspace, "all", { force: true });
    const gitSpinner = workspace.spinning("Initializing git repository and commit...");
    try {
      await workspace.commit("Initial commit", { init: true });
      gitSpinner.succeed("Git repository initialized and committed");
    } catch (_) {
      gitSpinner.fail("Git repository initialization failed. It's not fatal, you can commit manually");
    }
    const workspacePath = path.join(dirname, repoName);
    Logger.rawLog(`\n🎉 Welcome aboard! Workspace created in ${dirname}/${repoName}`);
    Logger.rawLog(`🚀 Run \`cd ${workspacePath} && akan start ${appName}\` to start the development server.`);
    // Logger.rawLog(`\n💡 Run \`akan deploy\` to deploy the workspace to the cloud.`);
    Logger.rawLog(`\n👋 Happy coding!`);
  }
  async generateAgentRules(
    workspace: Workspace,
    { overwrite = false, cursorRules = true }: { overwrite?: boolean; cursorRules?: boolean } = {},
  ) {
    const spinner = workspace.spinning("Generating agent rules...");
    const files = await this.workspaceRunner.generateAgentRules(workspace, { overwrite, cursorRules });
    spinner.succeed(`Agent rules ready (${files.length} file${files.length === 1 ? "" : "s"})`);
  }
  async lint(exec: Exec, workspace: Workspace, { fix = true }: { fix?: boolean } = {}) {
    if (exec instanceof AppExecutor) await this.applicationScript.sync(exec);
    else if (exec instanceof LibExecutor) await this.libraryScript.syncLibrary(exec);
    const spinner = workspace.spinning(`Linting${fix ? " with fix" : ""}...`);
    try {
      await this.workspaceRunner.lint(exec, workspace, { fix });
      spinner.succeed("Lint completed with no errors");
    } catch (error) {
      spinner.fail("Lint failed with errors");
      throw error;
    }
  }
  async lintAll(workspace: Workspace, { fix = true }: { fix?: boolean } = {}) {
    const [appNames, libNames, pkgNames] = await workspace.getExecs();
    await Promise.all(appNames.map((appName) => this.applicationScript.sync(AppExecutor.from(workspace, appName))));
    await Promise.all(libNames.map((libName) => this.libraryScript.syncLibrary(LibExecutor.from(workspace, libName))));
    await Promise.all([
      ...appNames.map((appName) => this.workspaceRunner.lint(AppExecutor.from(workspace, appName), workspace, { fix })),
      ...libNames.map((libName) => this.workspaceRunner.lint(LibExecutor.from(workspace, libName), workspace, { fix })),
      ...pkgNames
        .filter((pkgName) => pkgName !== "contract") // ! contract는 우선 무시
        .map((pkgName) => this.workspaceRunner.lint(PkgExecutor.from(workspace, pkgName), workspace, { fix })),
    ]);
  }
  async syncAll(workspace: Workspace) {
    const [appNames, libNames] = await workspace.getExecs();
    for (const libName of libNames) await this.libraryScript.syncLibrary(LibExecutor.from(workspace, libName));
    for (const appName of appNames) await this.applicationScript.sync(AppExecutor.from(workspace, appName));
  }
  async init(devProjectId: string, workspace: Workspace, { host }: { host?: string } = {}) {
    const [bunfigExists, packageJsonExists, tsconfigExists] = await Promise.all([
      workspace.exists("bunfig.toml"),
      workspace.exists("package.json"),
      workspace.exists("tsconfig.json"),
    ]);
    const isRoot = bunfigExists && packageJsonExists && tsconfigExists;
    if (!isRoot) throw new Error("Current directory is not a root workspace");
    const spinner = workspace.spinning("Initializing workspace...");
    try {
      await this.workspaceRunner.writeTopLevelEnv(workspace, devProjectId);
      await this.cloudScript.downloadEnv(workspace, devProjectId, { host });
      spinner.succeed("Workspace initialized");
    } catch (error) {
      spinner.fail("Workspace initialization failed");
      throw error;
    }
  }
}
