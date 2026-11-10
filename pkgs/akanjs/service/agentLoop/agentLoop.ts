import { Logger } from "akanjs/common";
import { Err } from "akanjs/dictionary";
import { AgentAccounts } from "../agentAccounts";
import { AgentMeter } from "../agentMeter";
import { AgentRelayPolicy, type AgentTurnContext } from "../agentRelayPolicy";
import type { AgentTool, AgentToolsAdaptor } from "../predefinedAdaptor/agentTools.adaptor";
import type {
  AgentWireMessage,
  AgentWireToolCall,
  AgentWireToolResult,
  LlmTurnRequest,
  LlmUsage,
} from "../predefinedAdaptor/llm.adaptor";
import type { AgentLoopApproval, AgentLoopEvent, AgentLoopRequest, AgentLoopStop } from "./agentLoopTypes";
import { DeltaStream } from "./deltaStream";
import { LoopCompaction } from "./loopCompaction";
import { LoopToolOutput } from "./loopToolOutput";
import { LoopTranscript } from "./loopTranscript";

export interface AgentLoopAnswer {
  text: string;
  toolCalls: AgentWireToolCall[];
  stop: "end" | "toolUse" | "length";
  usage?: LlmUsage;
  model?: string;
}

export interface AgentLoopPort {
  tools: AgentToolsAdaptor;
  runTurn(
    request: LlmTurnRequest,
    options: { onDelta?: (delta: string) => void; preamble: string | false; signal: AbortSignal },
  ): Promise<AgentLoopAnswer>;
}

type Events<T> = AsyncGenerator<AgentLoopEvent, T>;

export class AgentLoop {
  static readonly maxRounds = 12;
  static readonly needsPerson = "Not run: this tool needs a person's confirmation, and none is available to this run.";
  static readonly taintedWrite =
    "Not run: this tool changes data, and this run has read untrusted content, so it may not change anything without a person's approval.";
  static readonly unjudged = "Not run: the approval check returned no verdict.";
  static readonly #wall = Symbol("wallMs");
  static readonly #logger = new Logger("AgentLoop");

  readonly #port: AgentLoopPort;
  readonly #request: AgentLoopRequest;
  readonly #id = crypto.randomUUID();
  readonly #messages: AgentWireMessage[];
  readonly #halt = new AbortController();
  readonly #signal: AbortSignal;
  #account: unknown = null;
  #round = 0;
  #tokens = 0;
  #toolCalls = 0;
  #tainted: boolean = false;
  #compactFloor = 0;

  constructor(port: AgentLoopPort, request: AgentLoopRequest) {
    this.#port = port;
    this.#request = request;
    this.#messages = [...request.messages];
    this.#signal = request.signal ? AbortSignal.any([request.signal, this.#halt.signal]) : this.#halt.signal;
  }

