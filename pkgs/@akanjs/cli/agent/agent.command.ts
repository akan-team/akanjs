import { command, Workspace } from "@akanjs/devkit/commandDecorators";
import { AgentScript } from "./agent.script";

export class AgentCommand extends command("agent", [AgentScript], ({ public: target }) => ({
  agent: target({ desc: "Install Akan agent rules for editors and coding agents" })
    .arg("action", String, { desc: "install" })
    .arg("target", String, { desc: "cursor, agents-md, claude, or all", nullable: true })
    .option("force", Boolean, { desc: "overwrite existing rule files", default: false })
    .with(Workspace)
    .exec(async function (action, targetName, force, workspace) {
      await this.agentScript.agent(workspace, action, targetName, { force });
    }),
})) {}
