import { LlmContext } from "../predefinedAdaptor/llmContext";
import type { AgentLoopRequest } from "./agentLoopTypes";

export class LoopContext {
  //? Security: text the request itself hands the model from another party taints the run before any tool has run: a
  //? context block marked `untrusted`, or the record a message points at, whose title and value its author wrote.
  static marked({ context, messages }: AgentLoopRequest): boolean {
    if (LlmContext.marks(context)) return true;
    return Array.isArray(messages) && messages.some((message) => !!message?.references?.length);
  }
}
