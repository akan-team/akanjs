import { Argument, Commands, Exec, Option, Target, Workspace } from "@akanjs/devkit";

import { WorkspaceScript } from "./workspace.script";

@Commands()
export class WorkspaceCommand {
  workspaceScript = new WorkspaceScript();

  @Target.Public()
  async createWorkspace(
    @Argument("workspaceName", { desc: "what is the name of your organization?" }) workspaceName: string,
    @Option("app", { desc: "what is the codename of your first application? (e.g. myapp)" }) app: string,
    @Option("dir", { desc: "directory of workspace", default: process.env.USE_AKANJS_PKGS === "true" ? "local" : "." })
    dir: string,
    @Option("libs", {
      type: "boolean",
      desc: "Do you want to install shared and util libraries? (admin, user file, etc.)",
      enum: [
        { label: "No, I want to start with empty workspace (Recommended)", value: false },
        {
          label: "Yes, I want to accelerate development by installing shared and util libraries (for akanjs experts)",
          value: true,
        },
      ],
    })
    libs: boolean,
    @Option("tag", {
      desc: "tag of the update",
      default: "latest",
      enum: ["latest", "dev", "canary", "beta", "rc", "alpha"],
    })
    tag: string
  ) {
    await this.workspaceScript.createWorkspace(
      workspaceName.toLowerCase().replace(/ /g, "-"),
      app.toLowerCase().replace(/ /g, "-"),
      { dirname: dir, installLibs: libs, tag }
    );
  }

  @Target.Public()
  async generateMongo(@Workspace() workspace: Workspace) {
    await this.workspaceScript.generateMongo(workspace);
  }

  @Target.Public()
  async lint(
    @Exec() exec: Exec,
    @Option("fix", { type: "boolean", default: true }) fix: boolean,
    @Workspace() workspace: Workspace
  ) {
    await this.workspaceScript.lint(exec, workspace, { fix });
  }

  @Target.Public()
  async lintAll(@Option("fix", { type: "boolean", default: true }) fix: boolean, @Workspace() workspace: Workspace) {
    await this.workspaceScript.lintAll(workspace, { fix });
  }

  @Target.Public()
  async syncAll(@Workspace() workspace: Workspace) {
    await this.workspaceScript.syncAll(workspace);
  }

  @Target.Public()
  async dumpDatabaseAll(
    @Option("environment", {
      desc: "environment",
      default: "debug",
      enum: ["debug", "develop", "main"],
      ask: "Select the environment to dump the database",
    })
    environment: string,
    @Workspace() workspace: Workspace
  ) {
    await this.workspaceScript.dumpDatabaseAll(workspace, environment);
  }

  @Target.Public()
  async restoreDatabaseAll(
    @Option("source", {
      desc: "source environment",
      enum: ["debug", "develop", "main"],
      ask: "Select the source environment of local dump",
    })
    source: string,
    @Option("target", {
      desc: "target environment",
      enum: ["debug", "develop", "main"],
      ask: "Select the target environment to restore the database",
    })
    target: string,
    @Workspace() workspace: Workspace
  ) {
    await this.workspaceScript.restoreDatabaseAll(workspace, source, target);
  }
}