  async *run(): Events<void> {
    const { wallMs } = this.#request.budget ?? {};
    const timer =
      wallMs === undefined ? undefined : setTimeout(() => this.#halt.abort(AgentLoop.#wall), Math.max(0, wallMs));
    timer?.unref();
    let stop: AgentLoopStop;
    try {
      stop = yield* this.#drive();
    } catch (error) {
      const halted = this.#haltedBy(error);
      if (!halted) {
        yield { type: "error", message: error instanceof Error ? error.message : String(error), error };
        return;
      }
      stop = halted;
    } finally {
      clearTimeout(timer);
      //? Also reached when the consumer stops iterating: a model call still streaming is then billed as aborted.
      this.#halt.abort();
    }
    yield { type: "done", stop, rounds: this.#round };
  }

  async *#drive(): Events<AgentLoopStop> {
    for (const result of LoopTranscript.results(this.#messages)) this.#taintBy(result);
    const pending = LoopTranscript.pending(this.#messages);
    if (pending.length) {
      if (!(await this.#authorize())) return "unauthorized";
      const stop = yield* this.#runCalls(pending, await this.#listTools());
      if (stop) return stop;
    }
    for (;;) {
      const stop = this.#haltStop() ?? this.#idleStop() ?? this.#budgetStop();
      if (stop) return stop;
      if (this.#round >= (this.#request.maxRounds ?? AgentLoop.maxRounds)) return "maxRounds";
      if (!(await this.#authorize())) return "unauthorized";
      this.#round += 1;
      const roundStop = yield* this.#runRound();
      if (roundStop) return roundStop;
    }
  }

  async *#runRound(): Events<AgentLoopStop | null> {
    const tools = await this.#listTools();
    yield* this.#compact();
    const answer = yield* this.#ask(tools);
    if (answer.stop === "length") {
      //? Calls in an answer the provider cut off may be cut mid-argument, so only its text is kept.
      if (answer.text) await this.#append({ role: "assistant", text: answer.text });
      return "length";
    }
    const message: AgentWireMessage = {
      role: "assistant",
      ...(answer.text ? { text: answer.text } : {}),
      ...(answer.toolCalls.length ? { toolCalls: answer.toolCalls } : {}),
    };
    if (LoopTranscript.carries(message)) await this.#append(message);
    if (!answer.toolCalls.length) return "end";
    return yield* this.#runCalls(answer.toolCalls, tools);
  }

  async #authorize() {
    const { principal } = this.#request;
    this.#account = principal === undefined ? (this.#request.account ?? null) : await AgentAccounts.resolve(principal);
    return principal === undefined || this.#account !== null;
  }

  async #listTools() {
    return await this.#port.tools.listAs(this.#account, { allow: this.#request.allow });
  }

  async *#ask(tools: AgentTool[]): Events<AgentLoopAnswer> {
    const { context = [], instructions, model, preamble } = this.#request;
    const request: LlmTurnRequest = {
      messages: LoopTranscript.wire(this.#messages),
      tools: tools.map(({ readOnly: _readOnly, ...tool }) => tool),
      context,
      ...(instructions ? { instructions } : {}),
      ...(model ? { model } : {}),
    };
    return yield* this.#metered(request, preamble ?? false, true);
  }

  async *#metered(request: LlmTurnRequest, preamble: string | false, streamed: boolean): Events<AgentLoopAnswer> {
    const { meta } = this.#request;
    const turn: AgentTurnContext = {
      ...AgentMeter.turnOf(this.#account),
      loop: { id: this.#id, round: this.#round },
      ...(meta ? { meta: { ...meta } } : {}),
    };
    const prepared = await AgentRelayPolicy.apply(request, turn);
    const round = this.#round;
    let deltas = 0;
    const toText = (delta: string): AgentLoopEvent => {
      deltas += 1;
      return { type: "text", delta, round };
    };
    const answer = yield* DeltaStream.of(
      (onDelta) =>
        AgentMeter.run(
          this.#account,
          () => this.#port.runTurn(prepared, { ...(onDelta ? { onDelta } : {}), preamble, signal: this.#signal }),
          { turn, request: prepared, signal: this.#signal },
        ),
      streamed ? toText : null,
    );
    if (streamed && !deltas && answer.text) yield { type: "text", delta: answer.text, round };
    if (answer.usage) {
      this.#tokens += answer.usage.inputTokens + answer.usage.outputTokens;
      yield { type: "usage", usage: answer.usage, ...(answer.model ? { model: answer.model } : {}), round };
    }
    return answer;
  }

  async *#compact(): Events<void> {
    const { compact, model } = this.#request;
    if (!compact) return;
    if (LoopCompaction.tokensOf(this.#messages) < Math.max(compact.at, this.#compactFloor)) return;
    const at = LoopCompaction.cutAt(this.#messages, compact.keep ?? LoopCompaction.keep);
    if (at <= 0) return;
    const digest = LoopCompaction.digest(this.#messages.slice(0, at));
    let text = "";
    try {
      const request: LlmTurnRequest = {
        messages: [{ role: "user", text: digest }],
        tools: [],
        context: [],
        instructions: LoopCompaction.instruction,
        ...(model ? { model } : {}),
      };
      text = (yield* this.#metered(request, false, false)).text.trim();
    } catch (error) {
      if (this.#haltedBy(error)) throw error;
      //? Best effort: the round may still fit, and a failed summary says nothing about whether this transcript can shrink.
      AgentLoop.#logger.warn(`agent loop compaction failed: ${error instanceof Error ? error.message : String(error)}`);
      return;
    }
    if (!text) return;
    const summary = LoopCompaction.message(text);
    this.#messages.splice(0, at, summary);
    const after = LoopCompaction.tokensOf(this.#messages);
    //? Still over after summarizing: one kept message is that large, so wait for another threshold's growth.
    this.#compactFloor = after >= compact.at ? after + compact.at : 0;
    yield { type: "compacted", replaced: at, summary };
  }

  async *#runCalls(calls: AgentWireToolCall[], tools: AgentTool[]): Events<AgentLoopStop | null> {
    const round = this.#round;
    for (const call of calls) yield { type: "toolCall", call, round };
    const byName = new Map(tools.map((tool) => [tool.name, tool]));
    //? Judged before any runs: the batch was written before its results were read, so none of them taints it.
    const verdicts: AgentLoopApproval[] = [];
    for (const call of calls) verdicts.push(await this.#verdictOf(call, byName.get(call.name)));
    const deferred = calls.filter((_, at) => verdicts[at] === "defer");
    if (deferred.length) {
      for (const call of deferred) yield { type: "awaiting", call };
      return "awaiting";
    }
    const results: AgentWireToolResult[] = [];
    let stop: AgentLoopStop | null = null;
    for (const [at, call] of calls.entries()) {
      const verdict = verdicts[at] ?? { deny: AgentLoop.unjudged };
      stop = this.#haltStop() ?? (verdict === "allow" ? this.#callBudgetStop() : null);
      if (stop) break;
      const result = await this.#execute(call, verdict);
      results.push(result);
      this.#taintBy(result);
      yield { type: "toolResult", result, round };
    }
    if (results.length) await this.#append({ role: "tool", toolResults: results });
    return stop;
  }

  async #verdictOf(call: AgentWireToolCall, tool: AgentTool | undefined): Promise<AgentLoopApproval> {
    //? A name outside the exposure is not asked about: callAs refuses it with the text /mcp sends.
    if (!tool) return "allow";
    const { approve } = this.#request;
    if (approve) return AgentLoop.#judged(await approve(call, { tainted: this.#tainted, tool }));
    if (tool.needsConfirm) return { deny: AgentLoop.needsPerson };
    if (this.#tainted && !tool.readOnly) return { deny: AgentLoop.taintedWrite };
    return "allow";
  }

  //? Fails closed: an approver returning anything else, `true` from an older contract included, runs nothing.
  static #judged(verdict: unknown): AgentLoopApproval {
    if (verdict === "allow" || verdict === "defer") return verdict;
    if (verdict && typeof verdict === "object" && "deny" in verdict && typeof verdict.deny === "string")
      return { deny: verdict.deny };
    return { deny: AgentLoop.unjudged };
  }

  async #execute(call: AgentWireToolCall, verdict: AgentLoopApproval): Promise<AgentWireToolResult> {
    if (verdict !== "allow")
      return { id: call.id, name: call.name, error: typeof verdict === "object" ? verdict.deny : AgentLoop.unjudged };
    this.#toolCalls += 1;
    return LoopToolOutput.clipped(await this.#port.tools.callAs(this.#account, call, { allow: this.#request.allow }));
  }

  #taintBy(result: AgentWireToolResult) {
    if (!this.#tainted && this.#request.untrusted?.(result)) this.#tainted = true;
  }

  async #append(message: AgentWireMessage) {
    this.#messages.push(message);
    await this.#request.onMessage?.(message);
  }

  #haltStop(): AgentLoopStop | null {
    return this.#signal.aborted ? (this.#haltedBy(null) ?? "aborted") : null;
  }

  #idleStop(): AgentLoopStop | null {
    const last = this.#messages.at(-1);
    return !last || (last.role === "assistant" && !last.toolCalls?.length) ? "end" : null;
  }

  #budgetStop(): AgentLoopStop | null {
    const { tokens } = this.#request.budget ?? {};
    return tokens !== undefined && this.#tokens >= tokens ? "budget" : null;
  }

  #callBudgetStop(): AgentLoopStop | null {
    const { toolCalls } = this.#request.budget ?? {};
    return toolCalls !== undefined && this.#toolCalls >= toolCalls ? "budget" : null;
  }

  #haltedBy(error: unknown): AgentLoopStop | null {
    if (this.#request.signal?.aborted) return "aborted";
    if (this.#halt.signal.aborted) return this.#halt.signal.reason === AgentLoop.#wall ? "budget" : "aborted";
    if (Err.is(error, "agent.error.quotaExceeded")) return "quota";
    return null;
  }
}
