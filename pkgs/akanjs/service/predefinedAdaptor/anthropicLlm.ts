import { FailureCode } from "akanjs/common";
import { adapt } from "../adapt";
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

/** Anthropic's Messages API, which reads images and PDFs. `model` is required and has no default. */
export class AnthropicLlm
  extends adapt("akanAnthropicLlm" as const, ({ use }) => ({
    llmOption: use<LlmOption>(),
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

  readonly #historyChecked = new Set<string>();

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
        "AnthropicLlm needs both apiKey and model — set them with option.setLlm(). Agent turns are unavailable.",
      );
      return null;
    }
    try {
      const { accepts } = this;
      const maxTokens = this.llmOption.maxTokens;
      const stream = !!onDelta;
      const response = await this.#send(
        model,
        (thinking) => AnthropicLlm.requestBody(model, request, { accepts, stream, maxTokens, thinking }),
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
      if (!signal?.aborted)
        this.logger.error(`Anthropic turn failed: ${error instanceof Error ? error.message : String(error)}`);
      throw LlmSpend.attach(error, { model });
    }
  }

  //* An exhausted `max_tokens` can come back with no text and no call; logged so it does not read as a refusal.
  #reported(answer: LlmTurnAnswer): LlmTurnAnswer {
    if (!answer.text && !answer.toolCalls?.length && answer.stop !== "length")
      this.logger.warn(
        `Anthropic answered with no text and no tool call. If this repeats, raise option.setLlm({ maxTokens }) — currently ${this.llmOption.maxTokens ?? AnthropicLlm.defaultMaxTokens}.`,
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

  //? A thinking block is bound to every turn before it, and those change: a turn's context rides only the newest user
  //? turn, and the tools can change. An account the API holds to that check (per model, accounts from 2026-08-31)
  //? refuses with a 400; `drop` then has the API drop those blocks, and the last resort sends none.
  async #send(
    model: string,
    bodyOf: (thinking?: AnthropicThinkingReplay) => { messages: AnthropicMessage[] },
    signal?: AbortSignal,
  ): Promise<Response> {
    let thinking: AnthropicThinkingReplay | undefined = this.#historyChecked.has(model) ? "drop" : undefined;
    for (;;) {
      const body = bodyOf(thinking);
      const response: Response = await fetch(`${this.#host}/messages`, {
        method: "POST",
        headers:
          thinking === "drop"
            ? { ...this.#headers, "anthropic-beta": AnthropicLlm.thinkingBindingBeta }
            : this.#headers,
        body: JSON.stringify(body),
        signal: llmCallSignal(signal),
      });
      if (response.ok) return response;
      const reason = await AnthropicLlm.reasonOf(response);
      const retry: AnthropicThinkingReplay | null =
        response.status === 400 && (thinking === "drop" || AnthropicLlm.replaysThinking(body.messages))
          ? AnthropicLlm.thinkingRetry(thinking, reason)
          : null;
      if (!retry) throw LlmOverflow.refusal(this.#host, response.status, reason);
      if (retry === "drop") this.#historyChecked.add(model);
      thinking = retry;
    }
  }

  static thinkingRetry(sent: AnthropicThinkingReplay | undefined, reason: string): AnthropicThinkingReplay | null {
    if (sent === "strip") return null;
    if (!sent && /block_binding|different conversation/i.test(reason)) return "drop";
    return /thinking|beta/i.test(reason) ? "strip" : null;
  }

  static replaysThinking(messages: AnthropicMessage[]): boolean {
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

  /** `thinking: "drop"` needs `thinkingBindingBeta` in the `anthropic-beta` header. */
  static requestBody(
    model: string,
    request: LlmTurnRequest,
    {
      accepts,
      stream,
      maxTokens,
      thinking,
    }: { accepts?: LlmAccepts; stream?: boolean; maxTokens?: number; thinking?: AnthropicThinkingReplay } = {},
  ) {
    const messages =
      thinking === "strip"
        ? request.messages.map((message) =>
            message.providerContent ? { ...message, providerContent: undefined } : message,
          )
        : request.messages;
    return {
      model,
      max_tokens: maxTokens ?? AnthropicLlm.defaultMaxTokens,
      ...(stream ? { stream: true } : {}),
      ...(thinking === "drop"
        ? { thinking: { type: "adaptive", block_binding: { prefix_mismatch_behavior: "drop_block" } } }
        : {}),
      system: AnthropicLlm.systemPrompt(request),
      messages: AnthropicLlm.contextual(AnthropicLlm.providerMessages(messages, accepts), request.context),
      ...(request.tools.length
        ? {
            tools: request.tools.map((tool) => ({
              name: tool.name,
              ...(tool.description ? { description: tool.description } : {}),
              // The API rejects a tool without an input schema; a no-argument tool sends an empty object one.
              input_schema: tool.parameters ?? { type: "object", properties: {} },
            })),
          }
        : {}),
    };
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
    const merged: AnthropicMessage[] = [];
    for (const message of messages) {
      const mapped = AnthropicLlm.providerMessage(message, accepts);
      if (!mapped.content.length) continue;
      const last = merged[merged.length - 1];
      if (last?.role === mapped.role) last.content.push(...mapped.content);
      else merged.push(mapped);
    }
    // The API refuses a conversation opening on the assistant, and reads one ending there as a prefill to continue.
    if (merged[0]?.role === "assistant") merged.shift();
    if (merged[merged.length - 1]?.role === "assistant") merged.pop();
    return merged;
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
