import type { AgentTool } from "../predefinedAdaptor/agentTools.adaptor";
import type { AgentWireToolCall, AgentWireToolResult } from "../predefinedAdaptor/llm.adaptor";

export class LoopAsk {
  static readonly toolName = "askUser";
  //? A server twin of use-agentic's `AgentSession.askUserTool`, which the server may not import; a test keeps them in step.
  static readonly tool: AgentTool = {
    name: LoopAsk.toolName,
    description:
      "Ask the user to decide something that is theirs to decide — an ambiguous request, a missing value, a choice between paths. Use it instead of guessing. Pass `choices` to offer options, or omit them for a free-text answer; the user may answer off-list either way. Returns what they chose or wrote, and errors if they dismiss it.",
    parameters: {
      type: "object",
      properties: {
        question: { type: "string", description: "What to ask, in one sentence." },
        choices: { type: "array", items: { type: "string" }, description: "The options to offer, as short labels." },
        multiple: { type: "boolean", description: "Let the user pick several choices. Ignored without choices." },
      },
      required: ["question"],
      additionalProperties: false,
    },
    readOnly: true,
    needsConfirm: false,
  };
  static readonly noQuestion = "askUser needs a question to ask.";

  readonly #on: boolean;

  constructor(on: boolean | undefined) {
    this.#on = on === true;
  }

  isMeta(name: string): boolean {
    return this.#on && name === LoopAsk.toolName;
  }

  listed(): AgentTool[] {
    return this.#on ? [LoopAsk.tool] : [];
  }

  static refusalOf({ id, name, args }: AgentWireToolCall): AgentWireToolResult | null {
    const question = typeof args.question === "string" ? args.question.trim() : "";
    return question ? null : { id, name, error: LoopAsk.noQuestion };
  }
}
