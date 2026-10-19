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
  /** Files the call handed the model, as content beside the JSON; one this model cannot read arrives as a `text` note. */
  attachments?: AgentWireAttachment[];
}

/** Exactly one carrier reaches the model: `data` (inlined bytes), `url` (fetched by the provider) or `text`. */
export interface AgentWireAttachment {
  name: string;
  mimeType: string;
  /** Base64, with no `data:` prefix. */
  data?: string;
  url?: string;
  text?: string;
  /** The host's own handle on this file, for a relay; a provider mapping ignores it. */
  ref?: string;
}

/**
 * `value` is a send-time snapshot the host already masked — the server has no model class to mask it with — and
 * `refName`/`refId`/`path` lead back to the current value.
 */
export interface AgentWireReference {
  refName: string;
  refId: string;
  label: string;
  path?: string;
  value?: unknown;
  /** Read by the model in place of a value there is none of — clipped, unreadable, or gone from a restored chat. */
  note?: string;
}

/** `use-agentic`'s WIRE.md, typed at both ends independently so the server never imports the client package. */
export interface AgentWireMessage {
  role: "user" | "assistant" | "tool";
  text?: string;
  attachments?: AgentWireAttachment[];
  references?: AgentWireReference[];
  toolCalls?: AgentWireToolCall[];
  toolResults?: AgentWireToolResult[];
  error?: string;
  /** A compaction summary: it arrives with the user's role but is history, not an ask, and a provider frames it so. */
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
  /** `"length"` is the provider's ceiling; a turn cut off mid tool call must not read as a model that chose to stop. */
  stop: "end" | "toolUse" | "length";
  /** Absent when the provider reported nothing. */
  usage?: LlmUsage;
  /** The model that answered, as the adaptor named it to the provider. */
  model?: string;
}

/** `inputTokens` is the whole prompt, cached part included; `cachedTokens` is the share billed at the cache rate. */
export interface LlmUsage {
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
}

/**
 * The provider seam for one stateless agent turn; the server relays and never executes a client tool. `chat`
 * resolves `null` only when unconfigured — a refusal the provider explained is thrown as an `Err` the chat prints.
 */
export interface LlmAdaptor {
  /** `onDelta` opts into streaming and the full answer still resolves; an adaptor may ignore it. */
  chat(request: LlmTurnRequest, onDelta?: (delta: string) => void): Promise<LlmTurnAnswer | null>;
  /** Omitted means text only. */
  readonly accepts?: LlmAccepts;
  /** Omitted means nothing is known. */
  readonly limits?: LlmLimits;
}

/** Relayed to the browser on every turn, so the chat compacts its transcript before the provider refuses it. */
export interface LlmLimits {
  /** The model's context window, prompt and answer together. */
  window?: number;
  /** The answer ceiling the adaptor actually requests; left out when it sends none. */
  output?: number;
}

/**
 * Declared, never defaulted to true: a provider handed bytes it cannot decode refuses the turn or answers about a
 * file it never read. `AgentService` degrades what is not accepted into a note.
 */
export interface LlmAccepts {
  image?: boolean;
  /** Non-image bytes handed over whole — a PDF the model parses itself. */
  document?: boolean;
}

/**
 * Registered with `option.setLlm(...)` for whichever adaptor fills `LlmAdaptorRole`. `setLlm` keeps extra fields, so
 * a custom adaptor extends this interface and reads it with `use<MyLlmOption>()`.
 */
export interface LlmOption {
  apiKey?: string;
  model?: string;
  host?: string;
  /** Overrides what the adaptor claims for its provider: one API serves models that read different things. */
  accepts?: LlmAccepts;
  /**
   * The answer ceiling, for an API that requires one. Sampling knobs are absent on purpose: `temperature` is a 400
   * on some models.
   */
  maxTokens?: number;
  /** In tokens. Left out, the chat learns it from the first refusal that names it. */
  contextWindow?: number;
}

/**
 * The refusing party printed on `agent.error.llmRequestFailed`: the host, not the adaptor's name, since one dialect
 * class serves many hosts. A host that is not a URL is printed as written.
 */
export const llmProviderOf = (host: string): string => {
  try {
    return new URL(host).hostname;
  } catch {
    return host;
  }
};
