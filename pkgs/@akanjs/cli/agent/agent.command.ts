import { command, Workspace } from "@akanjs/devkit/commandDecorators";
import { AgentScript } from "./agent.script";

export class AgentCommand extends command("agent", [AgentScript], ({ public: target }) => ({
  agent: target({ desc: "Install Akan agent rules for editors and coding agents", stdio: true })
    .arg("action", String, { desc: "install, or hook (run by Claude Code hooks)" })
    .arg("target", String, {
      desc: "install: cursor, agents-md, claude, rules, skills, hooks, or all; hook: pre-edit, post-edit, stop",
      nullable: true,
    })
    .option("force", Boolean, {
      desc: "overwrite existing pointer files and generated files you took over",
      default: false,
    })
    .with(Workspace)
    .exec(async function (action, targetName, force, workspace) {
      await this.agentScript.agent(workspace, action, targetName, { force });
    }),
})) {}
