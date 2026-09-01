import type { ChatMessage } from "./types";

export interface CompactOptions {
  /** Estimated transcript tokens above which a turn summarizes its own history first. `0` never compacts. */
  at?: number;
  /** Messages left verbatim below the summary. The cut slides down to the first message that can safely open one. */
  keep?: number;
  /** Produces the summary from the digest. Default: one tool-less turn through the session's own runner. */
  summarize?: (digest: string, signal: AbortSignal) => Promise<string>;
}

/**
 * Turns the part of a transcript that no longer fits into one message standing in for it. The loop runs in the
 * browser and the relay is stateless, so nothing else is keeping the conversation inside the model's window: an
 * uncompacted chat simply grows until the provider refuses the request.
 */
export class Compaction {
  /**
   * Deliberately well under the smallest window a provider is likely to have: what a conversation loses to an
   * early summary is detail, and what it loses to a late one is the conversation. The tools, the screen context
   * and the system prompt ride on top of the transcript on every turn, and none of them is compactable.
   */
  static readonly defaults = { at: 24_000, keep: 6 };

  static readonly instruction =
    "Summarize the conversation below so you can carry it on with the summary in place of the messages themselves. " +
    "Keep what the user is trying to do, the decisions taken, the facts and tool results that still matter, and " +
    "anything left unfinished. Drop pleasantries and anything already superseded. Write compact notes, not prose, " +
    "and write nothing but the summary itself.";

  /**
   * Four characters per token, counted over the JSON the turn actually posts. A rough estimate on purpose: this
   * places a threshold, and shipping a per-provider tokenizer to the browser to place it more exactly would cost
   * more than the slack the estimate leaves.
   */
  static tokensOf(messages: readonly ChatMessage[]): number {
    let chars = 0;
    for (const message of messages) if (!message.local) chars += JSON.stringify(message).length;
    return Math.ceil(chars / 4);
  }

  /**
   * Where the kept half starts, or `-1` when nothing can be cut. A user message is the boundary to prefer —
   * everything above it is settled — but one assistant turn that ran ten tools leaves no user message anywhere
   * near the tail, and that is exactly the transcript that outgrows the window. What the pairing every provider
   * dialect enforces actually requires is only that the kept half not open with a `tool` result whose call was
   * summarized away, so any non-`tool` message opens one too. `keep: 0` summarizes the whole transcript, which is
   * what the command does.
   */
  static cutAt(messages: readonly ChatMessage[], keep: number): number {
    if (!messages.length) return -1;
    if (keep <= 0) return messages.length;
    const target = messages.length - keep;
    if (target <= 0) return -1;
    let boundary = -1;
    for (let at = target; at < messages.length; at += 1) {
      if (messages[at].role === "user") return at;
      if (boundary < 0 && messages[at].role !== "tool") boundary = at;
    }
    if (boundary >= 0) return boundary;
    // The whole tail is one trailing result: cut above the call it answers rather than between the two.
    for (let at = target - 1; at > 0; at -= 1) if (messages[at].role !== "tool") return at;
    return -1;
  }

  /**
   * The messages as one bounded block of text. Bounded is the point: the transcript being summarized is the one
   * that no longer fits, so feeding it back verbatim would fail exactly where compaction is needed most.
   */
  static digest(messages: readonly ChatMessage[], budget = 12_000): string {
    const lines = messages.filter((message) => !message.local).map((message) => Compaction.#line(message));
    if (lines.reduce((sum, line) => sum + line.length + 1, 0) <= budget) return lines.join("\n");
    // The head holds the previous summary — everything already compacted once — and the tail holds where the
    // conversation actually is, so an overlong digest gives way in the middle rather than at either end.
    const head: string[] = [];
    const tail: string[] = [];
    let used = 0;
    let low = 0;
    let high = lines.length - 1;
    let fromHead = true;
    while (low <= high) {
      const line = lines[fromHead ? low : high];
      if (used + line.length + 1 > budget) break;
      used += line.length + 1;
      if (fromHead) {
        head.push(line);
        low += 1;
      } else {
        tail.unshift(line);
        high -= 1;
      }
      fromHead = !fromHead;
    }
    return [...head, `[... ${high - low + 1} messages omitted ...]`, ...tail].join("\n");
  }

  static message(summary: string): ChatMessage {
    return { role: "user", text: summary, summary: true };
  }

  static #line(message: ChatMessage): string {
    const parts: string[] = [];
    if (message.text) parts.push(Compaction.#clip(message.text, 1200));
    for (const attachment of message.attachments ?? []) parts.push(`[attached ${attachment.name}]`);
    for (const call of message.toolCalls ?? [])
      parts.push(`[called ${call.name} ${Compaction.#clip(JSON.stringify(call.args), 200)}]`);
    for (const result of message.toolResults ?? [])
      parts.push(
        `[${result.error ? "failed" : "result"} ${result.name}: ${Compaction.#clip(
          result.error ?? JSON.stringify(result.result ?? null),
          400,
        )}]`,
      );
    if (message.error) parts.push(`[turn failed: ${message.error}]`);
    return `${message.role}: ${parts.join(" ")}`.trimEnd();
  }

  static #clip(text: string, max: number): string {
    return text.length <= max ? text : `${text.slice(0, max)}...`;
  }
}
