import type {
  CodeAgentApprovalRequest,
  CodeAgentEvent,
  CodeAgentQuestion,
  CodeAgentSessionInfo,
  CodeAgentStopReason,
  CodeAgentSubagent,
  CodeAgentToolOutcome,
  CodeAgentToolSummary,
} from "./codeAgentWire";

export type CodeTranscriptPart =
  | { kind: "user"; id: string; text: string; images?: number }
  | { kind: "assistant"; id: string; text: string; streaming: boolean; truncated: boolean }
  | { kind: "thinking"; id: string; text: string }
  | {
      kind: "tool";
      id: string;
      tool: CodeAgentToolSummary;
      outcome?: CodeAgentToolOutcome;
      output?: string;
      progress?: string;
    }
  | { kind: "notice"; id: string; level: "info" | "warning" | "error"; text: string }
  | { kind: "question"; id: string; question: CodeAgentQuestion; rendered?: string }
  | { kind: "approval"; id: string; request: CodeAgentApprovalRequest; approved?: boolean }
  | { kind: "host"; id: string; hostKind: string; text: string };

// Rows are upserted by id and the first is index 0, so a looked-up index is tested against `undefined`, not truthiness.
export class CodeTranscript {
  readonly #parts: CodeTranscriptPart[] = [];
  readonly #indexById = new Map<string, number>();
  #info: CodeAgentSessionInfo | undefined;
  #context: { used: number; max: number | undefined } | undefined;
  #streaming = false;
  #compacting = false;
  #question: CodeAgentQuestion | undefined;
  #approval: CodeAgentApprovalRequest | undefined;
  #stopReason: CodeAgentStopReason | undefined;
  #queue = { steering: 0, followUp: 0 };
  #subagents: CodeAgentSubagent[] = [];
  #openAssistant: string | undefined;
  #openThinking: string | undefined;
  #nextId = 0;
  #revision = 0;

  get parts(): readonly CodeTranscriptPart[] {
    return this.#parts;
  }

  get info() {
    return this.#info;
  }

