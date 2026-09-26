import type { CodeAgentApprovalPolicy, CodeAgentInteractionMode, CodeAgentProfile } from "./codeAgentProfile";

/**
 * The wire between a code agent core and whatever is driving it — the terminal TUI, the non-interactive stream
 * printer, or a browser over a relay. It is the only thing the two sides share, so it lives here: a browser
 * bundle has to know these types and cannot import the CLI.
 *
 * **These events are ours, not the engine's.** They are a deliberate narrowing of what the underlying agent
 * loop emits, so an engine upgrade stops at the core instead of reaching every host and the web UI. The cost is
 * one mapping function in the core; the alternative is a version bump that breaks three consumers at once.
 *
 * **Nothing here carries a payload proportional to a file.** A `write` call's arguments are the whole new file
 * body and a `read` result is the whole old one; putting either on the wire sends hundreds of KB per edit to a
 * browser and then keeps it there. Labels are clipped to {@link codeAgentLabelChars} and outputs to
 * {@link codeAgentOutputChars}, with `truncated` saying so. The unclipped text lives in the transcript the core
 * owns, which is where a model reads it from anyway.
 *
 * **`seq` belongs to a transport, not to the session end to end.** It is monotonic for the life of one
 * connection, and a relay that merges these frames with its own **re-stamps** them — otherwise a client holds
 * two watermarks and the order between the two streams is undefined. A reconnecting client replays from the
 * last `seq` it saw on *that* transport, and resets to 0 when the session changes, or every frame of the next
 * session reads as a duplicate.
 */

export const codeAgentWireVersion = 1;

/** One line in a collapsed row. */
export const codeAgentLabelChars = 200;
/** A tool result on the wire. The model's own copy is not clipped. */
export const codeAgentOutputChars = 2_000;

/** How hard the model is asked to think before it answers. */
export type CodeAgentEffort = "off" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max";

export interface CodeAgentSessionInfo {
  sessionId: string;
  cwd: string;
  profile: string;
  model: { provider: string; id: string; name: string } | undefined;
  tools: string[];
  /** Absent when the model reports no window, which is not the same as a window of zero. */
  contextTokens: number | undefined;
  /** Absent when the model does no reasoning at all — which is not the same as reasoning turned `off`. */
  effort: CodeAgentEffort | undefined;
  /** What this session calls itself, once it has been asked something. */
  name: string | undefined;
  /**
   * Whether asking a person ends the turn, read once instead of inferred per question.
   *
   * `await`: the question happens **inside** a turn, the `turnId` does not change, and no `turn_end` is
   * emitted for it. `suspend`: the core emits `turn_end` with `awaiting` right after `question`, and the
   * answer opens a **new** turn with a new `turnId`. A host that treated "question" as a turn boundary in both
   * would either split a turn that never ended or merge two that did.
   */
  interaction: { question: CodeAgentInteractionMode; approval: CodeAgentInteractionMode };
}

/**
 * Why a turn ended.
 *
 * `awaiting` means a person was asked something and the turn was closed to wait for them — it is reported only
 * by a profile whose `interaction` suspends; one that awaits keeps the question inside the turn and never emits
 * it. A host reads {@link CodeAgentSessionInfo.interaction} once to know which shape to expect.
 *
 * **`truncated` is a partial success, not a failure.** The model hit its output cap mid-answer: the text that
 * arrived is real and must be kept, and the useful offer is "continue", not "retry". Folding it into `done` is
 * the expensive mistake — the answer is then stored as complete, and on the next turn the memory window
 * replays it as something the model finished saying, so every later turn reasons from a sentence that stopped
 * in the middle. Folding it into `error` is the other one: it throws away good output and offers a retry that
 * will truncate at the same place.
 *
 * `maxTurns` is a limit on how many times the agent loops, not on how long one message is. Nothing in the core
 * emits it today; it is here for a host that imposes its own ceiling.
 *
 * **Order contract, in force for every profile:**
 * - an assistant `message` for a turn is always emitted **before** that turn's `turn_end`;
 * - that holds for `aborted` and `truncated` too — whatever the model produced before the cut is emitted,
 *   because a host that persists on the terminal frame would otherwise store an answer-less turn and the
 *   symptom reads as "interrupting loses the reply".
 */
export type CodeAgentStopReason = "done" | "aborted" | "truncated" | "error" | "awaiting" | "maxTurns";

/**
 * `blocked` is not a flavour of `error` — a blocked call never executes, so a host that counts errors, derives
 * a file tree from writes, or retries failures must be able to tell the two apart.
 */
export type CodeAgentToolOutcome = "ok" | "error" | "blocked";

/** What the call does to the workspace, so a host can react without learning every tool name. */
export type CodeAgentToolOp = "read" | "write" | "delete" | "list" | "search" | "execute" | "other";

