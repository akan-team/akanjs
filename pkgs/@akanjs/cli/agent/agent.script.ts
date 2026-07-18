import { script, type Workspace } from "@akanjs/devkit";
import { Logger } from "akanjs/common";
import { AgentRunner } from "./agent.runner";

type AgentTarget = "cursor" | "agents-md" | "claude";

const resolveTargets = (target: string | null): AgentTarget[] => {
  if (!target || target === "all") return ["cursor", "agents-md", "claude"];
  if (target === "cursor" || target === "agents-md" || target === "claude") return [target];
  throw new Error(`Unknown agent target: ${target}. Use cursor, agents-md, claude, or all.`);
};

export class AgentScript extends script("agent", [AgentRunner]) {
  async agent(
    workspace: Workspace,
    action: string,
    target: string | null,
    { force = false }: { force?: boolean } = {},
  ) {
    if (action !== "install") throw new Error(`Unknown agent action: ${action}. Use "install".`);
    const written = await this.agentRunner.install(workspace, resolveTargets(target), { force });
    Logger.rawLog(`Agent rules written:\n${written.map((file) => `- ${file}`).join("\n")}`);
  }
}
