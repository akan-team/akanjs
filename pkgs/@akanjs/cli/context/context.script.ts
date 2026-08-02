import { type AkanMcpInstallTarget, type AkanMcpMode, akanMcpInstallTargets } from "@akanjs/devkit/akanContext";
import { script, type Workspace } from "@akanjs/devkit/commandDecorators";
import { jsonText } from "@akanjs/devkit/workflow";
import { Logger } from "akanjs/common";
import { ContextRunner } from "./context.runner";

const resolveMcpInstallTargets = (target: string | null): AkanMcpInstallTarget[] => {
  if (!target || target === "all") return [...akanMcpInstallTargets];
  if ((akanMcpInstallTargets as string[]).includes(target)) return [target as AkanMcpInstallTarget];
  throw new Error(`Unknown MCP install target: ${target}. Use cursor, claude, codex, or all.`);
};

const mcpTargetLabels: Record<AkanMcpInstallTarget, string> = {
  cursor: "Cursor",
  claude: "Claude Code",
  codex: "Codex",
};

export class ContextScript extends script("context", [ContextRunner]) {
  async context(
    workspace: Workspace,
    options: { format?: "json" | "markdown"; app?: string | null; module?: string | null } = {},
  ) {
    Logger.rawLog(await this.contextRunner.getContext(workspace, options));
  }

  async doctor(workspace: Workspace, options: { format?: "text" | "json"; strict?: boolean; ios?: boolean } = {}) {
    Logger.rawLog(await this.contextRunner.doctor(workspace, options));
  }

  async mcpInstall(
    workspace: Workspace,
    target: string | null,
    { force = false, mode = "apply" }: { force?: boolean; mode?: AkanMcpMode } = {},
  ) {
    const targets = resolveMcpInstallTargets(target);
    const written: string[] = [];
    for (const t of targets) {
      const configPath = await this.contextRunner.installMcp(workspace, t, { force, mode });
      written.push(`${mcpTargetLabels[t]}: ${configPath}`);
    }
    Logger.rawLog(`Akan MCP server installed (${mode} mode):\n${written.map((line) => `- ${line}`).join("\n")}`);
  }

  async mcp(workspace: Workspace, { mode = "apply" }: { mode?: AkanMcpMode } = {}) {
    await this.contextRunner.runMcp(workspace, { mode });
  }

  async mcpCall(
    workspace: Workspace,
    tool: string,
    {
      mode = "readonly",
      args = null,
      format = "json",
    }: { mode?: AkanMcpMode; args?: string | null; format?: "json" } = {},
  ) {
    let parsedArgs: Record<string, unknown> = {};
    if (args) {
      const parsed = JSON.parse(args) as unknown;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("MCP call args must be a JSON object.");
      }
      parsedArgs = parsed as Record<string, unknown>;
    }
    const result = await this.contextRunner.callMcpTool(workspace, tool, parsedArgs, { mode });
    Logger.rawLog(format === "json" ? jsonText(result) : String(result));
  }
}
