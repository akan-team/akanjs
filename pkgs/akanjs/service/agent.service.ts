import { Err } from "akanjs/dictionary";
import type {
  AgentWireAttachment,
  AgentWireMessage,
  AgentWireReference,
  AgentWireToolResult,
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
    const names = ToolNames.of(request);
    const prepared = names.encode(
      AgentService.instructed(
        AgentService.readable(AgentService.referenced(AgentService.explained(request)), this.llm.accepts),
      ),
    );
    const answer = await this.llm.chat(prepared, onDelta);
    if (!answer) throw new Err("agent.error.llmUnavailable");
    return {
      text: answer.text ?? "",
      toolCalls: names.decode(answer.toolCalls ?? []),
      stop: answer.stop,
      ...(answer.usage ? { usage: answer.usage } : {}),
      ...(answer.model ? { model: answer.model } : {}),
      ...(this.llm.limits ? { limits: this.llm.limits } : {}),
    };
  }

  /**
   * Prepended to the app's instructions here, not per adaptor, where forgetting it would be silent. The batching and
   * no-re-read sentences were measured to cut turns against a provider; do not shorten them.
   */
  static readonly preamble = [
    "You are an in-page assistant. Use the published tools to read and drive the screen the user is looking at.",
    "Issue every tool call that does not need another call's result in the same turn, rather than one call per turn.",
    "Prefer the tool that does the whole job in one call, such as a form's fill tool over one call per field.",
    "A tool result already reports what it changed, so never call a read afterwards to confirm work you have just done — answer the user from the results you already have.",
  ].join(" ");

  static instructed(request: LlmTurnRequest): LlmTurnRequest {
    return { ...request, instructions: [AgentService.preamble, request.instructions].filter(Boolean).join("\n\n") };
  }

  /** Provider mappings read `text` and drop `error`, so a failed turn is folded into its text or retried blind. */
  static explained(request: LlmTurnRequest): LlmTurnRequest {
    if (!request.messages.some((message) => message.error)) return request;
    return { ...request, messages: request.messages.map((message) => AgentService.explainedMessage(message)) };
  }

  private static explainedMessage(message: AgentWireMessage): AgentWireMessage {
    const { error, ...rest } = message;
    if (!error) return message;
    return { ...rest, text: [message.text, `[The turn failed: ${error}]`].filter(Boolean).join("\n\n") };
  }

  /** Mirrors the client's clip where nothing routes around it: a hand-built wire or an older client passes here too. */
  static readonly referenceLimit = 20_000;

  /** As text, the one field every provider mapping reads; the heading stays out of `preamble`: most turns lack one. */
  static referenced(request: LlmTurnRequest): LlmTurnRequest {
    if (!request.messages.some((message) => message.references?.length)) return request;
    return { ...request, messages: request.messages.map((message) => AgentService.referencedMessage(message)) };
  }

  private static referencedMessage(message: AgentWireMessage): AgentWireMessage {
    const { references = [], ...rest } = message;
    if (!references.length) return message;
    const block = [AgentService.referenceHeading, ...references.map(AgentService.referenceLine)].join("\n\n");
    return { ...rest, text: [message.text, block].filter(Boolean).join("\n\n") };
  }

  /** Not free to shorten: both halves were observed working — a re-read with a tool, else a caveat. */
  static readonly referenceHeading =
    "[Referenced data: the user pointed at this while writing the message above, with the @[label](mention:…) " +
    "tokens in it. Each value is what it was at the moment they sent the message, not what it is now — read it " +
    "again with a tool before relying on it, and do not assume an edit you have made since is reflected here.]";

  //* A string prints as itself, not escaped JSON; keep the id ahead of the label — two references may share a label.
  private static referenceLine(reference: AgentWireReference): string {
    const at = `${reference.refName}/${reference.refId}${reference.path ? `#${reference.path}` : ""}`;
    const head = `${at} (${reference.label}):`;
    if (reference.value === undefined)
      return `${head} [not read: ${reference.note ?? "the value was not carried into this conversation"}]`;
    const text =
      typeof reference.value === "string" ? reference.value : (JSON.stringify(reference.value, null, 2) ?? "null");
    const body =
      text.length <= AgentService.referenceLimit
        ? text
        : `${text.slice(0, AgentService.referenceLimit)}…\n[Clipped at ${AgentService.referenceLimit} characters.]`;
    return `${head}\n${AgentService.fenced(body)}${reference.note ? `\n[${reference.note}]` : ""}`;
  }

  //* The fence outgrows the longest backtick run inside (CommonMark's rule), so a value cannot escape it.
  private static fenced(text: string): string {
    const runs = text.match(/`+/g);
    const longest = runs ? Math.max(...runs.map((run) => run.length)) : 0;
    const fence = "`".repeat(Math.max(3, longest + 1));
    return `${fence}\n${text}\n${fence}`;
  }

  /** Swaps an attachment the provider cannot read for a note; dropped silently, it is guessed at from its name. */
  static readable(request: LlmTurnRequest, accepts: LlmAccepts | undefined): LlmTurnRequest {
    if (!request.messages.some(AgentService.carriesFiles)) return request;
    const messages = request.messages.map((message) => AgentService.readableMessage(message, accepts ?? {}));
    return { ...request, messages };
  }

  private static carriesFiles(message: AgentWireMessage): boolean {
    return !!message.attachments?.length || !!message.toolResults?.some((result) => result.attachments?.length);
  }

  private static readableMessage(message: AgentWireMessage, accepts: LlmAccepts): AgentWireMessage {
    if (message.role === "tool")
      return {
        ...message,
        toolResults: (message.toolResults ?? []).map((result) => AgentService.readableResult(result, accepts)),
      };
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

  //* A tool message has no text a provider mapping reads, so the note stands where the file stood, as a `text` one.
  private static readableResult(result: AgentWireToolResult, accepts: LlmAccepts): AgentWireToolResult {
    if (!result.attachments?.length) return result;
    const attachments = result.attachments.map((attachment) =>
      AgentService.isReadable(attachment, accepts)
        ? attachment
        : { name: attachment.name, mimeType: attachment.mimeType, text: AgentService.note(attachment) },
    );
    return { ...result, attachments };
  }

  private static isReadable(attachment: AgentWireAttachment, accepts: LlmAccepts): boolean {
    if (attachment.text) return true;
    if (!attachment.data && !attachment.url) return false;
    // The host builds this object and the type only claims a string: fail closed rather than let a deref sink the turn.
    if (typeof attachment.mimeType !== "string") return false;
    return attachment.mimeType.startsWith("image/") ? !!accepts.image : !!accepts.document;
  }

  private static note(attachment: AgentWireAttachment): string {
    const why =
      !attachment.data && !attachment.url
        ? "its content is no longer available, as a reloaded conversation keeps the name and not the bytes"
        : typeof attachment.mimeType === "string"
          ? "this model cannot read that type"
          : "it names no type it could be read as";
    return `[Attachment not read: ${attachment.name} (${attachment.mimeType}) — ${why}. Tell the user it was not read instead of guessing what it holds, and ask for the text if the answer needs it.]`;
  }
}
