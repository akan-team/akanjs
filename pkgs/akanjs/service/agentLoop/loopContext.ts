import { LlmContext } from "../predefinedAdaptor/llmContext";
import type { AgentLoopRequest } from "./agentLoopTypes";

export class LoopContext {
  //? Security: text the request itself hands the model from another party taints the run before any tool has run.
  static marked({ context }: AgentLoopRequest): boolean {
    return LlmContext.marks(context);
  }
}
