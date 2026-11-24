import type { AgentWireTool, LlmTurnRequest } from "./llm.adaptor";

export interface AnthropicToolChange {
  type: "tool_addition" | "tool_removal";
  tool: { type: "tool_reference"; name: string };
}
export interface AnthropicToolMessage {
  role: "system";
  content: AnthropicToolChange[];
}
export interface AnthropicTool {
  name: string;
  description?: string;
  input_schema: Record<string, unknown>;
  defer_loading?: true;
}

//? Anthropic binds a thinking block to the tools before it, compared by definition. A tool opened later is declared
//? from the start with `defer_loading`, which keeps it out of that comparison, and shown with a `tool_addition`;
//? one taken off the list stays declared and goes with a `tool_removal`, so nothing the earlier turns saw changes.
export class AnthropicTools {
  static readonly beta = "mid-conversation-tool-changes-2026-07-01";

  static definition(tool: AgentWireTool, deferred = false): AnthropicTool {
    return {
      name: tool.name,
      ...(tool.description ? { description: tool.description } : {}),
      // The API rejects a tool without an input schema; a no-argument tool sends an empty object one.
      input_schema: tool.parameters ?? { type: "object", properties: {} },
      ...(deferred ? { defer_loading: true as const } : {}),
    };
  }

  static declared({ tools, deferred = [] }: Pick<LlmTurnRequest, "tools" | "deferred">): AgentWireTool[] {
    const seen = new Set<string>();
    return [...tools, ...deferred].filter((tool) => !seen.has(tool.name) && !!seen.add(tool.name));
  }

  static changes(
    from: ReadonlySet<string>,
    to: ReadonlySet<string>,
    declared: ReadonlySet<string>,
  ): AnthropicToolChange[] {
    const change = (type: AnthropicToolChange["type"], name: string): AnthropicToolChange => ({
      type,
      tool: { type: "tool_reference", name },
    });
    return [
      ...[...to].filter((name) => !from.has(name) && declared.has(name)).map((name) => change("tool_addition", name)),
      ...[...from].filter((name) => !to.has(name) && declared.has(name)).map((name) => change("tool_removal", name)),
    ];
  }

  static engaged(body: { tools?: AnthropicTool[]; messages: { role: string }[] }): boolean {
    return (
      !!body.tools?.some((tool) => tool.defer_loading) || body.messages.some((message) => message.role === "system")
    );
  }
}
