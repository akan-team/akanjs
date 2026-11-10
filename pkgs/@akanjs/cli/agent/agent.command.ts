import { command, Workspace } from "@akanjs/devkit/commandDecorators";
import { AgentScript } from "./agent.script";

export class AgentCommand extends command("agent", [AgentScript], ({ public: target }) => ({
  //? Claude Code reads a hook's exit 2 as a block, so no failure here exits 2.
  agent: target({ desc: "Install Akan agent rules for editors and coding agents", stdio: true, usageExitCode: 1 })
    .arg("action", String, { desc: "install, or hook (run by Claude Code hooks)" })
    .arg("target", String, {
      desc: "install: cursor, agents-md, claude, rules, skills, hooks, or all; hook: pre-edit, post-edit, stop",
      nullable: true,
    })
    .option("force", Boolean, {
      desc: "overwrite existing pointer files and generated files you took over",
      default: false,
    })
    .option("check", Boolean, {
      desc: "write nothing; exit 3 when install would create, change or remove a file",
      default: false,
    })
    .with(Workspace)
    .exec(async function (action, targetName, force, check, workspace) {
      await this.agentScript.agent(workspace, action, targetName, { force, check });
    }),
})) {}
