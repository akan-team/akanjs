import { Logger } from "akanjs/common";
import type { AgentWireMessage } from "../predefinedAdaptor/llm.adaptor";
import { LlmFence } from "../predefinedAdaptor/llmFence";
import type { AgentLoopRequest } from "./agentLoopTypes";

export class LoopContext {
  static readonly heldWrite =
    "Not run: this tool changes data, and this conversation carries text other people may have written, a record the user pointed at or page text the app marked, so nothing may change data without a person's approval. None is available to this run. Do not call it again; tell the user what was left undone.";
  static readonly heldCode = "writeAfterPageText";
  static readonly #logger = new Logger("AgentLoop");
  static readonly #warned = new WeakSet<AgentLoopRequest>();

  //? Security: text the request itself hands the model from another party taints the run before any tool has run: a
  //? context block marked `untrusted`, or the record a message points at, whose title and value its author wrote.
  static marked({ context, messages }: AgentLoopRequest): boolean {
    if (LlmFence.marks(context)) return true;
    return Array.isArray(messages) && messages.some((message) => !!message?.references?.length);
  }

  //? A marked block is stored with its context message; one passed before the loop stored context left only the mark
  //? on what the model then said. Ahead of the first tool result or summary nothing else sets that mark.
  static carried(request: AgentLoopRequest, messages: readonly AgentWireMessage[]): boolean {
    if (LoopContext.marked(request)) return true;
    if (messages.some((message) => !!message.references?.length || (message.context && message.tainted))) return true;
    const first = messages.find(
      ({ role, summary, tainted, context }) => !context && (role === "tool" || summary || tainted),
    );
    return first?.role === "assistant" && !first.summary;
  }

  static held(request: AgentLoopRequest, name: string): { deny: string; code: string } {
    if (!LoopContext.#warned.has(request)) {
      LoopContext.#warned.add(request);
      LoopContext.#logger.warn(
        `agent loop refused ${name}: the conversation carries \`references\` or a context block marked \`untrusted\`, which holds every write from then on, and the request has no \`approve\`. Pass \`approve\` to decide such calls.`,
      );
    }
    return { deny: LoopContext.heldWrite, code: LoopContext.heldCode };
  }
}