  // The window is printed so a wrong but self-consistent descriptor (65k declared for a 1M model) gets noticed.
  get headline() {
    if (!this.#info) return "starting…";
    return [
      this.#info.model?.name ?? "no model",
      this.#info.contextTokens ? `${Math.round(this.#info.contextTokens / 1000)}k ctx` : "unknown ctx",
      this.#info.profile,
      this.#info.sessionId.slice(0, 8),
    ].join(" · ");
  }

  get context() {
    return this.#context;
  }

  get streaming() {
    return this.#streaming;
  }

  get compacting() {
    return this.#compacting;
  }

  get question() {
    return this.#question;
  }

  get approval() {
    return this.#approval;
  }

  get stopReason() {
    return this.#stopReason;
  }

  get queue() {
    return this.#queue;
  }

  get subagents() {
    return this.#subagents;
  }

  /** Bumped on every applied event. */
  get revision() {
    return this.#revision;
  }

  /** Drops every row but keeps the session info; the model's own window is untouched. */
  clear() {
    this.#revision += 1;
    this.#parts.length = 0;
    this.#indexById.clear();
    this.#openAssistant = undefined;
    this.#openThinking = undefined;
  }

  /** A locally typed prompt, drawn before the engine echoes it back as a `message` matched by text. */
  echo(text: string, images = 0) {
    this.#revision += 1;
    this.#push({ kind: "user", id: this.#id(), text, ...(images ? { images } : {}) });
  }

  note(level: "info" | "warning" | "error", text: string) {
    this.#revision += 1;
    this.#notice(level, text);
  }

  apply(event: CodeAgentEvent) {
    this.#revision += 1;
    switch (event.type) {
      case "session":
        this.#info = event.info;
        return;
      case "turn_start":
        this.#streaming = true;
        this.#stopReason = undefined;
        return;
      case "turn_end":
        this.#streaming = false;
        this.#stopReason = event.stopReason;
        this.#closeStreams(event.stopReason === "truncated");
        return;
      case "text_delta":
        return this.#appendAssistant(event.text);
      case "thinking_delta":
        return this.#appendThinking(event.text);
      case "message":
        return this.#message(event.role, event.text);
      case "tool_start":
        // Closing the open prose keeps time order: text after the call must not land in the bubble above it.
        this.#closeStreams(false);
        return this.#upsertTool(event.tool, {});
      case "tool_progress":
        return this.#progress(event.toolCallId, event.text);
      case "tool_end":
        return this.#upsertTool(event.tool, { outcome: event.outcome, output: event.output });
      case "question":
        this.#question = event.question;
        return this.#push({ kind: "question", id: event.question.questionId, question: event.question });
      case "question_skipped":
        return this.#push({
          kind: "question",
          id: event.question.questionId,
          question: event.question,
          rendered: `(${event.reason})`,
        });
      case "question_resolved":
        if (this.#question?.questionId === event.questionId) this.#question = undefined;
        return this.#patch(event.questionId, (part) => {
          if (part.kind === "question") part.rendered = event.rendered;
        });
      case "approval":
        this.#approval = event.request;
        return this.#push({ kind: "approval", id: event.request.approvalId, request: event.request });
      case "approval_resolved":
        if (this.#approval?.approvalId === event.approvalId) this.#approval = undefined;
        return this.#patch(event.approvalId, (part) => {
          if (part.kind === "approval") part.approved = event.approved;
        });
      case "context":
        this.#context = { used: event.used, max: event.max };
        return;
      case "compaction":
        this.#compacting = event.phase === "start";
        if (event.phase === "start") return;
        // A failed manual compaction is reported by its caller; only an automatic one's failure surfaces here.
        if ((event.error || event.aborted) && event.reason === "manual") return;
        if (event.error) return this.#notice("warning", event.error);
        if (event.aborted) return this.#notice("info", "Compaction cancelled.");
        return this.#notice("info", `Compacted the conversation (${event.reason}).`);
      case "retry":
        return this.#notice(
          "warning",
          `Retrying (${event.attempt}/${event.maxAttempts}) in ${event.delayMs}ms — ${event.message}`,
        );
      case "queue":
        this.#queue = { steering: event.steering.length, followUp: event.followUp.length };
        return;
      case "notice":
        return this.#notice(event.level, event.message);
      case "subagent":
        this.#subagents = event.agents;
        return;
      case "error":
        return this.#notice("error", event.message);
      case "idle":
        this.#streaming = false;
        this.#queue = { steering: 0, followUp: 0 };
        // A child cannot outlive its turn, so an idle session has none even when the pool's last frame was missed.
        this.#subagents = [];
        this.#closeStreams(false);
        return;
      case "host":
        return this.#host(event.kind, event.id, event.payload);
      default:
        return;
    }
  }

  #id() {
    this.#nextId += 1;
    return `p${this.#nextId}`;
  }

  #push(part: CodeTranscriptPart) {
    this.#indexById.set(part.id, this.#parts.length);
    this.#parts.push(part);
  }

  #patch(id: string, mutate: (part: CodeTranscriptPart) => void) {
    const index = this.#indexById.get(id);
    if (index === undefined) return;
    const part = this.#parts[index];
    if (part) mutate(part);
  }

  #notice(level: "info" | "warning" | "error", text: string) {
    this.#push({ kind: "notice", id: this.#id(), level, text });
  }

  #appendAssistant(text: string) {
    if (this.#openAssistant === undefined) {
      const id = this.#id();
      this.#openAssistant = id;
      this.#push({ kind: "assistant", id, text, streaming: true, truncated: false });
      return;
    }
    this.#patch(this.#openAssistant, (part) => {
      if (part.kind === "assistant") part.text += text;
    });
  }

  #appendThinking(text: string) {
    if (this.#openThinking === undefined) {
      const id = this.#id();
      this.#openThinking = id;
      this.#push({ kind: "thinking", id, text });
      return;
    }
    this.#patch(this.#openThinking, (part) => {
      if (part.kind === "thinking") part.text += text;
    });
  }

  // The final message replaces its deltas: a retried request also streamed its abandoned first attempt.
  #message(role: "user" | "assistant", text: string) {
    if (role === "user") {
      // Skip the echo of a prompt already drawn locally; a feedback loop's reopened turn has no local echo.
      const last = this.#parts.at(-1);
      if (last?.kind === "user" && last.text === text) return;
      this.#push({ kind: "user", id: this.#id(), text });
      return;
    }
    if (this.#openAssistant !== undefined) {
      const open = this.#openAssistant;
      this.#openAssistant = undefined;
      this.#patch(open, (part) => {
        if (part.kind !== "assistant") return;
        part.text = text;
        part.streaming = false;
      });
      return;
    }
    this.#push({ kind: "assistant", id: this.#id(), text, streaming: false, truncated: false });
  }

  #closeStreams(truncated: boolean) {
    this.#openThinking = undefined;
    const open = this.#openAssistant;
    this.#openAssistant = undefined;
    if (open === undefined) return;
    this.#patch(open, (part) => {
      if (part.kind !== "assistant") return;
      part.streaming = false;
      part.truncated = truncated;
    });
  }

  #upsertTool(tool: CodeAgentToolSummary, result: { outcome?: CodeAgentToolOutcome; output?: string }) {
    const index = this.#indexById.get(tool.toolCallId);
    if (index === undefined) {
      this.#push({ kind: "tool", id: tool.toolCallId, tool, ...result });
      return;
    }
    const part = this.#parts[index];
    if (part?.kind !== "tool") return;
    // The end frame carries the same summary, and it is the better one: a finished `bash` keeps its command.
    part.tool = tool;
    if (result.outcome) part.outcome = result.outcome;
    if (result.output !== undefined) part.output = result.output;
  }

  #progress(toolCallId: string, text: string) {
    this.#patch(toolCallId, (part) => {
      if (part.kind === "tool") part.progress = text;
    });
  }

  #host(hostKind: string, id: string | undefined, payload: unknown) {
    const text = typeof payload === "string" ? payload : JSON.stringify(payload);
    if (id === undefined) {
      this.#push({ kind: "host", id: this.#id(), hostKind, text });
      return;
    }
    const index = this.#indexById.get(id);
    if (index === undefined) {
      this.#push({ kind: "host", id, hostKind, text });
      return;
    }
    const part = this.#parts[index];
    if (part?.kind === "host") part.text = text;
  }
}
