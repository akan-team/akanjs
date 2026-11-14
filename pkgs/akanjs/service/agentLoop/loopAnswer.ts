import { Err } from "akanjs/dictionary";
import type {
  AgentWireAttachment,
  AgentWireMessage,
  AgentWireToolCall,
  AgentWireToolResult,
} from "../predefinedAdaptor/llm.adaptor";
import type { AgentLoopCallAnswer } from "./agentLoopTypes";
import { LoopTranscript } from "./loopTranscript";

export class LoopAnswer {
  //? Security: client input. A run parks on the first call of its last batch nothing answered, so only that call takes
  //? an answer from outside, and the result is named by the call, never by what was sent.
  static resultOf(
    answer: AgentLoopCallAnswer,
    messages: readonly AgentWireMessage[],
    parks: (call: AgentWireToolCall) => boolean,
  ): AgentWireToolResult {
    const sent = (answer as Partial<AgentLoopCallAnswer> | null) ?? {};
    const { id, result, changes, error, code, attachments } = sent;
    if (typeof id !== "string" || !id) throw new Err("base.error.invalidArgument", { name: "answer" });
    const [parked] = LoopTranscript.pending(messages);
    if (!parked || parked.id !== id || !parks(parked)) throw new Err("agent.error.answerRefused", { id });
    return {
      id: parked.id,
      name: parked.name,
      ...(result !== undefined ? { result } : {}),
      ...(Array.isArray(changes) ? { changes } : {}),
      ...(typeof error === "string" && error ? { error } : {}),
      ...(typeof code === "string" ? { code } : {}),
      ...(Array.isArray(attachments) ? { attachments: LoopAnswer.#files(attachments) } : {}),
    };
  }

  //? Security: a file arrives as its bytes or its text. A `url` is fetched by the provider, from an address a client chose.
  static #files(attachments: unknown[]): AgentWireAttachment[] {
    return attachments.flatMap((attachment): AgentWireAttachment[] => {
      const { name, mimeType, data, text } = (attachment ?? {}) as Partial<AgentWireAttachment>;
      if (typeof name !== "string" || typeof mimeType !== "string") return [];
      if (typeof data === "string" && data) return [{ name, mimeType, data }];
      return typeof text === "string" && text ? [{ name, mimeType, text }] : [];
    });
  }
}
