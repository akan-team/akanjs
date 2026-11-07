import { script, type Workspace } from "@akanjs/devkit/commandDecorators";
import { Logger } from "akanjs/common";
import { AgentRunner, type AgentTarget } from "./agent.runner";
import { AgentHook, type AgentHookInput } from "./agentHook";

const singleTargets = ["cursor", "claude", "rules", "skills", "hooks"] as const;

//* The AGENTS.md block indexes the rule and skill files, so installing it alone would point at files that are absent.
//* Hooks run a check after every edit, so they are never part of `all`: a team opts in.
const resolveTargets = (target: string | null): AgentTarget[] => {
  if (!target || target === "all") return ["cursor", "agents-md", "claude", "rules", "skills"];
  if (target === "agents-md") return ["agents-md", "rules", "skills"];
  const single = singleTargets.find((name) => name === target);
  if (single) return [single];
  throw new Error(`Unknown agent target: ${target}. Use cursor, agents-md, claude, rules, skills, hooks, or all.`);
};

export class AgentScript extends script("agent", [AgentRunner]) {
  async agent(
    workspace: Workspace,
    action: string,
    target: string | null,
    { force = false }: { force?: boolean } = {},
  ) {
    if (action === "hook") return await this.#hook(workspace, target);
    if (action !== "install") throw new Error(`Unknown agent action: ${action}. Use "install" or "hook".`);
    const written = await this.agentRunner.install(workspace, resolveTargets(target), { force });
    Logger.rawLog(`Agent rules written:\n${written.map((file) => `- ${file}`).join("\n")}`);
  }

  async #hook(workspace: Workspace, event: string | null) {
    if (!AgentHook.isEvent(event)) throw new Error(`Unknown hook: ${event}. Use ${AgentHook.events.join(", ")}.`);
    const raw = (await Bun.stdin.text()).trim();
    const input = (raw ? JSON.parse(raw) : {}) as AgentHookInput;
    const response = AgentHook.respond(event, await new AgentHook(workspace).run(event, input));
    if (response) process.stdout.write(`${response}\n`);
  }
}
