import type { ReactNode } from "react";

export type JsonSchema = Record<string, unknown>;

/** `true` asks with a default message, a string is the message, a function decides from the arguments. */
export type ToolConfirm = boolean | string | ((args: Record<string, unknown>) => string | boolean);

/** Re-checked at the moment of execution; a string is the refusal reason the agent reads. */
export type ToolGuard = (args: Record<string, unknown>) => true | string;

/**
 * What a card tool renders while its call waits, and the two ways the user ends that wait. `submit` is the call's
 * result, `cancel` is its refusal; whichever comes first settles the call and takes the card off the screen, so a
 * second call of either does nothing.
 */
export interface ToolCardControl {
  args: Record<string, unknown>;
  submit: (value: unknown) => void;
  cancel: (reason?: string) => void;
}

/**
 * Called, not mounted — the host invokes it inside its own render, so the returned tree keeps no state of its
 * own between renders. Put anything stateful in a component the function returns.
 */
export type ToolCard = (control: ToolCardControl) => ReactNode;

interface ToolEntryBase {
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
}

export interface ToolActionEntry extends ToolEntryBase {
  run: (args: Record<string, unknown>) => unknown;
  card?: never;
}

/**
 * A call the **user** answers rather than the screen: the host parks the call, renders `card`, and what the card
 * submits is what the model reads back. `confirm` is not read for one — the card in front of the user is already
 * the asking, and a gate before it would ask them twice for one thing.
 */
export interface ToolCardEntry extends ToolEntryBase {
  card: ToolCard;
  run?: never;
}

export type ToolEntry = ToolActionEntry | ToolCardEntry;

/**
 * That a call is happening, for a host drawing it on the screen rather than in a transcript.
 *
 * Emitted around the execution alone — after the approval card settled, and never for a call a guard or an
 * approval refused before it ran, so a host may treat `start` as "this is being done to the page right now".
 */
export interface ToolActivity {
  callId: string;
  name: string;
  args: Record<string, unknown>;
  phase: "start" | "end";
  error?: string;
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
 * Why an assistant turn ended. `length` is the provider's own ceiling rather than the model's choice, so the turn
 * is incomplete — a truncated answer and a turn cut off before its tool call finished both arrive this way, and
 * neither is distinguishable from `end` without it.
 */
export type TurnStop = "end" | "toolUse" | "length";

/** What the provider counted for one turn. `input` is the whole prompt, cached part included — what the window held. */
export interface TurnUsage {
  input: number;
  output: number;
}

/**
 * What the backend knows about the model it relays to, each only when it was told: a window it guesses is worse
 * than none, because a guard placed on a wrong number fires at the wrong time and nothing says so.
 */
export interface TurnLimits {
  /** The model's context window, prompt and answer together. */
  window?: number;
  /** The answer ceiling the backend actually requests. */
  output?: number;
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
  /**
   * Opaque to the framework, which only carries it: whatever the host needs to find this file again — a file id,
   * a storage key. Without one a host that stores its uploads keeps a map of its own beside the transcript, keyed
   * on name and size, which is the same guess `Attachment.same` has to make and is wrong for two crops of one
   * export. It is not shown to the model; a tool the host publishes is what turns it back into a file.
   */
  ref?: string;
}

/**
 * Data the user pointed at while they were talking, rather than a file they handed over — a record, or one field
 * of one, named in the message the way they named it. It rides a message for the same reason an attachment does:
 * what somebody referred to while asking is part of the asking, and the turn context is rebuilt from the screen
 * every turn, so a screen-shaped carrier forgets what was pointed at three turns ago.
 *
 * **`value` is a snapshot, deliberately.** It is what the data was when the user sent the message, and it is never
 * re-read on a later turn. Re-reading would be wrong twice over: it rewrites what the person was looking at when
 * they spoke, and the common case is an agent that then *edits* the very field it was pointed at, which would
 * leave the reference showing the result and no record of what was being changed from. `refName`, `refId` and
 * `path` are the way back to the current value — a tool re-reads it when the answer needs it.
 *
 * **`value` arrives masked, and nothing downstream can mask it again.** Masking needs the model class
 * (`mask(model, value)`), which no wire carries, so whichever model the host names when it stages the reference is
 * the whole of the decision about what leaves the browser.
 */
export interface MessageReference {
  /** The host's own `refName`, unchanged — the vocabulary its published tools already speak. */
  refName: string;
  refId: string;
  /** What the chip draws and what the token in the text spells, so the two can never disagree. */
  label: string;
  /** A dotted path into the document, in `pathSet`'s vocabulary. Absent means the whole of it. */
  path?: string;
  value?: unknown;
  /** Read by the model in place of a value there is none of — clipped, unreadable, or gone from a restored chat. */
  note?: string;
}

export interface ChatMessage {
  role: ChatRole;
  text?: string;
  /** Files the message carries. Content, not instructions — a backend frames them the way it frames context. */
  attachments?: MessageAttachment[];
  /** Data the message points at. Content, framed like attachments and for the same reason. */
  references?: MessageReference[];
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
  /**
   * What the provider counted for the turn that wrote this assistant message. Kept on the message so it moves,
   * persists and is summarized away with it; never sent, and dropped from what a compaction keeps, since it
   * measured a prompt that no longer exists.
   */
  usage?: TurnUsage;
}

/** One block of screen context the host assembles per turn. `kind` is the host's vocabulary; the wire forwards it verbatim. */
export interface ContextBlock {
  kind: string;
  [key: string]: unknown;
}

export type RunnerEvent =
  | { type: "text"; delta: string }
  | { type: "toolCall"; id: string; name: string; args: Record<string, unknown> }
  | { type: "done"; stop: TurnStop; usage?: TurnUsage; limits?: TurnLimits }
  /**
   * `data` accompanies a message that is a code rather than a sentence — the values whoever resolves the code
   * interpolates into its text. A host that does not know the code shows the message as it stands.
   *
   * `overflow` marks the provider refusing a prompt too long for its window — the one refusal a session can undo
   * on its own, by compacting and asking again. `limit` is the window when the refusal named it.
   */
  | {
      type: "error";
      message: string;
      data?: Record<string, string | number>;
      overflow?: { limit?: number };
    };

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
