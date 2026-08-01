import { command, Exec, GlobalConfig, Workspace } from "@akanjs/devkit";

import { WorkspaceScript } from "./workspace.script";

export class WorkspaceCommand extends command("workspace", [WorkspaceScript], ({ public: target }) => ({
  createWorkspace: target({ desc: "Create a new Akan.js workspace", runsOnWorkspaceRoot: false })
    .arg("workspaceName", String, { desc: "what is the name of your organization?" })
    .option("app", String, {
      desc: "what is the codename of your first application? (e.g. myapp)",
    })
    .option("dir", String, {
      desc: "directory of workspace",
      default: process.env.USE_AKANJS_PKGS === "true" ? "local" : ".",
    })
    .option("libs", Boolean, {
      desc: "Do you want to install shared and util libraries? (admin, user file, etc.)",
      enum: [
        { label: "No, I want to start with empty workspace (Recommended)", value: false },
        {
          label: "Yes, I want to accelerate development by installing shared and util libraries (for akanjs experts)",
          value: true,
        },
      ],
      default: false,
    })
    .option("init", Boolean, {
      desc: "Do you want to initialize the workspace? (Recommended)",
      default: true,
    })
    .option("registry", String, {
      desc: "npm registry URL for installing Akan packages",
      default: process.env.AKAN_NPM_REGISTRY ?? "https://registry.npmjs.org",
    })
    .option("owner", String, {
      desc: "owner of the workspace",
      default: process.env.GITHUB_OWNER,
      nullable: true,
    })
    .option("mcpInstall", Boolean, {
      desc: "Install the Akan MCP server config for Cursor, Claude Code, and Codex? (Recommended)",
      default: true,
    })
    .option("agentInstall", Boolean, {
      flag: "A",
      desc: "Install Akan agent rules (AGENTS.md, CLAUDE.md, Cursor)? (Recommended)",
      default: true,
    })
    .exec(async function (workspaceName, app, dir, libs, init, registry, owner, mcpInstall, agentInstall) {
      const appName = app || "app";
      await this.workspaceScript.createWorkspace(
        workspaceName.toLowerCase().replace(/ /g, "-"),
        appName.toLowerCase().replace(/ /g, "-"),
        {
          dirname: dir,
          installLibs: libs,
          init,
          owner,
          mcpInstall,
          agentInstall,
          ...(registry ? { registryUrl: registry } : {}),
        },
      );
    }),
  generateAgentRules: target({
    desc: "Generate AGENTS.md, CLAUDE.md, and optional Cursor rules for Akan coding agents",
  })
    .option("overwrite", Boolean, { desc: "Overwrite existing agent rule files", default: false })
    .option("cursorRules", Boolean, { desc: "Generate .cursor/rules/akan.mdc", default: true })
    .with(Workspace)
    .exec(async function (overwrite, cursorRules, workspace) {
      await this.workspaceScript.generateAgentRules(workspace, { overwrite, cursorRules });
    }),
  lint: target({ desc: "Lint and fix code in a specific app/lib/pkg" })
    .with(Exec)
    .option("fix", Boolean, { default: true })
    .with(Workspace)
    .exec(async function (exec, fix, workspace) {
      await this.workspaceScript.lint(exec, workspace, { fix });
    }),
  lintAll: target({ desc: "Lint and fix code in all apps and libraries" })
    .option("fix", Boolean, { default: true })
    .with(Workspace)
    .exec(async function (fix, workspace) {
      await this.workspaceScript.lintAll(workspace, { fix });
    }),
  syncAll: target({ desc: "Sync dependencies and configuration for all apps and libraries" })
    .with(Workspace)
    .exec(async function (workspace) {
      await this.workspaceScript.syncAll(workspace);
    }),
  init: target({ desc: "Initialize the workspace", runsOnWorkspaceRoot: false })
    .arg("devProjectId", String, { desc: "the ID of the workspace" })
    .option("host", String, { desc: "host of the cloud to target", default: GlobalConfig.akanCloudHost })
    .with(Workspace)
    .exec(async function (devProjectId, host, workspace) {
      await this.workspaceScript.init(devProjectId, workspace, { host });
    }),
})) {}
