import { createHash } from "node:crypto";
import { FailureCode } from "akanjs/common";
import { adapt } from "../adapt";
import { type AnthropicToolMessage, AnthropicTools } from "./anthropicTools";
import {
  type AgentWireAttachment,
  type AgentWireContext,
  type AgentWireMessage,
  type AgentWireProviderContent,
  type AgentWireTool,
  type AgentWireToolResult,
  type LlmAccepts,
  type LlmAdaptor,
  type LlmLimits,
  type LlmOption,
  type LlmTurnAnswer,
  type LlmTurnRequest,
  type LlmUsage,
  llmCallSignal,
  pageContentInstruction,
} from "./llm.adaptor";
import { LlmContext } from "./llmContext";
import { LlmOverflow } from "./llmOverflow";
import { LlmSpend } from "./llmSpend";
import { eachSseData, inBandStatus, isStreamCut, parseToolArgs, toolCallOf } from "./sseData";

type AnthropicSource = { type: "base64"; media_type: string; data: string } | { type: "url"; url: string };
type AnthropicContentBlock =
  | { type: "text"; text: string }
  | { type: "image"; source: AnthropicSource }
  | { type: "document"; source: AnthropicSource };
type AnthropicThinkingBlock =
  | { type: "thinking"; thinking: string; signature: string }
  | { type: "redacted_thinking"; data: string };
type AnthropicBlock =
  | AnthropicContentBlock
  | AnthropicThinkingBlock
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  | { type: "tool_result"; tool_use_id: string; content: string | AnthropicContentBlock[] };
interface AnthropicMessage {
  role: "user" | "assistant";
  content: AnthropicBlock[];
}
type AnthropicTurn = AnthropicMessage | AnthropicToolMessage;
interface AnthropicUsage {
  input_tokens?: number;
  output_tokens?: number;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
}
interface AnthropicAnswerBlock {
  type?: string;
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  thinking?: string;
  signature?: string;
  data?: string;
}
interface AnthropicStopDetails {
  category?: unknown;
  explanation?: unknown;
}
interface AnthropicAnswer {
  content?: AnthropicAnswerBlock[];
  stop_reason?: string;
  stop_details?: AnthropicStopDetails | null;
  usage?: AnthropicUsage;
}
type AnthropicThinkingReplay = "drop" | "strip";
interface AnthropicStreamEvent {
  type?: string;
  error?: { type?: string; message?: string };
  message?: { usage?: AnthropicUsage };
  usage?: AnthropicUsage;
  index?: number;
  content_block?: AnthropicAnswerBlock;
  delta?: {
    type?: string;
    text?: string;
    partial_json?: string;
    thinking?: string;
    signature?: string;
    stop_reason?: string;
    stop_details?: AnthropicStopDetails | null;
  };
}

export type AnthropicRequestBody = ReturnType<typeof AnthropicLlm.requestBody>;

/** A body as `body` hands it on: the retries read `messages` and `tools`, and the API judges the rest. */
export interface AnthropicSentBody {
  messages: readonly { role: string; content: readonly { type: string }[] }[];
  tools?: readonly { defer_loading?: true }[];
  [field: string]: unknown;
}

export interface AnthropicLlmOption extends LlmOption {
  /**
   * Has the last word on each body, after the retries chose its form: a `cache_control` breakpoint, `system` as
   * blocks, an `effort`.
   */
  body?: (body: AnthropicRequestBody, request: LlmTurnRequest) => AnthropicSentBody;
  /** `anthropic-beta` values what `body` adds needs, sent beside the ones a retry adds. */
  betas?: string[];
}

