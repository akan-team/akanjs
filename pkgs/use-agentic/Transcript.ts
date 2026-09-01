import type { ChatMessage } from "./types";

/**
 * The transcript's own invariant, in one place because three paths break it: a turn stopped between a tool call
 * and its result, a transcript restored from storage mid-turn, and a stored transcript capped to its newest
 * messages, which can cut a call away from the result answering it.
 *
 * Every provider dialect requires each tool call to be answered by a result and each result to answer a call the
 * request carries. A transcript that breaks the pairing is not degraded — it is refused, on this turn and on
 * every later one, so the conversation is over until the user clears it. Which is why the repair runs where the
 * transcript is assembled rather than where each hole is made.
 */
export class Transcript {
  static readonly unanswered = "The turn was stopped before this call ran.";

  /** What one turn posts: no host-only message, no unanswered call, no result answering a call nobody sees. */
  static wire(messages: readonly ChatMessage[]): ChatMessage[] {
    return Transcript.sanitize(messages.filter((message) => !message.local));
  }

  static sanitize(messages: readonly ChatMessage[]): ChatMessage[] {
    const answered = new Set(messages.flatMap((message) => (message.toolResults ?? []).map((result) => result.id)));
    const called = new Set<string>();
    const kept: ChatMessage[] = [];
    for (const message of messages) {
      if (message.role === "tool") {
        const results = (message.toolResults ?? []).filter((result) => called.has(result.id));
        if (results.length) kept.push({ ...message, toolResults: results });
        continue;
      }
      if (message.role === "assistant" && !Transcript.#carries(message)) continue;
      kept.push(message);
      const calls = message.toolCalls ?? [];
      for (const call of calls) called.add(call.id);
      const unanswered = calls.filter((call) => !answered.has(call.id));
      // Answered rather than erased: what the agent tried to do is the transcript's, and a model told the call
      // was stopped asks again, where one shown no call at all answers as if it had the result.
      if (unanswered.length)
        kept.push({
          role: "tool",
          toolResults: unanswered.map((call) => ({ id: call.id, name: call.name, error: Transcript.unanswered })),
        });
    }
    return kept;
  }

  /** An empty assistant message is a draft a reload or an abort caught before it said anything. */
  static #carries(message: ChatMessage) {
    return !!message.text || !!message.error || !!message.toolCalls?.length || !!message.attachments?.length;
  }
}