/**
 * Carried on **both** the start and the end frame.
 *
 * A host folding by `toolCallId` replaces the part on the end frame; a summary present only on start leaves a
 * finished `bash` labelled "bash" with the command gone.
 */
export interface CodeAgentToolSummary {
  toolCallId: string;
  name: string;
  op: CodeAgentToolOp;
  /**
   * The file this call names, when it names one.
   *
   * ⚠️ **Progress, not a change list.** An edit made through `bash` — `sed -i`, `mv`, a codemod, a script —
   * names no path here, and neither does the sweep of generated barrels a single `akan sync` rewrites, which
   * is most of the files a scaffold touches. A `blocked` call names a path it never wrote. Anything that has
   * to be *correct* about what changed reads `git status`; this field is for showing the row.
   */
  path?: string;
  /** Clipped to {@link codeAgentLabelChars}. */
  title: string;
}

export interface CodeAgentQuestionOption {
  key: string;
  label: string;
  detail?: string;
  /** The one to take when the user says "you decide". */
  recommended?: boolean;
}

/**
 * A question is a conversation turn; an approval is a gate on one tool call. They differ in every property that
 * matters — cardinality, lifetime, whether they survive into the transcript — so they are two events, not one
 * with a discriminator.
 */
export interface CodeAgentQuestion {
  questionId: string;
  prompt: string;
  kind: "text" | "select" | "confirm";
  options?: CodeAgentQuestionOption[];
  multiSelect?: boolean;
  /** Whether a free-text answer is accepted alongside, or instead of, the options. */
  freeText?: boolean;
}

/**
 * Structured, not a string: a multi-select answer joined into prose cannot be parsed back, so a client that
 * reconnects cannot restore which boxes were ticked. The prose the transcript needs is derived once, by
 * {@link codeAgentRenderAnswer}, rather than by each host separately.
 */
export interface CodeAgentAnswer {
  keys?: string[];
  text?: string;
}

export interface CodeAgentApprovalRequest {
  approvalId: string;
  toolCallId: string;
  name: string;
  /** What the call will do, rendered and clipped. */
  summary: string;
  policy: CodeAgentApprovalPolicy;
}

/**
 * One sub-agent the `task` tool is currently running.
 *
 * `tokens` is read at the moment the frame is made, so a host that draws this rail sees the child's spend
 * climb rather than learning it only once the child is gone — which is the number that decides whether to
 * let it keep going. A finished sub-agent leaves the list: what it did is already in the tool row it closed.
 */
export interface CodeAgentSubagent {
  /** The `task` call that opened it, so a host can line the row up with the tool row above. */
  id: string;
  kind: string;
  /** The three-to-five words the model named the task with. */
  description: string;
  startedAt: number;
  tokens: number;
}

export type CodeAgentEventBody =
  | { type: "session"; info: CodeAgentSessionInfo }
  | { type: "turn_start"; turnId: string }
  | { type: "turn_end"; turnId: string; stopReason: CodeAgentStopReason }
  | { type: "text_delta"; turnId: string; text: string }
  | { type: "thinking_delta"; turnId: string; text: string }
  | { type: "message"; turnId: string; role: "user" | "assistant"; text: string }
  | { type: "tool_start"; turnId: string; tool: CodeAgentToolSummary }
  | { type: "tool_progress"; turnId: string; toolCallId: string; text: string }
  | {
      type: "tool_end";
      turnId: string;
      tool: CodeAgentToolSummary;
      outcome: CodeAgentToolOutcome;
      output: string;
      truncated: boolean;
    }
  | { type: "question"; question: CodeAgentQuestion }
  | { type: "question_resolved"; questionId: string; answer: CodeAgentAnswer; rendered: string }
  /** A question nobody could be asked — no host attached — answered with nothing; the model continued on its own. */
  | { type: "question_skipped"; question: CodeAgentQuestion; reason: "no-host" }
  | { type: "approval"; request: CodeAgentApprovalRequest }
  | { type: "approval_resolved"; approvalId: string; approved: boolean }
  | { type: "context"; used: number; max: number | undefined }
  /** An `end` carrying neither `error` nor `aborted` is the only one that compacted anything. */
  | {
      type: "compaction";
      phase: "start" | "end";
      reason: "manual" | "threshold" | "overflow";
      error?: string;
      aborted?: boolean;
    }
  | { type: "retry"; attempt: number; maxAttempts: number; delayMs: number; message: string }
  | { type: "queue"; steering: string[]; followUp: string[] }
  | { type: "notice"; level: "info" | "warning" | "error"; message: string }
  /**
   * Every sub-agent running right now, whole rather than as a delta.
   *
   * A list is re-sent on every change and on a slow tick while any child runs, so a host that missed a frame
   * converges on the next one instead of holding a row for a child that finished. It is the one thing a turn
   * does that the transcript cannot show: a `task` call is one tool row that stays open for minutes while its
   * child spends tokens nobody watching sees spent.
   */
  | { type: "subagent"; agents: CodeAgentSubagent[] }
  | { type: "error"; message: string; fatal: boolean }
  | { type: "idle" }
  /**
   * A frame the **host** made, carried in the core's sequence so it orders against engine frames.
   *
   * `kind` is opaque here: no code in this file or in the core branches on its value. Plan steps, warming and
   * preview lifecycle, deployment progress — all of them belong to whoever runs the agent, and a second channel
   * for them would leave their order against `text_delta` undefined. When `id` is present a client **upserts**
   * by it, because one step emitting pending → running → done must be one row, not three.
   *
   * `persist` is per **frame**, not per `kind`: the same plan step is worth storing when it reports `done` and
   * must not be stored while it is still `pending`, because a step that never started reads later as one that
   * did. It defaults to false — a host that forgets to set it loses a row, which is cheaper than a permanent
   * record of every transient status it ever emitted.
   */
  | { type: "host"; kind: string; id?: string; persist?: boolean; payload: unknown };

