import type { AgentSessionEvent } from "@earendil-works/pi-coding-agent";
import {
  type CodeAgentEventBody,
  type CodeAgentStopReason,
  type CodeAgentToolOp,
  type CodeAgentToolSummary,
  codeAgentClip,
  codeAgentLabelChars,
  codeAgentOutputChars,
} from "akanjs/common";

const toolOps: { [key: string]: CodeAgentToolOp } = {
  read: "read",
  write: "write",
  edit: "write",
  ls: "list",
  find: "search",
  grep: "search",
  bash: "execute",
};

/**
 * Narrows the engine's event stream into the akan wire.
 *
 * One turn here is one user prompt, not one LLM round trip: the engine's `turn_start` fires once per round trip
 * inside a run, which is an engine detail no host should have to fold. `agent_start`/`agent_end` are the
 * boundaries a person perceives, so they become our `turn_start`/`turn_end`.
 */
export class CodeAgentEventMapper {
  #turn = 0;
  #turnId = "";
  #outcome: CodeAgentStopReason | undefined;
  readonly #openTools = new Map<string, CodeAgentToolSummary>();
  readonly #blocked = new Map<string, string>();

  get turnId() {
    return this.#turnId;
  }

  map(event: AgentSessionEvent): CodeAgentEventBody[] {
    switch (event.type) {
      case "agent_start":
        this.#turn += 1;
        this.#turnId = `t${this.#turn}`;
        // A hint left by an abort that hit an idle session must not colour the turn after it.
        this.#outcome = undefined;
        return [{ type: "turn_start", turnId: this.#turnId }];
      case "agent_end":
        // `turn_end` is last by contract. The engine finalizes the assistant message before the run ends even
        // when the run was aborted, so a host that closes the turn on this frame has already seen it.
        return [
          ...this.flushBlocked(),
          { type: "turn_end", turnId: this.#turnId, stopReason: this.#stopReason(event) },
        ];
      case "agent_settled":
        return [{ type: "idle" }];
      case "message_update":
        return this.#mapDelta(event);
      case "message_end":
        return this.#mapMessage(event);
      case "tool_execution_start": {
        const tool = this.#summary(event.toolCallId, event.toolName, event.args);
        this.#openTools.set(event.toolCallId, tool);
        return [{ type: "tool_start", turnId: this.#turnId, tool }];
      }
      case "tool_execution_update":
        return [
          {
            type: "tool_progress",
            turnId: this.#turnId,
            toolCallId: event.toolCallId,
            text: codeAgentClip(CodeAgentEventMapper.#renderToolText(event.partialResult), codeAgentLabelChars),
          },
        ];
      case "tool_execution_end":
        return [this.#mapToolEnd(event)];
      case "queue_update":
        return [{ type: "queue", steering: [...event.steering], followUp: [...event.followUp] }];
      case "compaction_start":
        return [{ type: "compaction", phase: "start", reason: event.reason }];
      case "compaction_end":
        return [
          {
            type: "compaction",
            phase: "end",
            reason: event.reason,
            ...(event.errorMessage ? { error: event.errorMessage } : {}),
            ...(event.aborted ? { aborted: true } : {}),
          },
        ];
      case "auto_retry_start":
        return [
          {
            type: "retry",
            attempt: event.attempt,
            maxAttempts: event.maxAttempts,
            delayMs: event.delayMs,
            message: event.errorMessage,
          },
        ];
      default:
        return [];
    }
  }

  /**
   * Records that a call was refused before it ran.
   *
   * The refusal arrives in the `tool_call` hook, which fires **before** `tool_execution_start` — measured: a
   * blocked call produces no start event at all, and then a `tool_execution_end` carrying `isError`. So the
   * start frame is synthesised here and the engine's own end frame is relabelled `blocked`, rather than
   * synthesising a terminal frame that would arrive twice.
   */
  markBlocked(toolCallId: string, toolName: string, args: unknown, reason: string): CodeAgentEventBody[] {
    this.#blocked.set(toolCallId, reason);
    if (this.#openTools.has(toolCallId)) return [];
    const tool = this.#summary(toolCallId, toolName, args);
    this.#openTools.set(toolCallId, tool);
    return [{ type: "tool_start", turnId: this.#turnId, tool }];
  }

  /** A refusal the engine never closed would leave a row open forever, so the turn boundary sweeps them. */
  flushBlocked(): CodeAgentEventBody[] {
    const frames: CodeAgentEventBody[] = [];
    for (const [toolCallId, reason] of this.#blocked) {
      const tool = this.#openTools.get(toolCallId);
      if (!tool) continue;
      this.#openTools.delete(toolCallId);
      frames.push({
        type: "tool_end",
        turnId: this.#turnId,
        tool,
        outcome: "blocked",
        output: reason,
        truncated: false,
      });
    }
    this.#blocked.clear();
    return frames;
  }

  #mapToolEnd(event: Extract<AgentSessionEvent, { type: "tool_execution_end" }>): CodeAgentEventBody {
    const tool = this.#openTools.get(event.toolCallId) ?? this.#summary(event.toolCallId, event.toolName, undefined);
    this.#openTools.delete(event.toolCallId);
    const reason = this.#blocked.get(event.toolCallId);
    this.#blocked.delete(event.toolCallId);
    const full = reason ?? CodeAgentEventMapper.#renderToolText(event.result);
    return {
      type: "tool_end",
      turnId: this.#turnId,
      tool,
      outcome: reason ? "blocked" : event.isError ? "error" : "ok",
      output: codeAgentClip(full, codeAgentOutputChars),
      truncated: full.length > codeAgentOutputChars,
    };
  }

  /**
   * Records how this turn is ending, from the side that actually knows.
   *
   * Consumed once, by the next `agent_end`. See {@link CodeAgentEventMapper.#stopReason} for why the engine's
   * own report cannot be trusted for this.
   */
  noteOutcome(reason: CodeAgentStopReason) {
    this.#outcome = reason;
  }

  /**
   * **The engine does not report an abort.** Measured: interrupting a streaming turn finalizes the partial
   * assistant message with `stopReason: "stop"` — the provider stream was cut, and from the engine's side that
   * is an ordinary stop. Trusting it reports `done` for every interrupt, and a host then has no way to tell a
   * finished answer from a truncated one.
   *
   * So the core's own record wins: it is the party that called `abort()`, and the party that suspended the
   * turn to ask a question. The engine's report is only the fallback.
   */
  #stopReason(event: Extract<AgentSessionEvent, { type: "agent_end" }>): CodeAgentStopReason {
    const noted = this.#outcome;
    this.#outcome = undefined;
    if (noted) return noted;
    if (event.willRetry) return "error";
    const last = event.messages.at(-1) as { stopReason?: string } | undefined;
    if (last?.stopReason === "aborted") return "aborted";
    if (last?.stopReason === "error") return "error";
    // The engine's vocabulary is `stop | length | toolUse | error | aborted`. Branching on only the two that
    // read as failures lets `length` — the model hitting its output cap — leave as `done`, and a half-written
    // answer is then stored, and replayed to the next turn, as a finished one.
    if (last?.stopReason === "length") return "truncated";
    return "done";
  }

  #summary(toolCallId: string, name: string, args: unknown): CodeAgentToolSummary {
    const path = CodeAgentEventMapper.#pathOf(args);
    return {
      toolCallId,
      name,
      op: toolOps[name] ?? "other",
      ...(path ? { path } : {}),
      title: codeAgentClip(`${name}${CodeAgentEventMapper.#renderArgs(args)}`, codeAgentLabelChars),
    };
  }

  #mapDelta(event: Extract<AgentSessionEvent, { type: "message_update" }>): CodeAgentEventBody[] {
    const inner = event.assistantMessageEvent;
    if (inner.type === "text_delta") return [{ type: "text_delta", turnId: this.#turnId, text: inner.delta }];
    if (inner.type === "thinking_delta") return [{ type: "thinking_delta", turnId: this.#turnId, text: inner.delta }];
    return [];
  }

  #mapMessage(event: Extract<AgentSessionEvent, { type: "message_end" }>): CodeAgentEventBody[] {
    const message = event.message as { role?: string; content?: unknown };
    if (message.role !== "assistant" && message.role !== "user") return [];
    const text = CodeAgentEventMapper.#renderContent(message.content);
    if (!text) return [];
    return [{ type: "message", turnId: this.#turnId, role: message.role, text }];
  }

  static #pathOf(args: unknown) {
    if (!args || typeof args !== "object") return undefined;
    const value = (args as { path?: unknown }).path;
    return typeof value === "string" && value ? value : undefined;
  }

  /**
   * A one-line rendering, never the values themselves: a `write` call's argument is the whole new file body and
   * an `edit` call's is every replacement in it.
   */
  static #renderArgs(args: unknown) {
    if (!args || typeof args !== "object") return "";
    const entries = Object.entries(args as Record<string, unknown>).filter(([, value]) => value !== undefined);
    if (!entries.length) return "";
    const rendered = entries.map(([key, value]) => `${key}=${CodeAgentEventMapper.#renderArgValue(value)}`).join(" ");
    return `(${codeAgentClip(rendered, 120)})`;
  }

  /**
   * A structured argument is described by its shape, not stringified.
   *
   * `String({})` is `"[object Object]"` and an array of them is that repeated — which is where an `edit` call's
   * replacement list ends up, so the row says nothing about a call that changed three places in a file.
   */
  static #renderArgValue(value: unknown) {
    if (Array.isArray(value)) return `${value.length} item${value.length === 1 ? "" : "s"}`;
    if (value && typeof value === "object") {
      const keys = Object.keys(value as Record<string, unknown>).length;
      return `{${keys} key${keys === 1 ? "" : "s"}}`;
    }
    return codeAgentClip(String(value), 60);
  }

  static #renderContent(content: unknown): string {
    if (typeof content === "string") return content;
    if (!Array.isArray(content)) return "";
    return content
      .filter(
        (part): part is { type: string; text: string } => !!part && typeof part === "object" && part.type === "text",
      )
      .map((part) => part.text)
      .join("");
  }

  static #renderToolText(value: unknown): string {
    if (typeof value === "string") return value;
    if (value && typeof value === "object" && "content" in value)
      return CodeAgentEventMapper.#renderContent((value as { content: unknown }).content);
    return value === undefined ? "" : JSON.stringify(value);
  }
}
