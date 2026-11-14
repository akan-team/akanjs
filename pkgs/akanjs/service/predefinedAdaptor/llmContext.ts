import type { AgentWireContext } from "./llm.adaptor";
import { LlmFence } from "./llmFence";

/** What an `LlmAdaptor` that builds its own request calls, so a turn's context reaches the model as the built-in dialects send it. */
export class LlmContext {
  /**
   * The text to append to the turn's last user-role content, and never to the system prompt; empty when the turn
   * carries no context. Blocks marked `untrusted` come fenced apart from the app's own, as page content.
   */
  static of(context: readonly AgentWireContext[]): string {
    if (!Array.isArray(context) || !context.length) return "";
    const own = context.filter((block) => !LlmFence.isMarked(block));
    const marked = context.filter(LlmFence.isMarked);
    return [
      own.length ? LlmFence.wrap(LlmFence.context, JSON.stringify(own)) : "",
      marked.length ? LlmFence.wrap(LlmFence.untrusted, JSON.stringify(marked)) : "",
    ]
      .filter(Boolean)
      .join("\n\n");
  }

  /** A `summary` message's text as user-role content: a compaction summary is history, never a system message. */
  static summary(text: string): string {
    return LlmFence.wrap(LlmFence.summary, text);
  }
}
