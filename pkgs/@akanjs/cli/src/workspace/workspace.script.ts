import { Logger } from "@akanjs/common";
import { AppExecutor, Exec, LibExecutor, PkgExecutor, Workspace } from "@akanjs/devkit";

import { ApplicationScript } from "../application/application.script";
import { LibraryScript } from "../library/library.script";
import { WorkspaceRunner } from "./workspace.runner";

export class WorkspaceScript {
  #runner = new WorkspaceRunner();
  applicationScript = new ApplicationScript();
  libraryScript = new LibraryScript();

  async createWorkspace(
    repoName: string,
    appName: string,
    { dirname = ".", installLibs = false, tag = "latest" }: { dirname?: string; installLibs?: boolean; tag?: string }
  ) {
    const workspace = await this.#runner.createWorkspace(repoName, appName, { dirname, tag });
    if (installLibs) {
      await this.libraryScript.installLibrary(workspace, "util");
      await this.libraryScript.installLibrary(workspace, "shared");
    }
    await this.applicationScript.createApplication(appName, workspace, { libs: installLibs ? ["util", "shared"] : [] });
    Logger.rawLog(`\n🎉 Welcome aboard! Workspace created in ${dirname}/${repoName}`);
    Logger.rawLog(`🚀 Run \`cd ${repoName} && akan start ${appName}\` to start the development server.`);
    // Logger.rawLog(`\n💡 Run \`akan deploy\` to deploy the workspace to the cloud.`);
    Logger.rawLog(`\n👋 Happy coding!`);
  }
  async generateMongo(workspace: Workspace) {
    const spinner = workspace.spinning("Generating Mongo connections...");
    await this.#runner.generateMongo(workspace);
    spinner.succeed(`Mongo connections generated in infra/master/mongo-connections.json`);
  }
  async lint(exec: Exec, workspace: Workspace, { fix = true }: { fix?: boolean } = {}) {
    if (exec instanceof AppExecutor) await this.applicationScript.syncApplication(exec);
    else if (exec instanceof LibExecutor) await this.libraryScript.syncLibrary(exec);
    const spinner = workspace.spinning(`Linting${fix ? " with fix" : ""}...`);
    try {
      await this.#runner.lint(exec, workspace, { fix });
      spinner.succeed("Lint completed with no errors");
    } catch (error) {
      spinner.fail("Lint failed with errors");
      throw error;
    }
  }
  async lintAll(workspace: Workspace, { fix = true }: { fix?: boolean } = {}) {
    const [appNames, libNames, pkgNames] = await workspace.getExecs();
    await Promise.all(
      appNames.map((appName) => this.applicationScript.syncApplication(AppExecutor.from(workspace, appName)))
    );
    await Promise.all(libNames.map((libName) => this.libraryScript.syncLibrary(LibExecutor.from(workspace, libName))));
    await Promise.all([
      ...appNames.map((appName) => this.#runner.lint(AppExecutor.from(workspace, appName), workspace, { fix })),
      ...libNames.map((libName) => this.#runner.lint(LibExecutor.from(workspace, libName), workspace, { fix })),
      ...pkgNames
        .filter((pkgName) => pkgName !== "contract") // ! contract는 우선 무시
        .map((pkgName) => this.#runner.lint(PkgExecutor.from(workspace, pkgName), workspace, { fix })),
    ]);
  }
  async syncAll(workspace: Workspace) {
    const [appNames, libNames] = await workspace.getExecs();
    for (const libName of libNames) await this.libraryScript.syncLibrary(LibExecutor.from(workspace, libName));
    for (const appName of appNames) await this.applicationScript.syncApplication(AppExecutor.from(workspace, appName));
  }
  async dumpDatabaseAll(workspace: Workspace, environment: string) {
    const appNames = await workspace.getApps();
    for (const appName of appNames)
      await this.applicationScript.dumpDatabase(AppExecutor.from(workspace, appName), environment);
  }
  async restoreDatabaseAll(workspace: Workspace, source: string, target: string) {
    const appNames = await workspace.getApps();
    for (const appName of appNames)
      await this.applicationScript.restoreDatabase(AppExecutor.from(workspace, appName), source, target);
  }
}