export type CodeAgentEvent = CodeAgentEventBody & { seq: number };

export type CodeAgentEventType = CodeAgentEventBody["type"];

/**
 * Whether an event belongs in a stored transcript or only on a live screen.
 *
 * Folding and persisting are different rules, and conflating them is a bug in both directions: a `pending`
 * step written to permanent history reads later as "this was done", and a reconnecting client that replays
 * only persisted frames loses the tool row it was watching.
 *
 * **A transcript is not a memory window.** What a person sees on reopening and what the model is given on the
 * next turn are two questions, and this table answers only the first. The memory window is derived from
 * `message` rows and nothing else — a summariser fed `turn_start`, `turn_end` and `compaction` rows spends its
 * input on bookkeeping. That is also why a question and its answer are rendered into message text rather than
 * left as structure: the next turn reads content, not frames.
 *
 * `host` is the one entry the table cannot settle, because the same `kind` persists in one frame and not in the
 * next. Its row is the default; the frame's own `persist` decides. Use {@link codeAgentShouldPersist}.
 */
export const codeAgentEventPersistence: { [key in CodeAgentEventType]: "live" | "persist" } = {
  session: "live",
  turn_start: "persist",
  turn_end: "persist",
  text_delta: "live",
  thinking_delta: "live",
  message: "persist",
  tool_start: "live",
  tool_progress: "live",
  tool_end: "persist",
  question: "persist",
  question_resolved: "persist",
  question_skipped: "persist",
  approval: "live",
  approval_resolved: "live",
  context: "live",
  compaction: "persist",
  retry: "live",
  queue: "live",
  notice: "live",
  subagent: "live",
  error: "persist",
  idle: "live",
  host: "live",
};

/**
 * `answer` and `approve` are separate from `prompt` on purpose: answering a pending question is not a new
 * instruction, and a host that routed it through `prompt` would open a turn while the question slot is still
 * occupied — leaving a card on screen that still looks clickable.
 */
/**
 * A browser holds bytes and a terminal holds a path, so `string[]` would be implemented differently on each
 * side and diverge the first time one of them handed the other its own form.
 */
export type CodeAgentImage = { path: string } | { data: string; mime: string };

/**
 * The name a session takes from the first thing it was asked.
 *
 * Derived from the text rather than written by the model: a session name is worth one glance in a list, and
 * generating one would be a second request standing between the person and their first answer — charged again
 * on every session that is opened and abandoned.
 */
export const codeAgentSessionName = (text: string, max = 40) => {
  const words = text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter((word) => !!word);
  const name: string[] = [];
  for (const word of words) {
    if (name.length && [...name, word].join("-").length > max) break;
    name.push(word);
  }
  return name.join("-").slice(0, max) || "session";
};

export type CodeAgentCommand =
  | { type: "prompt"; message: string; images?: CodeAgentImage[]; deliverAs?: "steer" | "followUp" }
  | { type: "answer"; questionId: string; answer: CodeAgentAnswer }
  | { type: "approve"; approvalId: string; approved: boolean }
  | { type: "abort" }
  | { type: "compact"; instructions?: string }
  | { type: "set_model"; provider: string; modelId: string }
  | { type: "fork"; entryId: string }
  | { type: "new_session" }
  /**
   * Current state, plus every frame after `sinceSeq` when one is given.
   *
   * A browser that reloads mid-turn needs the frames it missed, not a snapshot: the completed messages survive
   * in the transcript either way, but the `text_delta` and `tool_start` frames of the bubble still being
   * written exist nowhere else. A terminal host never discovers this — its process and its session die
   * together — which is why it is in the contract rather than waiting for the web host to find it.
   */
  | { type: "get_state"; sinceSeq?: number }
  | { type: "shutdown" };

