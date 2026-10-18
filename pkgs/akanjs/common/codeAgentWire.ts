import type { CodeAgentApprovalPolicy, CodeAgentInteractionMode, CodeAgentProfile } from "./codeAgentProfile";

// Shared by the core and every host (TUI, stream printer, browser relay): a browser bundle cannot import the CLI.
// `seq` is monotonic per transport; a relay merging frames re-stamps them, and a client resets to 0 on a new session.

export const codeAgentWireVersion = 1;

export const codeAgentLabelChars = 200;
/** Clip length of a tool result on the wire; the model's own copy is not clipped. */
export const codeAgentOutputChars = 2_000;

export type CodeAgentEffort = "off" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max";

export interface CodeAgentSessionInfo {
  sessionId: string;
  cwd: string;
  profile: string;
  model: { provider: string; id: string; name: string } | undefined;
  tools: string[];
  /** Absent when the model reports no window, which is not a window of zero. */
  contextTokens: number | undefined;
  /** Absent when the model does no reasoning at all, which is not reasoning turned `off`. */
  effort: CodeAgentEffort | undefined;
  /** Percent of the window that starts a compaction; absent leaves the engine's own, later threshold. */
  autoCompactAt: number | undefined;
  /** Absent until the session has been asked something. */
  name: string | undefined;
  /** `await` keeps a question inside its turn; `suspend` ends the turn (`awaiting`) and the answer opens a new one. */
  interaction: { question: CodeAgentInteractionMode; approval: CodeAgentInteractionMode };
}

/**
 * `awaiting` only comes from a profile whose `interaction` suspends; `truncated` is a partial success (keep the text,
 * offer "continue"); only a host with its own ceiling emits `maxTurns`. A turn's `message` precedes its `turn_end`.
 */
export type CodeAgentStopReason = "done" | "aborted" | "truncated" | "error" | "awaiting" | "maxTurns";

/** A `blocked` call never executed, so it is not an `error`. */
export type CodeAgentToolOutcome = "ok" | "error" | "blocked";

export type CodeAgentToolOp = "read" | "write" | "delete" | "list" | "search" | "execute" | "other";

/** Carried on both the start and the end frame; a host folding by `toolCallId` keeps the end frame's. */
export interface CodeAgentToolSummary {
  toolCallId: string;
  name: string;
  op: CodeAgentToolOp;
  /** Progress, not a change list: a `bash` edit names no path and a `blocked` call names one it never wrote. */
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

export interface CodeAgentQuestion {
  questionId: string;
  prompt: string;
  kind: "text" | "select" | "confirm";
  options?: CodeAgentQuestionOption[];
  multiSelect?: boolean;
  freeText?: boolean;
}

/** Structured so a reconnecting client can restore a multi-select; the prose is {@link codeAgentRenderAnswer}. */
export interface CodeAgentAnswer {
  keys?: string[];
  text?: string;
}

export interface CodeAgentApprovalRequest {
  approvalId: string;
  toolCallId: string;
  name: string;
  /** Rendered and clipped. */
  summary: string;
  policy: CodeAgentApprovalPolicy;
}

/** A running `task` sub-agent; `tokens` is read when the frame is made, and a finished one leaves the list. */
export interface CodeAgentSubagent {
  /** The `toolCallId` of the `task` call that opened it. */
  id: string;
  kind: string;
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
  /** The whole list of running sub-agents, re-sent on every change and on a slow tick while any runs. */
  | { type: "subagent"; agents: CodeAgentSubagent[] }
  | { type: "error"; message: string; fatal: boolean }
  | { type: "idle" }
  /** A host-made frame in the core's sequence: `kind` is opaque, a client upserts by `id`, `persist` defaults false. */
  | { type: "host"; kind: string; id?: string; persist?: boolean; payload: unknown };

export type CodeAgentEvent = CodeAgentEventBody & { seq: number };

export type CodeAgentEventType = CodeAgentEventBody["type"];

/** A `host` row is only the default: the frame's own `persist` decides, via {@link codeAgentShouldPersist}. */
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

export type CodeAgentImage = { path: string } | { data: string; mime: string };

// Derived from the text, not generated: a naming request would stand between the person and their first answer.
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
  /** `percent` in steps of 10; absent, or 100, restores the default. */
  | { type: "set_auto_compact"; percent?: number }
  | { type: "fork"; entryId: string }
  | { type: "new_session" }
  /** Current state, plus every frame after `sinceSeq` when one is given. */
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

export const codeAgentShouldPersist = (event: CodeAgentEventBody) =>
  event.type === "host" ? event.persist === true : codeAgentEventPersistence[event.type] === "persist";

export const codeAgentClip = (text: string, max: number) => (text.length <= max ? text : `${text.slice(0, max - 1)}…`);

export const codeAgentRenderAnswer = (question: CodeAgentQuestion, answer: CodeAgentAnswer) => {
  const labels = (answer.keys ?? []).map((key) => question.options?.find((option) => option.key === key)?.label ?? key);
  return [labels.join(", "), answer.text].filter(Boolean).join(" — ");
};

const toolOutcomeMark: { [key in CodeAgentToolOutcome]: string } = { ok: "✓", error: "✗", blocked: "⦸" };

export const codeAgentEventLabel = (event: CodeAgentEventBody): string => {
  switch (event.type) {
    case "session":
      // The window is printed so a wrong but self-consistent descriptor (65k declared for a 1M model) gets noticed.
      return [
        `session ${event.info.sessionId}`,
        event.info.model?.name ?? "no model",
        event.info.contextTokens ? `${Math.round(event.info.contextTokens / 1000)}k ctx` : "unknown ctx",
        event.info.autoCompactAt ? `compacts at ${event.info.autoCompactAt}%` : "",
        event.info.profile,
      ]
        .filter((part) => !!part)
        .join(" · ");
    case "turn_start":
      return "turn start";
    case "turn_end":
      return event.stopReason === "truncated"
        ? "turn end — the answer was cut off at the model's output limit"
        : `turn end (${event.stopReason})`;
    case "text_delta":
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
  /** Present only when `get_state` asked for a replay; empty when nothing was missed. */
  frames?: CodeAgentEvent[];
  /** How far back a replay reaches; a client behind this reloads the transcript instead. */
  replayFrom: number;
}

export interface CodeAgentStartOptions {
  cwd: string;
  profile: CodeAgentProfile;
  model?: { provider: string; id: string };
  /** Resume this session instead of opening a new one. */
  sessionId?: string;
}
