export type JsonSchema = Record<string, unknown>;

/** `true` asks with a default message, a string is the message, a function decides from the arguments. */
export type ToolConfirm = boolean | string | ((args: Record<string, unknown>) => string | boolean);

/** Re-checked at the moment of execution; a string is the refusal reason the agent reads. */
export type ToolGuard = (args: Record<string, unknown>) => true | string;

export interface ToolEntry {
  name: string;
  description?: string;
  parameters?: JsonSchema;
  /**
   * Whether a call has to be waited out before its effect on the screen is reported. `false` is a read that
   * returns what is already there; the default waits, because a write may still be landing when `run` resolves.
   */
  settle?: boolean;
  confirm?: ToolConfirm;
  guard?: ToolGuard;
  run: (args: Record<string, unknown>) => unknown;
}

/** One call an agent made through the surface, in the order it made them. */
export interface AgentCall {
  name: string;
  args: Record<string, unknown>;
  at: Date;
  error?: string;
}

export interface ResourceEntry {
  name: string;
  description?: string;
  /** `false` keeps it out of post-call diff reports — for values that change on their own every second. */
  report?: boolean;
  read: () => unknown;
}

export interface ScopeEntry {
  id: string;
  label?: string;
  kind?: string;
}

/**
 * A bulk contributor of entries whose names are already full — how a host store joins the surface. `view` is the
 * scope path a zone session reads through; a source that ignores it contributes the same entries to every view.
 */
export interface SurfaceSource {
  tools?: (view?: string[]) => ToolEntry[];
  resources?: (view?: string[]) => ResourceEntry[];
  subscribe?: (listener: () => void) => () => void;
}

/**
 * The reading half of a surface — what a session consumes. `AgenticSurface` is one; `surface.view(path)` answers a
 * zone-scoped one over the same registry, so zones are views of the screen, never walls between its parts.
 */
export interface SurfaceView {
  snapshot(): SurfaceSnapshot;
  tool(name: string): ToolEntry | null;
  call(name: string, args?: Record<string, unknown>): Promise<unknown>;
  read(name: string): unknown;
  diffSince(before: SurfaceSnapshot): ResourceDiff[];
  subscribe(listener: () => void): () => void;
}

export interface PublishedTool {
  name: string;
  description?: string;
  parameters?: JsonSchema;
  needsConfirm: boolean;
}

export interface PublishedResource {
  name: string;
  description?: string;
  value?: unknown;
  error?: string;
}

export interface PublishedScope {
  path: string;
  label?: string;
  kind?: string;
}

export interface SurfaceSnapshot {
  tools: PublishedTool[];
  resources: PublishedResource[];
  scopes: PublishedScope[];
  /** Standing guidance texts, in registration order. Folded into the turn's instructions, not into context. */
  guides: string[];
}

export interface ResourceDiff {
  name: string;
  value?: unknown;
  error?: string;
  removed?: boolean;
}

export type ChatRole = "user" | "assistant" | "tool";

export interface ToolCallRequest {
  id: string;
  name: string;
  args: Record<string, unknown>;
}

export interface ToolCallResult {
  id: string;
  name: string;
  /** What `run` returned. Must be JSON-serializable — it rides the wire back to the model. */
  result?: unknown;
  /** What the call changed on the surface — the whole report for a tool that returns nothing. */
  changes?: ResourceDiff[];
  error?: string;
}

/**
 * A file the user handed the conversation rather than the screen — which is why it rides a message instead of a
 * tool, the same reason `askUser` belongs to the session and not to the surface.
 *
 * Three carriers, one of which every attachment must have: `data` inlines the bytes, `url` points at something the
 * provider can fetch, and `text` is content somebody already extracted — the only form a text-only model can read.
 * They mirror what the server's own `Msg.image` / `Msg.link` / `Msg.resource` builders produce, so a prompt's
 * attachment and a user's are the same thing on the wire.
 *
 * Whether a given carrier reaches the model is the provider's answer, not this type's: a backend drops what its
 * model cannot read and says so in the transcript, because a silently dropped file is one the model then
 * hallucinates about.
 */
export interface MessageAttachment {
  name: string;
  mimeType: string;
  /** Base64, with no `data:` prefix. */
  data?: string;
  url?: string;
  text?: string;
}

export interface ChatMessage {
  role: ChatRole;
  text?: string;
  /** Files the message carries. Content, not instructions — a backend frames them the way it frames context. */
  attachments?: MessageAttachment[];
  toolCalls?: ToolCallRequest[];
  toolResults?: ToolCallResult[];
  /** A failed or capped turn, recorded in the transcript rather than thrown past it. */
  error?: string;
  /**
   * Host-rendered and never sent: a command's own output belongs in the transcript the user reads but not in the
   * history the model reads, which would take it for something it had said itself.
   */
  local?: boolean;
  /**
   * Stands in for the messages compaction replaced. It rides the wire like any other message — it is what the
   * model now remembers of them — but it is not something the user said, so a backend frames it as a summary and
   * a host renders it as one.
   */
  summary?: boolean;
}

/** One block of screen context the host assembles per turn. `kind` is the host's vocabulary; the wire forwards it verbatim. */
export interface ContextBlock {
  kind: string;
  [key: string]: unknown;
}

export type RunnerEvent =
  | { type: "text"; delta: string }
  | { type: "toolCall"; id: string; name: string; args: Record<string, unknown> }
  | { type: "done"; stop: "end" | "toolUse" }
  /**
   * `data` accompanies a message that is a code rather than a sentence — the values whoever resolves the code
   * interpolates into its text. A host that does not know the code shows the message as it stands.
   */
  | { type: "error"; message: string; data?: Record<string, string | number> };

export interface RunnerRequest {
  messages: ChatMessage[];
  tools: PublishedTool[];
  context: ContextBlock[];
  instructions?: string;
  signal: AbortSignal;
}

/** One model turn: request in, streamed events out. Where the loop runs is the implementation's business. */
export interface AgentRunner {
  run: (request: RunnerRequest) => AsyncIterable<RunnerEvent>;
}