/** Anthropic's Messages API, which reads images and PDFs. `model` is required and has no default. */
export class AnthropicLlm
  extends adapt("akanAnthropicLlm" as const, ({ use }) => ({
    llmOption: use<AnthropicLlmOption>(),
  }))
  implements LlmAdaptor
{
  /** Pinned rather than read from a header the API might move: a revision change is a mapping change, not config. */
  static readonly version = "2023-06-01";
  /** The API refuses a request with no ceiling; a reasoning model may spend all of it thinking, hence `maxTokens`. */
  static readonly defaultMaxTokens = 8192;

  /**
   * Exact, not `image/*`: a phone's `image/heic` would become a block the API refuses, taking the whole turn down on a
   * 400, and no `AttachReader` can refuse an image before it gets here.
   */
  static readonly imageTypes = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);

  static readonly dialect = "anthropic";
  /** The API refuses `thinking.block_binding` without it. */
  static readonly thinkingBindingBeta = "thinking-binding-controls-2026-08-01";

  static readonly #droppedLimit = 500;

  //? Conversations the API refused under its history check: their older blocks stay bound to a history that changed.
  readonly #dropped = new Set<string>();
  readonly #plainTools = new Set<string>();
  #setting = "option.setLlm";

  /**
   * One with settings of its own, beside `option.setLlm`: an app's adaptor sending some turns here under another key
   * keeps the retries, and what they learned about each model and conversation, by keeping the instance.
   */
  static of(option: AnthropicLlmOption): AnthropicLlm {
    const llm = Object.assign(new AnthropicLlm(), { llmOption: option });
    llm.#setting = "AnthropicLlm.of";
    return llm;
  }

  get #host() {
    return this.llmOption.host ?? "https://api.anthropic.com/v1";
  }

  get limits(): LlmLimits {
    const output = this.llmOption.maxTokens ?? AnthropicLlm.defaultMaxTokens;
    return this.llmOption.contextWindow ? { window: this.llmOption.contextWindow, output } : { output };
  }

  get accepts(): LlmAccepts {
    return this.llmOption.accepts ?? { image: true, document: true };
  }

  async chat(
    request: LlmTurnRequest,
    onDelta?: (delta: string) => void,
    signal?: AbortSignal,
  ): Promise<LlmTurnAnswer | null> {
    const model = request.model || this.llmOption.model;
    if (!this.llmOption.apiKey || !model) {
      this.logger.warn(
        `AnthropicLlm needs both apiKey and model — set them with ${this.#setting}(). Agent turns are unavailable.`,
      );
      return null;
    }
    try {
      const { accepts } = this;
      const { maxTokens, body } = this.llmOption;
      const stream = !!onDelta;
      const response = await this.#send(
        model,
        AnthropicLlm.#conversationOf(request.messages),
        (thinking, toolChanges) => {
          const built = AnthropicLlm.requestBody(model, request, { accepts, stream, maxTokens, thinking, toolChanges });
          return body ? body(built, request) : built;
        },
        signal,
      );
      if (!onDelta)
        return {
          ...this.#reported(AnthropicLlm.turnAnswer((await response.json()) as AnthropicAnswer, this.#host)),
          model,
        };
      if (!response.body) throw await AnthropicLlm.refusal(this.#host, response);
      return {
        ...this.#reported(await AnthropicLlm.consumeStream(response.body, onDelta, this.#host, request.tools)),
        model,
      };
    } catch (error) {
      if (!signal?.aborted) LlmOverflow.failed(this.logger, "Anthropic", error);
      throw LlmSpend.attach(error, { model });
    }
  }

  //* An exhausted `max_tokens` can come back with no text and no call; logged so it does not read as a refusal.
  #reported(answer: LlmTurnAnswer): LlmTurnAnswer {
    if (!answer.text && !answer.toolCalls?.length && answer.stop !== "length")
      this.logger.warn(
        `Anthropic answered with no text and no tool call. If this repeats, raise ${this.#setting}({ maxTokens }) — currently ${this.llmOption.maxTokens ?? AnthropicLlm.defaultMaxTokens}.`,
      );
    return answer;
  }

  get #headers() {
    return {
      "content-type": "application/json",
      "x-api-key": this.llmOption.apiKey ?? "",
      "anthropic-version": AnthropicLlm.version,
    };
  }

  //? A thinking block is bound to every turn before it, and a history edited since refuses with a 400 on an account the
  //? API holds to that check (per model, accounts from 2026-08-31); `drop` then has the API drop those blocks, and the
  //? last resort sends none. A model without the tool-change form (Claude Sonnet 5 and older, Microsoft Foundry) refuses
  //? it in words no one pattern matches, so any other 400 is asked again with the shown tools alone, and a model that
  //? then answers is sent them alone from then on.
  async #send(
    model: string,
    conversation: string | null,
    bodyOf: (thinking: AnthropicThinkingReplay | undefined, toolChanges: boolean) => AnthropicSentBody,
    signal?: AbortSignal,
  ): Promise<Response> {
    let thinking: AnthropicThinkingReplay | undefined =
      conversation && this.#dropped.has(conversation) ? "drop" : undefined;
    let toolChanges = !this.#plainTools.has(model);
    let unproven: string | null = null;
    for (;;) {
      const body = bodyOf(thinking, toolChanges);
      const engaged = AnthropicTools.engaged(body);
      const betas = [
        ...new Set([
          ...(thinking === "drop" ? [AnthropicLlm.thinkingBindingBeta] : []),
          ...(engaged ? [AnthropicTools.beta] : []),
          ...(this.llmOption.betas ?? []),
        ]),
      ];
      const response: Response = await fetch(`${this.#host}/messages`, {
        method: "POST",
        headers: betas.length ? { ...this.#headers, "anthropic-beta": betas.join(",") } : this.#headers,
        body: JSON.stringify(body),
        signal: llmCallSignal(signal),
      });
      if (response.ok) {
        if (unproven) this.#sendPlain(model, unproven);
        return response;
      }
      const reason = await AnthropicLlm.reasonOf(response);
      const retry: AnthropicThinkingReplay | null =
        response.status === 400 && (thinking === "drop" || AnthropicLlm.replaysThinking(body.messages))
          ? AnthropicLlm.thinkingRetry(thinking, reason)
          : null;
      if (response.status === 400 && engaged && !(retry && /thinking|block_binding/i.test(reason))) {
        unproven = reason;
        toolChanges = false;
        continue;
      }
      if (!retry) throw LlmOverflow.refusal(this.#host, response.status, reason);
      if (retry === "drop" && conversation) this.#remember(conversation);
      thinking = retry;
    }
  }

  #sendPlain(model: string, reason: string) {
    this.#plainTools.add(model);
    this.logger.warn(
      `Anthropic refused declared tool changes for ${model} (${reason}), so its turns list the shown tools alone.`,
    );
  }

  #remember(conversation: string) {
    this.#dropped.delete(conversation);
    this.#dropped.add(conversation);
    const oldest = this.#dropped.values().next().value;
    if (this.#dropped.size > AnthropicLlm.#droppedLimit && oldest) this.#dropped.delete(oldest);
  }

  //? Its first signed block names a conversation: it stays where it is while the history only grows.
  static #conversationOf(messages: readonly AgentWireMessage[]): string | null {
    for (const message of messages) {
      if (message.providerContent?.dialect !== AnthropicLlm.dialect || !Array.isArray(message.providerContent.content))
        continue;
      for (const block of message.providerContent.content as (AnthropicAnswerBlock | null)[]) {
        const signed =
          block?.type === "thinking" ? block.signature : block?.type === "redacted_thinking" ? block.data : "";
        if (signed) return createHash("sha256").update(signed).digest("hex");
      }
    }
    return null;
  }

  static #bound(reason: string): boolean {
    return /block_binding|different conversation/i.test(reason);
  }

  static thinkingRetry(sent: AnthropicThinkingReplay | undefined, reason: string): AnthropicThinkingReplay | null {
    if (sent === "strip") return null;
    if (!sent && AnthropicLlm.#bound(reason)) return "drop";
    return /thinking|beta/i.test(reason) ? "strip" : null;
  }

  static replaysThinking(messages: readonly { content: readonly { type: string }[] }[]): boolean {
    return messages.some((message) =>
      message.content.some((block) => block.type === "thinking" || block.type === "redacted_thinking"),
    );
  }

  static async refusal(host: string, response: Response): Promise<Error> {
    return LlmOverflow.refusal(host, response.status, await AnthropicLlm.reasonOf(response));
  }

  /** The API answers a refusal as `{ error: { type, message } }`, and the sentence is the half worth printing. */
  static async reasonOf(response: Response): Promise<string> {
    try {
      const body = (await response.json()) as { error?: { message?: unknown } };
      const message = body.error?.message;
      if (typeof message === "string" && message) return message;
    } catch {
      // A body that is not the API's JSON says nothing more than the status line already did.
    }
    return response.statusText || "no reason given";
  }

  /**
   * `thinking: "drop"` needs `thinkingBindingBeta` in the `anthropic-beta` header, and a body that declares tools
   * ahead (`AnthropicTools.engaged`) needs `AnthropicTools.beta`; `toolChanges: false` lists `request.tools` alone.
   */
  static requestBody(
    model: string,
    request: LlmTurnRequest,
    {
      accepts,
      stream,
      maxTokens,
      thinking,
      toolChanges = true,
    }: {
      accepts?: LlmAccepts;
      stream?: boolean;
      maxTokens?: number;
      thinking?: AnthropicThinkingReplay;
      toolChanges?: boolean;
    } = {},
  ) {
    const messages =
      thinking === "strip"
        ? request.messages.map((message) =>
            message.providerContent ? { ...message, providerContent: undefined } : message,
          )
        : request.messages;
    const { tools, turns } = AnthropicLlm.#listing(request, messages, accepts, toolChanges);
    return {
      model,
      max_tokens: maxTokens ?? AnthropicLlm.defaultMaxTokens,
      ...(stream ? { stream: true } : {}),
      ...(thinking === "drop"
        ? { thinking: { type: "adaptive", block_binding: { prefix_mismatch_behavior: "drop_block" } } }
        : {}),
      system: AnthropicLlm.systemPrompt(request),
      messages: turns,
      ...(tools.length ? { tools } : {}),
    };
  }

  //? The tools the conversation's first listed answer saw stay plain, in its order, and the rest deferred by name, so
  //? the declaration reads the same on every round; each answer's own listing is replayed before it as tool changes.
  static #listing(
    request: LlmTurnRequest,
    messages: AgentWireMessage[],
    accepts: LlmAccepts | undefined,
    toolChanges: boolean,
  ) {
    const plain = () => ({
      tools: request.tools.map((tool) => AnthropicTools.definition(tool)),
      turns: AnthropicLlm.contextual(
        AnthropicLlm.providerMessages(messages, accepts),
        request.context,
      ) as AnthropicTurn[],
    });
    if (!toolChanges || (!request.deferred?.length && !messages.some((message) => message.listed))) return plain();
    const declared = AnthropicTools.declared(request);
    const shown = request.tools.map((tool) => tool.name);
    const names = new Set(declared.map((tool) => tool.name));
    const { turns, base, announced } = AnthropicLlm.#turns(messages, accepts, names);
    const first = base ?? shown;
    if (!declared.some((tool) => first.includes(tool.name))) return plain();
    const rank = (name: string) => {
      const at = first.indexOf(name);
      return at < 0 ? first.length : at;
    };
    const ordered = [...declared].sort(
      (a, b) => rank(a.name) - rank(b.name) || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0),
    );
    const sent = AnthropicLlm.contextual(turns as AnthropicMessage[], request.context) as AnthropicTurn[];
    if (announced) AnthropicLlm.#announce(sent, announced, new Set(shown), names);
    return { tools: ordered.map((tool) => AnthropicTools.definition(tool, !first.includes(tool.name))), turns: sent };
  }

  //? Placed only after a user turn, which the API requires of a system message, so a change that has no place before
  //? one answer is announced before the next.
  static #announce(
    turns: AnthropicTurn[],
    from: ReadonlySet<string>,
    to: ReadonlySet<string>,
    declared: ReadonlySet<string>,
  ): ReadonlySet<string> {
    const changes = AnthropicTools.changes(from, to, declared);
    if (!changes.length) return to;
    const last = turns.at(-1);
    if (last?.role === "system") last.content.push(...changes);
    else if (last?.role === "user") turns.push({ role: "system", content: changes });
    else return from;
    return to;
  }

  //? Security: developer text only. A turn's context is data, and rides the last user turn inside a fence.
  static systemPrompt({ instructions }: Pick<LlmTurnRequest, "instructions">): string {
    return (
      instructions ??
      `You are an in-page assistant. Use the published tools to read and drive the screen the user is looking at. ${pageContentInstruction}`
    );
  }

  //? After every other block of the last user turn: the API takes text only after that turn's tool results, and what
  //? changes each turn belongs behind everything a prefix cache can keep.
  static contextual(messages: AnthropicMessage[], context: AgentWireContext[]): AnthropicMessage[] {
    const text = LlmContext.of(context);
    if (!text) return messages;
    const block = { type: "text" as const, text };
    const last = messages[messages.length - 1];
    if (last?.role !== "user") return [...messages, { role: "user", content: [block] }];
    return [...messages.slice(0, -1), { role: "user", content: [...last.content, block] }];
  }

  /** The API takes strictly alternating roles, so tool results and the user's next ask merge into one user turn. */
  static providerMessages(messages: AgentWireMessage[], accepts?: LlmAccepts): AnthropicMessage[] {
    return AnthropicLlm.#turns(messages, accepts, null).turns as AnthropicMessage[];
  }

  static #turns(messages: AgentWireMessage[], accepts: LlmAccepts | undefined, declared: ReadonlySet<string> | null) {
    const merged: AnthropicTurn[] = [];
    let base: string[] | null = null;
    let announced: ReadonlySet<string> | null = null;
    for (const message of messages) {
      const mapped = AnthropicLlm.providerMessage(message, accepts);
      if (!mapped.content.length) continue;
      if (declared && mapped.role === "assistant" && message.listed) {
        const now = new Set(message.listed);
        if (!announced) base = [...message.listed];
        announced = announced ? AnthropicLlm.#announce(merged, announced, now, declared) : now;
      }
      const last = merged.at(-1);
      if (last && last.role !== "system" && last.role === mapped.role) last.content.push(...mapped.content);
      else merged.push(mapped);
    }
    // The API refuses a conversation opening on the assistant, and reads one ending there as a prefill to continue.
    if (merged[0]?.role === "assistant") merged.shift();
    if (merged.at(-1)?.role === "assistant") merged.pop();
    return { turns: merged, base, announced };
  }

  static providerMessage(message: AgentWireMessage, accepts?: LlmAccepts): AnthropicMessage {
    //? Security: a compaction summary is model-written text over earlier tool results, so it rides a user turn
    //? fenced as history, as on the other dialect.
    if (message.summary)
      return { role: "user", content: [{ type: "text", text: LlmContext.summary(message.text ?? "") }] };
    // A tool result is a user turn here, not a role of its own.
    if (message.role === "tool")
      return {
        role: "user",
        content: (message.toolResults ?? []).map((result) => AnthropicLlm.toolResult(result, accepts)),
      };
    if (message.role === "assistant")
      return {
        role: "assistant",
        content: AnthropicLlm.replayed(message) ?? [
          ...(message.text ? [{ type: "text" as const, text: message.text }] : []),
          ...(message.toolCalls ?? []).map((call) => ({
            type: "tool_use" as const,
            id: call.id,
            name: call.name,
            input: call.args,
          })),
        ],
      };
    return { role: "user", content: AnthropicLlm.userContent(message, accepts) };
  }

  //? A call is rebuilt from `toolCalls`, which carry this turn's tool names; the stored block keeps only its id.
  static replayed(message: AgentWireMessage): AnthropicBlock[] | null {
    const own = message.providerContent;
    if (own?.dialect !== AnthropicLlm.dialect || !Array.isArray(own.content)) return null;
    const calls = new Map((message.toolCalls ?? []).map((call) => [call.id, call]));
    const blocks: AnthropicBlock[] = [];
    let text = "";
    for (const block of own.content as (AnthropicAnswerBlock | null)[]) {
      const call = block?.type === "tool_use" && block.id ? calls.get(block.id) : undefined;
      if (block?.type === "thinking" && typeof block.thinking === "string" && typeof block.signature === "string")
        blocks.push({ type: "thinking", thinking: block.thinking, signature: block.signature });
      else if (block?.type === "redacted_thinking" && typeof block.data === "string")
        blocks.push({ type: "redacted_thinking", data: block.data });
      else if (block?.type === "text" && typeof block.text === "string" && block.text) {
        text += block.text;
        blocks.push({ type: "text", text: block.text });
      } else if (call) {
        calls.delete(call.id);
        blocks.push({ type: "tool_use", id: call.id, name: call.name, input: call.args });
      } else return null;
    }
    //? Security: only the message's own text and calls are sent, so content a store edited cannot add to them.
    return calls.size || text !== (message.text ?? "") ? null : blocks;
  }

  //? An unsigned block is one the stream cut, and the API refuses it.
  static providerContentOf(blocks: AnthropicAnswerBlock[]): AgentWireProviderContent | undefined {
    if (!blocks.some((block) => block.type === "thinking" || block.type === "redacted_thinking")) return undefined;
    const content: unknown[] = [];
    for (const block of blocks) {
      if (block.type === "thinking") {
        if (!block.signature) return undefined;
        content.push({ type: "thinking", thinking: block.thinking ?? "", signature: block.signature });
      } else if (block.type === "redacted_thinking") {
        if (!block.data) return undefined;
        content.push({ type: "redacted_thinking", data: block.data });
      } else if (block.type === "text" && block.text) content.push({ type: "text", text: block.text });
      else if (block.type === "tool_use" && block.id) content.push({ type: "tool_use", id: block.id });
    }
    return { dialect: AnthropicLlm.dialect, content };
  }

  static userContent(message: AgentWireMessage, accepts?: LlmAccepts): AnthropicBlock[] {
    const notes: string[] = [];
    const blocks = AnthropicLlm.attachmentBlocks(message.attachments ?? [], accepts, notes);
    const text = [message.text, ...notes].filter(Boolean).join("\n\n");
    return [...(text ? [{ type: "text" as const, text }] : []), ...blocks];
  }

  /** A string while the call returned no file, so a transcript without one posts what it always did. */
  static toolResult(result: AgentWireToolResult, accepts?: LlmAccepts): AnthropicBlock {
    const payload = JSON.stringify({
      ...(result.result !== undefined ? { result: result.result } : {}),
      ...(result.changes?.length ? { changes: result.changes } : {}),
      ...(result.error ? { error: result.error } : {}),
      ...(result.error && FailureCode.is(result.code) ? { code: result.code } : {}),
    });
    if (!result.attachments?.length) return { type: "tool_result", tool_use_id: result.id, content: payload };
    const notes: string[] = [];
    const blocks = AnthropicLlm.attachmentBlocks(result.attachments, accepts, notes);
    return {
      type: "tool_result",
      tool_use_id: result.id,
      content: [{ type: "text", text: [payload, ...notes].join("\n\n") }, ...blocks],
    };
  }

  /** Pushes a note for each file no block can carry, for the caller to fold into the text beside them. */
  static attachmentBlocks(
    attachments: AgentWireAttachment[],
    accepts: LlmAccepts | undefined,
    notes: string[],
  ): AnthropicContentBlock[] {
    return attachments.flatMap((attachment): AnthropicContentBlock[] => {
      if (attachment.text)
        return [
          {
            type: "text",
            // Labelled because a model handed two unlabelled documents can no longer cite either one.
            text: `--- attachment: ${attachment.name} (${attachment.mimeType}) ---\n${attachment.text}`,
          },
        ];
      const source = AnthropicLlm.sourceOf(attachment);
      if (!source) return [];
      // A media type may carry parameters (`image/jpeg; charset=…`), and a block matches on the essence alone.
      const mimeType = attachment.mimeType.split(";")[0].trim().toLowerCase();
      if (accepts?.image && AnthropicLlm.imageTypes.has(mimeType))
        return [{ type: "image", source: AnthropicLlm.typed(source, mimeType) }];
      // `document` is the PDF block only; `accepts.document` covers every non-image type, so the rest become notes.
      if (accepts?.document && mimeType === "application/pdf")
        return [{ type: "document", source: AnthropicLlm.typed(source, mimeType) }];
      notes.push(`[Attachment not read: ${attachment.name} (${attachment.mimeType}) — this API has no block for it.]`);
      return [];
    });
  }

  static typed(source: AnthropicSource, mimeType: string): AnthropicSource {
    return source.type === "base64" ? { ...source, media_type: mimeType } : source;
  }

  /** Bytes beat a URL: the default storage serves a path only the app can resolve, so the provider cannot fetch it. */
  static sourceOf(attachment: AgentWireAttachment): AnthropicSource | null {
    if (attachment.data) return { type: "base64", media_type: attachment.mimeType, data: attachment.data };
    if (attachment.url) return { type: "url", url: attachment.url };
    return null;
  }

  //? Anthropic declines with a 200 and `stop_reason: "refusal"`, and any output before it is to be discarded.
  static turnAnswer(answer: AnthropicAnswer, host = "The model provider"): LlmTurnAnswer {
    if (answer.stop_reason === "refusal") {
      const declined = LlmOverflow.declined(host, answer.stop_details?.category, answer.stop_details?.explanation);
      throw answer.usage ? LlmSpend.attach(declined, { usage: AnthropicLlm.usageOf(answer.usage) }) : declined;
    }
    const providerContent = AnthropicLlm.providerContentOf(answer.content ?? []);
    const text = (answer.content ?? [])
      .flatMap((block) => (block.type === "text" && block.text ? [block.text] : []))
      .join("");
    const toolCalls = (answer.content ?? []).flatMap((block) =>
      block.type === "tool_use" && block.id && block.name
        ? [{ id: block.id, name: block.name, args: block.input ?? {} }]
        : [],
    );
    return {
      ...(text ? { text } : {}),
      ...(toolCalls.length ? { toolCalls } : {}),
      stop: AnthropicLlm.stopOf(answer.stop_reason, toolCalls.length),
      ...(answer.usage ? { usage: AnthropicLlm.usageOf(answer.usage) } : {}),
      ...(providerContent ? { providerContent } : {}),
    };
  }

  //* Anthropic's `input_tokens` leaves out what was read from or written to the cache; both are prompt, so both count.
  static usageOf(usage: AnthropicUsage): LlmUsage {
    const cachedTokens = usage.cache_read_input_tokens ?? 0;
    const cacheWriteTokens = usage.cache_creation_input_tokens ?? 0;
    return {
      inputTokens: (usage.input_tokens ?? 0) + cachedTokens + cacheWriteTokens,
      outputTokens: usage.output_tokens ?? 0,
      cachedTokens,
      cacheWriteTokens,
    };
  }

  static stopOf(reason: string | null | undefined, calls: number): LlmTurnAnswer["stop"] {
    if (reason === "max_tokens") return "length";
    return reason === "tool_use" || calls ? "toolUse" : "end";
  }

  //* Named SSE events: a block opens with `content_block_start`; a tool call (id, name) then streams `input_json_delta`
  //* fragments, and a thinking block `thinking_delta`s and one `signature_delta`.
  static async consumeStream(
    body: ReadableStream<Uint8Array>,
    onDelta: (delta: string) => void,
    host = "The model provider",
    tools: AgentWireTool[] = [],
  ): Promise<LlmTurnAnswer> {
    const calls = new Map<number, { id?: string; name?: string; args: string }>();
    const blocks = new Map<number, AnthropicAnswerBlock>();
    let text = "";
    let stopReason: string | null = null;
    let stopped = false;
    let failure: Error | null = null;
    let usage: AnthropicUsage = {};
    let finalCount = false;
    const read = eachSseData(body, (payload) => {
      const event = JSON.parse(payload) as AnthropicStreamEvent;
      if (event.type === "error")
        failure = LlmOverflow.refusal(
          host,
          inBandStatus(event.error?.type),
          event.error?.message || event.error?.type || "no reason given",
        );
      if (event.type === "message_stop") stopped = true;
      const index = event.index ?? 0;
      if (event.type === "content_block_start" && event.content_block) blocks.set(index, { ...event.content_block });
      if (event.type === "content_block_start" && event.content_block?.type === "tool_use")
        calls.set(index, { id: event.content_block.id, name: event.content_block.name, args: "" });
      if (event.type === "content_block_delta") {
        const block = blocks.get(index);
        if (block && event.delta?.type === "thinking_delta")
          block.thinking = (block.thinking ?? "") + (event.delta.thinking ?? "");
        if (block && event.delta?.type === "signature_delta")
          block.signature = (block.signature ?? "") + (event.delta.signature ?? "");
        if (event.delta?.type === "text_delta" && event.delta.text) {
          text += event.delta.text;
          if (block) block.text = (block.text ?? "") + event.delta.text;
          onDelta(event.delta.text);
        }
        if (event.delta?.type === "input_json_delta" && event.delta.partial_json) {
          const call = calls.get(index) ?? { args: "" };
          call.args += event.delta.partial_json;
          calls.set(index, call);
        }
      }
      if (event.type === "message_delta" && event.delta?.stop_reason) stopReason = event.delta.stop_reason;
      if (event.type === "message_delta" && event.delta?.stop_reason === "refusal")
        failure = LlmOverflow.declined(host, event.delta.stop_details?.category, event.delta.stop_details?.explanation);
      //* `message_start` carries the prompt side and `message_delta` the running output count.
      if (event.type === "message_start" && event.message?.usage) usage = { ...usage, ...event.message.usage };
      if (event.type === "message_delta" && event.usage) {
        usage = { ...usage, ...event.usage };
        finalCount = true;
      }
    });
    //? Thrown here, as `eachSseData` swallows a throw from its callback: an `error` event arrives on a 200 response.
    const failed = read.then(() => {
      if (failure) throw failure;
    });
    await failed.catch((error: unknown) => {
      const partial = Object.keys(usage).length ? AnthropicLlm.usageOf(usage) : undefined;
      const streamed = text + [...calls.values()].map(({ args }) => args).join("");
      throw LlmSpend.attach(
        error,
        partial && finalCount ? { usage: partial } : LlmSpend.estimate(partial, { streamed }),
      );
    });
    const toolCalls = [...calls.entries()]
      .sort(([a], [b]) => a - b)
      .flatMap(([, call]) => (call.id && call.name ? [toolCallOf(call.id, call.name, call.args)] : []));
    const providerContent = AnthropicLlm.providerContentOf(
      [...blocks.entries()].sort(([a], [b]) => a - b).map(([, block]) => block),
    );
    return {
      ...(text ? { text } : {}),
      ...(toolCalls.length ? { toolCalls } : {}),
      stop: isStreamCut(
        calls.values(),
        {
          ended: stopReason !== null || stopped,
          finished: stopReason !== null,
          byModel: stopReason === "tool_use" || stopReason === "end_turn",
        },
        tools,
      )
        ? "length"
        : AnthropicLlm.stopOf(stopReason, toolCalls.length),
      ...(Object.keys(usage).length ? { usage: AnthropicLlm.usageOf(usage) } : {}),
      ...(providerContent ? { providerContent } : {}),
    };
  }

  /** A tool called with no arguments streams no fragment at all, so an empty string is an empty object. */
  static parsedArgs(raw: string): Record<string, unknown> {
    return parseToolArgs(raw) ?? {};
  }
}
