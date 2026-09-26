import type { ChatMessage, MessageAttachment, TurnLimits } from "./types";

export interface CompactOptions {
  /**
   * Estimated transcript tokens above which a turn summarizes its own history first — a ceiling on what each turn
   * costs, apart from the window guard. `Infinity` leaves only the guard; `0` turns automatic compaction off
   * altogether, the guard and the recovery from a refusal included.
   */
  at?: number;
  /** Messages left verbatim below the summary. The cut slides down to the first message that can safely open one. */
  keep?: number;
  /**
   * Tokens held free below the model's window on top of its answer ceiling, once the backend has reported the
   * window. It covers what the estimate cannot see: what arrived after the provider last counted, and a screen
   * that changed since.
   */
  buffer?: number;
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
   * `at` is a ceiling on cost rather than on the window. The relay holds no session, so every turn resends the
   * whole transcript and the app pays for each one — a chat left to fill a million-token window prefills most of
   * a million tokens per answer. The window is guarded on its own once the backend reports it, and `buffer` is the
   * margin that guard holds back: 13k, the one Claude Code leaves below its own threshold.
   */
  static readonly defaults = { at: 24_000, keep: 6, buffer: 13_000 };

  /** The answer ceiling assumed when the backend did not report one — the one most relays request when they do. */
  static readonly answerTokens = 8_192;

  /**
   * What one inlined picture costs a turn. A provider bills a picture by its pixels after its own downscale, not by
   * its bytes — Anthropic lands near 1,600 tokens and OpenAI's high-detail tiles under that — so counted as base64
   * a 300KB screenshot reads as 100k tokens and compacts itself out of the very task it was attached to.
   */
  static readonly imageTokens = 1_600;

  static readonly instruction =
    "Summarize the conversation below so you can carry it on with the summary in place of the messages themselves. " +
    "If it opens with a previous summary, carry forward everything in it that still matters: nothing else remembers " +
    "what came before it. " +
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
    for (const message of messages) if (!message.local) chars += Compaction.#charsOf(message);
    return Math.ceil(chars / 4);
  }

  /**
   * What the next request is estimated to cost, prompt and all: the provider's own count for the last turn that
   * reported one, plus four characters a token for what the transcript gained since. The provider's number is the
   * one that knows its tokenizer — Hangul sits nearer one character a token than four — so the rule only has to
   * cover the tail. With no count to start from, `overhead` stands in for what rides every turn beside the
   * transcript: the tools, the screen context and the instructions.
   */
  static promptTokensOf(messages: readonly ChatMessage[], overhead: () => number): number {
    for (let at = messages.length - 1; at >= 0; at -= 1) {
      const { usage } = messages[at];
      if (usage) return usage.input + usage.output + Compaction.tokensOf(messages.slice(at + 1));
    }
    return Compaction.tokensOf(messages) + overhead();
  }

  /**
   * The prompt size past which a turn compacts first, or `Infinity` while the window is unknown. The answer shares
   * the window with the prompt, so its ceiling is held back along with `buffer`.
   */
  static thresholdOf(limits: TurnLimits, buffer: number): number {
    if (!limits.window) return Number.POSITIVE_INFINITY;
    return limits.window - (limits.output ?? Compaction.answerTokens) - buffer;
  }

  static #charsOf(message: ChatMessage): number {
    const posted = message.usage ? { ...message, usage: undefined } : message;
    const images = message.attachments?.filter(Compaction.#isInlinedImage).length ?? 0;
    if (!images) return JSON.stringify(posted).length;
    const attachments = message.attachments?.map((attachment) =>
      Compaction.#isInlinedImage(attachment) ? { ...attachment, data: "" } : attachment,
    );
    return JSON.stringify({ ...posted, attachments }).length + images * Compaction.imageTokens * 4;
  }

  static #isInlinedImage(attachment: MessageAttachment): boolean {
    // biome-ignore lint/suspicious/noUnnecessaryConditions: a restored or host-built attachment can arrive untyped
    return !!attachment.data && !!attachment.mimeType?.startsWith("image/");
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
   *
   * A previous summary is the exception: carried whole, outside the bound and under its own label. It is the only
   * record of everything compacted before it, so whatever is clipped from it here the next summary loses for good —
   * and it wears the user's role on the wire without being anything the user said.
   */
  static digest(messages: readonly ChatMessage[], budget = 12_000): string {
    const sent = messages.filter((message) => !message.local);
    const previous = sent
      .filter((message) => message.summary)
      .map((message) => `previous summary:\n${message.text ?? ""}`);
    const lines = sent.filter((message) => !message.summary).map((message) => Compaction.#line(message));
    return [...previous, Compaction.#fit(lines, budget)].filter(Boolean).join("\n");
  }

  static #fit(lines: readonly string[], budget: number): string {
    if (lines.reduce((sum, line) => sum + line.length + 1, 0) <= budget) return lines.join("\n");
    // The head holds what the conversation set out to do and the tail where it actually is, so an overlong digest
    // gives way in the middle rather than at either end.
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
    // Named as gone, not merely named: a fold keeps no carrier, and a model shown `[attached photo.png]` alone
    // answers about the picture from its filename.
    for (const attachment of message.attachments ?? [])
      parts.push(`[attached ${attachment.name}, content not carried into this summary]`);
    // Named as gone for the same reason as an attachment, and it matters more: the pointer survives the fold, so
    // a model that needs the value again has a tool and an id to read it with rather than a memory of it.
    for (const reference of message.references ?? [])
      parts.push(
        `[referenced ${reference.refName}/${reference.refId}${reference.path ? `#${reference.path}` : ""}` +
          ` (${reference.label}), value not carried into this summary]`,
      );
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
