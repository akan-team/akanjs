export interface AgentWireToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
}

export interface AgentWireToolResult {
  id: string;
  name: string;
  result?: unknown;
  changes?: unknown[];
  error?: string;
}

/**
 * A file the caller attached to one message. Exactly one carrier reaches the model — `data` as inlined bytes, `url`
 * as something the provider fetches, `text` as content already extracted — and which of them a given provider can
 * read is what `LlmAccepts` answers.
 */
export interface AgentWireAttachment {
  name: string;
  mimeType: string;
  /** Base64, with no `data:` prefix. */
  data?: string;
  url?: string;
  text?: string;
}

/**
 * One transcript message of the in-page agent wire (`use-agentic`'s WIRE.md), typed at both ends independently —
 * the wire is the contract, so the server never imports the client package.
 */
export interface AgentWireMessage {
  role: "user" | "assistant" | "tool";
  text?: string;
  attachments?: AgentWireAttachment[];
  toolCalls?: AgentWireToolCall[];
  toolResults?: AgentWireToolResult[];
  error?: string;
  /**
   * Stands in for the messages the client's own compaction replaced. It arrives with the user's role because the
   * wire has no other, but it is history rather than an ask, so a provider mapping frames it as one.
   */
  summary?: boolean;
}

export interface AgentWireTool {
  name: string;
  description?: string;
  parameters?: Record<string, unknown>;
  needsConfirm?: boolean;
}

export interface AgentWireContext {
  kind: string;
  [key: string]: unknown;
}

export interface LlmTurnRequest {
  messages: AgentWireMessage[];
  tools: AgentWireTool[];
  context: AgentWireContext[];
  instructions?: string;
}

export interface LlmTurnAnswer {
  text?: string;
  toolCalls?: AgentWireToolCall[];
  stop: "end" | "toolUse";
}

/**
 * The provider seam for one stateless agent turn: the whole transcript in, one assistant answer out. The server
 * relays — it never executes a client tool — so this is the only surface a provider integration fills. An
 * implementation is an `adapt()` class in a lib's `srvkit/`.
 *
 * `null` means this provider is not configured, and the caller turns it into the one sentence that says so. A
 * failure the provider explained is logged and **thrown** instead, as an `Err` whose text the chat prints: a
 * refused turn and an unconfigured app are different things to be told, and collapsing both into `null` left a
 * user reading "no model is configured" about a conversation that had merely outgrown the context window.
 */
export interface LlmAdaptor {
  /**
   * `onDelta` opts into streaming: the adapter reports assistant text as it arrives and still resolves the full
   * answer. An adapter may ignore it — the caller treats zero reported deltas as "answered whole".
   */
  chat(request: LlmTurnRequest, onDelta?: (delta: string) => void): Promise<LlmTurnAnswer | null>;
  /** Which attachment carriers this provider's model can read. Omitted means text only. */
  readonly accepts?: LlmAccepts;
}

/**
 * What an adaptor's model reads beyond text. Declared rather than defaulted to true, because the failure of
 * guessing wrong is the worst one available: a provider handed bytes it cannot decode either rejects the whole
 * turn or accepts it having seen nothing, and the model then answers confidently about a file it never read.
 * `AgentService` degrades what is not accepted into a note the model can repeat back, so a text-only provider
 * needs no attachment code at all — which is every provider until somebody swaps one in for vision.
 */
export interface LlmAccepts {
  /** Inlined or linked image bytes. */
  image?: boolean;
  /** Non-image bytes handed over whole — a PDF the model parses itself. */
  document?: boolean;
}

/**
 * Settings for whichever adaptor fills `LlmAdaptorRole`, registered with `option.setLlm(...)` and injected as the
 * `llmOption` use. It belongs to the role rather than to one provider: swapping the default for another `adapt()`
 * class re-reads the same three fields under that provider's own defaults.
 */
export interface LlmOption {
  apiKey?: string;
  model?: string;
  host?: string;
}
