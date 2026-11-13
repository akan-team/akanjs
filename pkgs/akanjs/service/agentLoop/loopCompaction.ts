import type { AgentWireAttachment, AgentWireMessage } from "../predefinedAdaptor/llm.adaptor";
import { LoopTranscript } from "./loopTranscript";

//? A server twin of use-agentic's Compaction; keep the estimate, the cut and the digest in step with it.
export class LoopCompaction {
  static readonly keep = 6;
  //? A provider bills a picture by its pixels after its own downscale (~1,600 tokens on Anthropic), not by its bytes.
  static readonly imageTokens = 1_600;

  static readonly instruction =
    "Summarize the conversation below so you can carry it on with the summary in place of the messages themselves. " +
    "If it opens with a previous summary, carry forward everything in it that still matters: nothing else remembers " +
    "what came before it. " +
    "Keep what the user is trying to do, the decisions taken, the facts and tool results that still matter, and " +
    "anything left unfinished. Drop pleasantries and anything already superseded. Write compact notes, not prose, " +
    "and write nothing but the summary itself.";

  static tokensOf(messages: readonly AgentWireMessage[]): number {
    let chars = 0;
    for (const message of LoopTranscript.seen(messages)) chars += LoopCompaction.#charsOf(message);
    return Math.ceil(chars / 4);
  }

  static #charsOf(message: AgentWireMessage): number {
    const own = LoopCompaction.#blanked(message.attachments);
    let images = own.images;
    const toolResults = message.toolResults?.map((result) => {
      const blanked = LoopCompaction.#blanked(result.attachments);
      images += blanked.images;
      return blanked.images ? { ...result, attachments: blanked.attachments } : result;
    });
    if (!images) return JSON.stringify(message).length;
    return (
      JSON.stringify({ ...message, attachments: own.attachments, toolResults }).length +
      images * LoopCompaction.imageTokens * 4
    );
  }

  static #blanked(attachments: AgentWireAttachment[] | undefined) {
    const images = attachments?.filter(LoopCompaction.#isInlinedImage).length ?? 0;
    if (!images) return { attachments, images };
    return {
      attachments: attachments?.map((attachment) =>
        LoopCompaction.#isInlinedImage(attachment) ? { ...attachment, data: "" } : attachment,
      ),
      images,
    };
  }

  static #isInlinedImage(attachment: AgentWireAttachment): boolean {
    return !!attachment.data && typeof attachment.mimeType === "string" && attachment.mimeType.startsWith("image/");
  }

  //? Prefers a user message; failing one, any non-tool message, so the kept half never opens on an orphaned result.
  static cutAt(messages: readonly AgentWireMessage[], keep: number): number {
    if (!messages.length) return -1;
    if (keep <= 0) return messages.length;
    const target = messages.length - keep;
    if (target <= 0) return -1;
    let boundary = -1;
    for (let at = target; at < messages.length; at += 1) {
      if (messages[at]?.role === "user") return at;
      if (boundary < 0 && messages[at]?.role !== "tool") boundary = at;
    }
    if (boundary >= 0) return boundary;
    for (let at = target - 1; at > 0; at -= 1) if (messages[at]?.role !== "tool") return at;
    return -1;
  }

  //? A previous summary is carried whole: it is the only record of what it replaced, and it is not the user's words.
  static digest(messages: readonly AgentWireMessage[], budget = 12_000): string {
    const previous = messages
      .filter((message) => message.summary)
      .map((message) => `previous summary:\n${message.text ?? ""}`);
    const lines = messages.filter((message) => !message.summary).map((message) => LoopCompaction.#line(message));
    return [...previous, LoopCompaction.#fit(lines, budget)].filter(Boolean).join("\n");
  }

  //? The head holds what the run set out to do and the tail where it is, so an overlong digest gives way in the middle.
  static #fit(lines: readonly string[], budget: number): string {
    if (lines.reduce((sum, line) => sum + line.length + 1, 0) <= budget) return lines.join("\n");
    const head: string[] = [];
    const tail: string[] = [];
    let used = 0;
    let low = 0;
    let high = lines.length - 1;
    let fromHead = true;
    while (low <= high) {
      const line = lines[fromHead ? low : high] ?? "";
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

  static message(summary: string, tainted?: boolean, toolkits: string[] = []): AgentWireMessage {
    return {
      role: "user",
      text: summary,
      summary: true,
      ...(tainted === undefined ? {} : { tainted }),
      ...(toolkits.length ? { toolkits } : {}),
    };
  }

  //? Attachments and references are named as gone: a model shown only a filename answers about the file from it.
  static #line(message: AgentWireMessage): string {
    const parts: string[] = [];
    if (message.text) parts.push(LoopCompaction.#clip(message.text, 1200));
    for (const attachment of message.attachments ?? [])
      parts.push(`[attached ${attachment.name}, content not carried into this summary]`);
    for (const reference of message.references ?? [])
      parts.push(
        `[referenced ${reference.refName}/${reference.refId}${reference.path ? `#${reference.path}` : ""}` +
          ` (${reference.label}), value not carried into this summary]`,
      );
    for (const call of message.toolCalls ?? [])
      parts.push(`[called ${call.name} ${LoopCompaction.#clip(JSON.stringify(call.args), 200)}]`);
    for (const result of message.toolResults ?? []) {
      const body = result.error ?? JSON.stringify(result.result ?? null);
      parts.push(`[${result.error ? "failed" : "result"} ${result.name}: ${LoopCompaction.#clip(body, 400)}]`);
      for (const attachment of result.attachments ?? [])
        parts.push(`[${result.name} returned ${attachment.name}, content not carried into this summary]`);
    }
    if (message.error) parts.push(`[turn failed: ${message.error}]`);
    return `${message.role}: ${parts.join(" ")}`.trimEnd();
  }

  static #clip(text: string, max: number): string {
    return text.length <= max ? text : `${text.slice(0, max)}...`;
  }
}
