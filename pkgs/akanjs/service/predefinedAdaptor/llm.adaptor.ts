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
  /** The host's own handle on this file, carried so a relay can act on it. A provider mapping ignores it. */
  ref?: string;
}

/**
 * Data the caller pointed at while writing one message, rather than a file they attached. `value` is a snapshot
 * taken when the message was sent and already masked by the host — the server has no model class to mask it with,
 * so what the browser staged is what leaves. `refName`/`refId`/`path` are the way back to the current value, which
 * is why they travel even when the value itself does not.
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

/**
 * One transcript message of the in-page agent wire (`use-agentic`'s WIRE.md), typed at both ends independently —
 * the wire is the contract, so the server never imports the client package.
 */
export interface AgentWireMessage {
  role: "user" | "assistant" | "tool";
  text?: string;
  attachments?: AgentWireAttachment[];
  references?: AgentWireReference[];
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
  /**
   * Why the turn ended. `"length"` is the provider's ceiling — `finish_reason: "length"`, `stop_reason:
   * "max_tokens"` — and it is distinguished from `"end"` because the two are indistinguishable downstream
   * otherwise: a truncated answer reads as a complete one, and a turn cut off mid tool call carries no complete
   * call at all, so it would end the loop looking exactly like a model that chose to stop.
   */
  stop: "end" | "toolUse" | "length";
  /** What the provider billed for this turn, when it said. Absent from a provider that reports nothing. */
  usage?: LlmUsage;
  /** The model that answered, as the adaptor named it to the provider. */
  model?: string;
}

/**
 * `inputTokens` is the whole prompt, cached part included, so a meter sums one field for volume and reads
 * `cachedTokens` for how much of it was billed at the cache rate.
 */
export interface LlmUsage {
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
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
  /** What the configured model holds, as far as the adaptor was told. Omitted means nothing is known. */
  readonly limits?: LlmLimits;
}

/**
 * Relayed to the browser on every turn, which is where the transcript is compacted: with a window to measure
 * against, the chat summarizes itself before the provider refuses a prompt rather than after.
 */
export interface LlmLimits {
  /** The model's context window, prompt and answer together. */
  window?: number;
  /** The answer ceiling the adaptor actually requests. One it never sends is not a ceiling, so it is left out. */
  output?: number;
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
 * class re-reads the same fields under that provider's own defaults.
 *
 * It is the floor, not the whole shape. `setLlm` keeps whatever else it is handed, so an adaptor an app or a
 * library wrote declares its own interface extending this one and reads it with `use<MyLlmOption>()` — a region,
 * a project id, a deployment name reach it through the same channel the fields below do, instead of a second
 * `option.use({...})` key beside it.
 */
export interface LlmOption {
  apiKey?: string;
  model?: string;
  host?: string;
  /**
   * What the *configured* model reads beyond text, overriding what the adaptor claims for its provider. It rides
   * beside `model` because that is what capability belongs to: an adaptor answers for an API, and one API serves
   * models that differ. Declared here rather than as a table the framework keeps, because a table is a claim about
   * models that ship after it and goes quietly wrong — and getting this wrong is the worst failure available, a
   * provider handed bytes it cannot decode either refusing the turn or accepting it having seen nothing.
   */
  accepts?: LlmAccepts;
  /**
   * The answer ceiling, for an API that requires one. A fixed default is a hazard on a model that thinks before
   * it writes: the budget goes on reasoning and the turn comes back empty with a length stop, which reads as the
   * model refusing rather than as a number being too small.
   *
   * Sampling knobs are deliberately absent from this option. They are the one place a per-model difference is a
   * hard failure rather than a nuance — `temperature` is a 400 on some models rather than an ignored field — so
   * the role carries nothing it would have to guess the legality of per model.
   */
  maxTokens?: number;
  /**
   * The configured model's context window, in tokens. Declared here rather than kept in a table for the reason
   * `accepts` is: a table is a claim about models that ship after it. Left out, the chat learns the window from
   * the first refusal that names it and compacts on its transcript ceiling until then.
   */
  contextWindow?: number;
}

/**
 * What the chat prints as the party that refused a turn, carried on `agent.error.llmRequestFailed`.
 *
 * It is the host rather than the adaptor's own name because one adaptor speaks one dialect to whatever host it
 * is pointed at — an OpenAI-dialect class aimed at a gateway would otherwise credit OpenAI for that gateway's
 * refusal. A host that is not a URL is printed as written; there is nothing better to say about it.
 */
export const llmProviderOf = (host: string): string => {
  try {
    return new URL(host).hostname;
  } catch {
    return host;
  }
};
