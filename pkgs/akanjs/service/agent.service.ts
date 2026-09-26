import { Err } from "akanjs/dictionary";
import type {
  AgentWireAttachment,
  AgentWireMessage,
  AgentWireReference,
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
   * The framework's half of the system prompt, ahead of whatever the app said so the app's text stays the more
   * specific one. Composed here rather than in an adaptor for the reason `explained` is: every adaptor would
   * otherwise have to remember it, and forgetting is silent.
   *
   * The last two sentences are the load-bearing ones, and both were measured against the provider rather than
   * guessed at (8 runs a cell, one screen, tools stubbed):
   *
   * - Batching. One call per turn costs a full model round trip and a resend of the whole transcript per call, and
   *   the turn cap then parks the run on a question halfway through. Asking for it took "approve these eight" from
   *   1.5 turns with three runs in eight that did nothing at all, to one turn in eight runs out of eight.
   * - Not re-reading. A model that has just written something goes back to look at what it did, one read per turn,
   *   which is where a chain of ten calls actually comes from — the change report it was already handed says the
   *   same thing. Saying so took "read the screen, then approve what is pending" from 3.0 turns to 2.0, its floor,
   *   in every run. It is scoped to confirmation on purpose: the read a fresh route needs after `navigate` is
   *   acquisition, and it survived the sentence in every run of that scenario.
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
   * The ceiling one reference's value may add to a turn, mirroring the client's own — the browser clips before it
   * stages, and this is the same answer given again where nothing can route around it. `runTurn` is the only path
   * to `chat()`, so a host that builds the wire itself, an older client, and a replayed transcript all pass here.
   */
  static readonly referenceLimit = 20_000;

  /**
   * Folds what the user pointed at into the message they pointed with, as text.
   *
   * Text rather than a carrier of its own for the same reason the note in `readable` is text: it is the one field
   * every provider mapping already reads, so Anthropic, the OpenAI dialect and DeepSeek need no change between
   * them and none of them can drop a reference quietly.
   *
   * The heading rides once per message rather than once per reference, and lives here rather than in `preamble`
   * because most conversations never carry one — a sentence about mention tokens in every turn of every app is
   * paid by every app that has no references at all.
   */
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

  /**
   * Not decoration, and not free to shorten. Both halves of the sentence were observed doing their job, against
   * Anthropic, with the same referenced field and only the published tools changed:
   *
   * - With no tool on the screen to re-read with, the model opened its answer by saying so — that it could see
   *   only the snapshot and the field might have been edited since. Unprompted, ahead of the answer.
   * - With the screen's own tools passed (a state read and a write), it issued the read instead of answering,
   *   and stopped the turn there.
   *
   * So it reads as an instruction rather than as framing: it re-reads where it can and says it cannot where it
   * cannot, which is the pair a turn confidently quoting a stale value is bought against. Two scenarios against
   * one provider, not the per-cell runs behind `preamble` — enough to keep the sentence, not enough to call it
   * measured.
   */
  static readonly referenceHeading =
    "[Referenced data: the user pointed at this while writing the message above, with the @[label](mention:…) " +
    "tokens in it. Each value is what it was at the moment they sent the message, not what it is now — read it " +
    "again with a tool before relying on it, and do not assume an edit you have made since is reflected here.]";

  /**
   * A string value is printed as itself rather than as JSON. It is the common case — one field of one document —
   * and a quoted, escaped copy of a paragraph is harder for a model to read back and to quote from than the
   * paragraph. It is also what a clipped value already is, so the cut JSON prints as the fragment it is.
   *
   * The pointer leads the line rather than riding the wire alone, and that is what the label cannot do. Pointed
   * at a saved document while a *different* document of the same model sat open on the screen, the model
   * compared the two ids, said the edit it could make would land on the wrong one, and stopped to ask — with no
   * write call. Two references sharing a label are still two ids here, so keep the id ahead of the label.
   */
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

  /**
   * Where a value ends. A multi-line one — the usual shape of the prose field somebody points at — otherwise runs
   * straight into the next reference's heading, and the model reads one value that swallowed the next label.
   *
   * The fence grows past the longest backtick run inside the value, which is CommonMark's own answer to the same
   * problem: a fixed fence is one that a value containing a fence breaks out of, and a value containing a fence is
   * ordinary here, because the thing being pointed at is often something a person wrote.
   */
  private static fenced(text: string): string {
    const runs = text.match(/`+/g);
    const longest = runs ? Math.max(...runs.map((run) => run.length)) : 0;
    const fence = "`".repeat(Math.max(3, longest + 1));
    return `${fence}\n${text}\n${fence}`;
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
    // The host builds this object itself and the type only claims a string, so the value is whatever it put there.
    // Unreadable is the fail-closed answer and costs the model a note naming the file; a deref takes the turn down
    // with a TypeError that names nothing, and every other attachment of the message with it.
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