export type CodeAgentCommandType = CodeAgentCommand["type"];

export interface CodeAgentRequest {
  id: string;
  command: CodeAgentCommand;
}

export interface CodeAgentReply {
  type: "reply";
  id: string;
  ok: boolean;
  error?: string;
  data?: unknown;
}

export type CodeAgentFrame = ({ type: "event" } & { event: CodeAgentEvent }) | CodeAgentReply;

export const isCodeAgentReply = (frame: CodeAgentFrame): frame is CodeAgentReply => frame.type === "reply";

/** The table, with a `host` frame's own `persist` taking precedence over the default. */
export const codeAgentShouldPersist = (event: CodeAgentEventBody) =>
  event.type === "host" ? event.persist === true : codeAgentEventPersistence[event.type] === "persist";

export const codeAgentClip = (text: string, max: number) => (text.length <= max ? text : `${text.slice(0, max - 1)}…`);

/**
 * The prose form of an answer, made once.
 *
 * Compaction and the next turn read `role`/`content` only, so an answer that exists solely as structure is an
 * answer the agent will not remember giving.
 */
export const codeAgentRenderAnswer = (question: CodeAgentQuestion, answer: CodeAgentAnswer) => {
  const labels = (answer.keys ?? []).map((key) => question.options?.find((option) => option.key === key)?.label ?? key);
  return [labels.join(", "), answer.text].filter(Boolean).join(" — ");
};

const toolOutcomeMark: { [key in CodeAgentToolOutcome]: string } = { ok: "✓", error: "✗", blocked: "⦸" };

/** A one-line rendering of an event, shared by the stream printer and the TUI so the two cannot drift. */
export const codeAgentEventLabel = (event: CodeAgentEventBody): string => {
  switch (event.type) {
    case "session":
      // The window is printed, not just carried: a model descriptor that is wrong but self-consistent — a 65k
      // window declared for a provider that serves 1M — passes every check there is, and the only thing that
      // catches it is somebody reading the number on the first line.
      return [
        `session ${event.info.sessionId}`,
        event.info.model?.name ?? "no model",
        event.info.contextTokens ? `${Math.round(event.info.contextTokens / 1000)}k ctx` : "unknown ctx",
        event.info.profile,
      ].join(" · ");
    case "turn_start":
      return "turn start";
    case "turn_end":
      return event.stopReason === "truncated"
        ? "turn end — the answer was cut off at the model's output limit"
        : `turn end (${event.stopReason})`;
    case "text_delta":
      return event.text;
    case "thinking_delta":
      return event.text;
    case "message":
      return `${event.role}: ${event.text}`;
    case "tool_start":
      return `→ ${event.tool.title}`;
    case "tool_end":
      return `${toolOutcomeMark[event.outcome]} ${event.tool.title}`;
    case "tool_progress":
      return `  ${event.text}`;
    case "question":
      return `? ${event.question.prompt}`;
    case "question_resolved":
      return `= ${event.rendered}`;
    case "question_skipped":
      return `? ${event.question.prompt} (skipped: ${event.reason})`;
    case "approval":
      return `approve? ${event.request.summary}`;
    case "approval_resolved":
      return event.approved ? "approved" : "denied";
    case "context":
      return `context ${event.used}${event.max ? `/${event.max}` : ""}`;
    case "compaction": {
      const outcome = event.error ? ` — ${event.error}` : event.aborted ? " — cancelled" : "";
      return `compaction ${event.phase} (${event.reason})${outcome}`;
    }
    case "retry":
      return `retry ${event.attempt}/${event.maxAttempts} in ${event.delayMs}ms — ${event.message}`;
    case "queue":
      return `queued ${event.steering.length} steering, ${event.followUp.length} follow-up`;
    case "notice":
      return `[${event.level}] ${event.message}`;
    case "subagent":
      return event.agents.length
        ? event.agents.map((agent) => `${agent.kind} · ${agent.description}`).join(" | ")
        : "no sub-agent running";
    case "error":
      return `error: ${event.message}`;
    case "idle":
      return "idle";
    case "host":
      return `${event.kind}${event.id ? ` ${event.id}` : ""}`;
    default:
      return "";
  }
};

export interface CodeAgentState {
  info: CodeAgentSessionInfo;
  streaming: boolean;
  /** Present only when `get_state` asked for a replay. Empty when nothing was missed. */
  frames?: CodeAgentEvent[];
  /** How far back a replay can reach. A client behind this must reload the transcript instead. */
  replayFrom: number;
}

export interface CodeAgentStartOptions {
  cwd: string;
  profile: CodeAgentProfile;
  model?: { provider: string; id: string };
  /** Resume this session instead of opening a new one. */
  sessionId?: string;
}
