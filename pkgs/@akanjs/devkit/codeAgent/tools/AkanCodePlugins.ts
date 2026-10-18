import type { InlineExtension } from "@earendil-works/pi-coding-agent";
import type { CodeAgentMcpStatus, CodeAgentProfile, CodeAgentQuestion, CodeAgentSubagent } from "akanjs/common";
import type { Workspace } from "../../commandDecorators";
import type { CodeMailbox } from "../agent/CodeMailbox";
import { SubagentPool, type SubagentSpend } from "../agent/SubagentPool";
import { DevLogFeedback } from "../feedback/DevLogFeedback";
import { PreviewFeedback } from "../feedback/PreviewFeedback";
import { PreviewView } from "../feedback/PreviewView";
import { TurnFeedback, type TurnFeedbackSource } from "../feedback/TurnFeedback";
import { VerifyFeedback } from "../feedback/VerifyFeedback";
import { AkanToolPack } from "./AkanToolPack";
import { AskToolPack } from "./AskToolPack";
import type { DeepSeekWeb } from "./DeepSeekWeb";
import { MailToolPack } from "./MailToolPack";
import { McpToolPack } from "./McpToolPack";
import { SessionToolPack } from "./SessionToolPack";
import { WebToolPack } from "./WebToolPack";

export interface AkanCodePluginsOptions {
  workspace: Workspace;
  cwd: string;
  profile: CodeAgentProfile;
  /** Apps whose dev server should be watched, and whose page should be probed. */
  apps: string[];
  canSeeImages: boolean;
  deepseek?: DeepSeekWeb | undefined;
  /** How many `task` levels deep the owning agent is. */
  depth: number;
  /** The tally of the sub-agent tree the owning agent belongs to, when a `task` opened it. */
  subagentSpend?: SubagentSpend;
  /** Reading the current session back would spend its own window twice, so it is excluded from search. */
  currentSessionId: () => string;
  /** Late, because the session this announces to its peers does not exist yet when the pack is built. */
  mailbox: () => CodeMailbox | undefined;
  onNotice?: (message: string) => void;
  onAgents?: (agents: CodeAgentSubagent[]) => void;
  /** How `ask_user` reaches the person. Absent on a host that has nobody to reach. */
  onAsk?: (question: Omit<CodeAgentQuestion, "questionId">) => Promise<string | undefined>;
}

export interface AkanCodePluginsResult {
  extensions: InlineExtension[];
  /** Names the session's tool allowlist has to carry, or the model is told these tools do not exist. */
  toolNames: string[];
  /** Every declared MCP server and what it published, including the ones that published nothing. */
  mcp: CodeAgentMcpStatus[];
  /** Closes anything the pack holds open — currently the MCP server connections. */
  dispose: () => void;
}

// Gated at assembly, not at call time: a capability the profile excludes is never built and costs no prompt tokens.
export class AkanCodePlugins {
  static async build(options: AkanCodePluginsOptions): Promise<AkanCodePluginsResult> {
    const mcp = await McpToolPack.connect({
      workspaceRoot: options.workspace.workspaceRoot,
      profile: options.profile,
      ...(options.onNotice ? { onNotice: options.onNotice } : {}),
    });
    const dispose = () => mcp?.close();
    const mcpStatus = mcp?.status ?? [];
    const web = new WebToolPack({ profile: options.profile, deepseek: options.deepseek });
    const sessions = new SessionToolPack({
      workspaceRoot: options.workspace.workspaceRoot,
      cwd: options.cwd,
      profile: options.profile,
      currentSessionId: options.currentSessionId,
    });
    const mail = new MailToolPack({ profile: options.profile, mailbox: options.mailbox });
    const onAsk = options.onAsk;
    const ask = onAsk ? new AskToolPack({ profile: options.profile, ask: onAsk }) : undefined;
    const shared = {
      extensions: [mcp?.extension(), web.extension(), sessions.extension(), mail.extension(), ask?.extension()].filter(
        (entry) => !!entry,
      ),
      toolNames: [
        ...(mcp?.toolNames ?? []),
        ...web.names(),
        ...sessions.names(),
        ...mail.names(),
        ...(ask?.names() ?? []),
      ],
    };
    if (!options.profile.tools.akan) return { ...shared, mcp: mcpStatus, dispose };
    const readOnly = !options.profile.tools.builtin.includes("write");
    const pack = new AkanToolPack({
      workspace: options.workspace,
      cwd: options.cwd,
      mode: readOnly ? "readonly" : "apply",
    });
    const extensions: InlineExtension[] = [pack.extension()];
    const subagent = SubagentPool.extensionFor({
      workspace: options.workspace,
      cwd: options.cwd,
      parent: options.profile,
      depth: options.depth,
      ...(options.subagentSpend ? { spend: options.subagentSpend } : {}),
      ...(options.onNotice ? { onNotice: options.onNotice } : {}),
      ...(options.onAgents ? { onAgents: options.onAgents } : {}),
    });
    if (subagent) extensions.push(subagent);
    const sources = await AkanCodePlugins.#sources(options, readOnly);
    if (sources.length)
      extensions.push(
        new TurnFeedback(sources, {
          budget: options.profile.limits.feedback,
          ...(options.onNotice ? { onNotice: options.onNotice } : {}),
        }).extension(),
      );
    return {
      extensions: [...extensions, ...shared.extensions],
      toolNames: [...(await pack.names()), ...(subagent ? [SubagentPool.toolName] : []), ...shared.toolNames],
      mcp: mcpStatus,
      dispose,
    };
  }

  static async #sources(options: AkanCodePluginsOptions, readOnly: boolean): Promise<TurnFeedbackSource[]> {
    const sources: TurnFeedbackSource[] = [
      new VerifyFeedback({ cwd: options.cwd, readOnly }),
      new DevLogFeedback({ workspaceRoot: options.workspace.workspaceRoot, cwd: options.cwd, apps: options.apps }),
    ];
    const previewUrl = await AkanCodePlugins.#previewUrl(options);
    if (!previewUrl) return sources;
    // Said once here, or a UI turn silently skips its only visual check and reads as a clean run.
    const reason = PreviewView.unavailableReason();
    if (reason) options.onNotice?.(reason);
    else sources.push(new PreviewFeedback({ cwd: options.cwd, previewUrl, canSeeImages: options.canSeeImages }));
    return sources;
  }

  static async #previewUrl(options: AkanCodePluginsOptions) {
    for (const app of options.apps) {
      const url = await DevLogFeedback.previewUrl(options.workspace.workspaceRoot, app);
      if (url) return url;
    }
    return undefined;
  }
}
