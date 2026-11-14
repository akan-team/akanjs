import type { AgentWireAttachment, AgentWireToolResult } from "../predefinedAdaptor/llm.adaptor";

//? A server twin of use-agentic's ToolOutput: one result rides every later round, so it is bounded where it enters.
export class LoopToolOutput {
  static readonly limit = 20_000;
  static readonly attachmentBytes = 4 * 1024 * 1024;

  static clipped(result: AgentWireToolResult): AgentWireToolResult {
    return {
      ...result,
      ...(result.result !== undefined ? { result: LoopToolOutput.within(result.result) } : {}),
      ...(result.changes?.length ? { changes: result.changes.map((change) => LoopToolOutput.#change(change)) } : {}),
      ...(result.error ? { error: LoopToolOutput.#text(result.error) } : {}),
      ...(result.attachments?.length
        ? { attachments: result.attachments.map((attachment) => LoopToolOutput.#attachment(attachment)) }
        : {}),
    };
  }

  //? A picture is billed by its pixels, not its base64 length, so a file meets the per-file ceiling instead.
  static #attachment(attachment: AgentWireAttachment): AgentWireAttachment {
    if (attachment.text) return { ...attachment, text: LoopToolOutput.#text(attachment.text) };
    const bytes = Math.floor(((attachment.data?.length ?? 0) * 3) / 4);
    if (bytes <= LoopToolOutput.attachmentBytes) return attachment;
    return {
      name: attachment.name,
      mimeType: attachment.mimeType,
      text: `[Not attached: ${bytes} bytes, past the ${LoopToolOutput.attachmentBytes}-byte ceiling on one file a tool may return. Tell the user it was too large to look at.]`,
    };
  }

  static #change(change: unknown): unknown {
    if (!change || typeof change !== "object" || !("value" in change) || change.value === undefined) return change;
    return { ...change, value: LoopToolOutput.within(change.value) };
  }

  static within(value: unknown): unknown {
    const json = JSON.stringify(value) ?? "";
    if (json.length <= LoopToolOutput.limit) return value;
    return `${LoopToolOutput.#note(json.length)}\n${json.slice(0, LoopToolOutput.limit)}…`;
  }

  static #text(text: string): string {
    if (text.length <= LoopToolOutput.limit) return text;
    return `${LoopToolOutput.#note(text.length)}\n${text.slice(0, LoopToolOutput.limit)}…`;
  }

  //? Leads the payload: a provider that truncates on its own end still shows the ceiling before the value it cut.
  static #note(chars: number): string {
    return (
      `[Truncated: this value is ${chars} characters (~${Math.ceil(chars / 4)} tokens), past the ` +
      `${LoopToolOutput.limit}-character ceiling one tool result may add to this conversation. The first ` +
      `${LoopToolOutput.limit} characters follow. Read a narrower part of it — one record, one field — rather than ` +
      `asking for the whole value again, and tell the user if you cannot answer from what you can see.]`
    );
  }
}
