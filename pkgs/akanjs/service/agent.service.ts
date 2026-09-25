import { Err } from "akanjs/dictionary";
import type {
  AgentWireAttachment,
  AgentWireMessage,
  LlmAccepts,
  LlmTurnRequest,
} from "./predefinedAdaptor/llm.adaptor";
import { LlmAdaptorRole } from "./predefinedAdaptor/role.adaptor";
import { serve } from "./serve";
import { ToolNames } from "./toolNames";

export class AgentService extends serve("agent" as const, ({ plug }) => ({
  llm: plug(LlmAdaptorRole),
})) {
  async runTurn(request: LlmTurnRequest, onDelta?: (delta: string) => void) {
    // A zone's tools are scope-prefixed with a `.`, which no provider's function schema accepts — renamed on the
    // way out and read back on the way in, so the browser is answered with the name its surface registered.
    const names = ToolNames.of(request);
    const prepared = names.encode(AgentService.readable(AgentService.explained(request), this.llm.accepts));
    const answer = await this.llm.chat(prepared, onDelta);
    if (!answer) throw new Err("agent.error.llmUnavailable");
    return { text: answer.text ?? "", toolCalls: names.decode(answer.toolCalls ?? []), stop: answer.stop };
  }

  /**
   * Folds a failed turn into the message text. `error` is a field only this wire has, so a provider mapping reads
   * `text` and drops it — leaving the model an assistant turn that says nothing, with no hint that the attempt
   * failed, and every reason to make the same one again. Done here rather than per adaptor because every adaptor
   * would otherwise have to remember, and forgetting is silent.
   */
  static explained(request: LlmTurnRequest): LlmTurnRequest {
    if (!request.messages.some((message) => message.error)) return request;
    return { ...request, messages: request.messages.map((message) => AgentService.explainedMessage(message)) };
  }

  private static explainedMessage(message: AgentWireMessage): AgentWireMessage {
    const { error, ...rest } = message;
    if (!error) return message;
    return { ...rest, text: [message.text, `[The turn failed: ${error}]`].filter(Boolean).join("\n\n") };
  }

  /**
   * Replaces every attachment the provider cannot read with a note naming it, so no adaptor has to think about
   * attachments it does not support and none can lose one quietly. The model has to be *told*, not merely spared:
   * a file that vanishes on the way in is one it answers about from the filename, confidently and wrongly.
   *
   * The note rides in the message text because that is the one field every provider mapping already reads.
   */
  static readable(request: LlmTurnRequest, accepts: LlmAccepts | undefined): LlmTurnRequest {
    if (!request.messages.some((message) => message.attachments?.length)) return request;
    const messages = request.messages.map((message) => AgentService.readableMessage(message, accepts ?? {}));
    return { ...request, messages };
  }

  private static readableMessage(message: AgentWireMessage, accepts: LlmAccepts): AgentWireMessage {
    const { attachments = [], ...rest } = message;
    if (!attachments.length) return message;
    const kept = attachments.filter((attachment) => AgentService.isReadable(attachment, accepts));
    if (kept.length === attachments.length) return message;
    const notes = attachments.filter((attachment) => !kept.includes(attachment)).map(AgentService.note);
    return {
      ...rest,
      ...(kept.length ? { attachments: kept } : {}),
      text: [message.text, ...notes].filter(Boolean).join("\n\n"),
    };
  }

  /** Extracted text is readable by every model there is; bytes and links need the provider to say so. */
  private static isReadable(attachment: AgentWireAttachment, accepts: LlmAccepts): boolean {
    if (attachment.text) return true;
    if (!attachment.data && !attachment.url) return false;
    return attachment.mimeType.startsWith("image/") ? !!accepts.image : !!accepts.document;
  }

  private static note(attachment: AgentWireAttachment): string {
    const why =
      attachment.data || attachment.url
        ? "this model cannot read that type"
        : "its content is no longer available, as a reloaded conversation keeps the name and not the bytes";
    return `[Attachment not read: ${attachment.name} (${attachment.mimeType}) — ${why}. Tell the user it was not read instead of guessing what it holds, and ask for the text if the answer needs it.]`;
  }
}
