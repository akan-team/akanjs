import { AgentAbort } from "./AgentAbort";
import { AgentProgress, type AgentProgressReport } from "./AgentProgress";
import { ToolOutput } from "./ToolOutput";
import type {
  SurfaceView,
  ToolActivity,
  ToolCallRequest,
  ToolCallResult,
  ToolCard,
  ToolCardEntry,
  ToolEntry,
} from "./types";

export interface ToolApprovalRequest {
  callId: string;
  name: string;
  args: Record<string, unknown>;
  /** What the user is asked, already resolved from the entry's `confirm`. */
  message: string;
}

/** A call whose answer the user writes, handed to the host with the component its declaration named. */
export interface ToolCardRequest {
  callId: string;
  name: string;
  args: Record<string, unknown>;
  render: ToolCard;
}

/** What the card settled on: the value the model reads back, or why there is none. */
export type ToolCardAnswer = { result: unknown } | { error: string };

/** `report` is `null` once the call is over, carrying the id so a host can ignore a clear that is not its own. */
export interface ToolProgress {
  callId: string;
  report: AgentProgressReport | null;
}

/**
 * What a consumer of the runner has to answer for. Every field is optional and every omission is a narrowing,
 * never a widening: a host that cannot ask the user refuses the calls that need asking.
 */
export interface ToolRunnerHost {
  /**
   * Parks the call until the user decides — `true` runs it, a string is the refusal the model reads.
   *
   * Omitting it does **not** run the tool unasked. A tool reaches this only when its own declaration said a
   * person has to agree first (`confirm`, or a `remove*` name), so a host with nowhere to render the question is
   * a host that may not perform the action, and the refusal says so rather than silently downgrading the gate.
   */
  approve?: (request: ToolApprovalRequest, signal: AbortSignal) => Promise<true | string>;
  /**
   * Parks the call until the user fills in the card its declaration named, and answers with what they submitted.
   *
   * Omitting it refuses those calls rather than running something in their place: a card tool has no function to
   * fall back to — the user *is* the implementation — so a host with nowhere to render one may not answer it.
   */
  card?: (request: ToolCardRequest, signal: AbortSignal) => Promise<ToolCardAnswer>;
  /**
   * Awaited after a tool that changed something and before its change report is taken. A surface is read
   * synchronously and a screen does not settle synchronously, so without this the report describes the moment
   * before the change landed.
   */
  settle?: () => Promise<void> | void;
  progress?: (progress: ToolProgress) => void;
  /**
   * That a call is running, for a host drawing it on the page rather than in a transcript. Separate from
   * `progress`, which only ever fires for a tool that chose to report: a call the user has to be told about is
   * every call, and one that says nothing about itself is exactly the one whose effect arrives unexplained.
   *
   * **The `start` is awaited**, so a host may draw something that has to land before the call does — a pointer
   * pressing the link a `navigate` is about to follow is drawing on an element the router would otherwise have
   * replaced first. The host owns the deadline: a decoration that takes its time makes the agent take its time.
   */
  activity?: (event: ToolActivity) => void | Promise<void>;
  /**
   * Answers a name the surface does not carry — where a consumer puts a built-in of its own. Reached only after
   * the surface came up empty, so a registered tool of the same name shadows it.
   */
  fallback?: (call: ToolCallRequest, signal: AbortSignal) => Promise<ToolCallResult> | ToolCallResult;
}

/**
 * One tool call, start to finish: look the name up, gate it on the user, run it, wait for the screen, report what
 * changed, and bound what all of that may add to a transcript.
 *
 * It lives apart from `AgentSession` because the pipeline is not the conversation's — the same six steps have to
 * happen for any caller that drives this surface, and the steps that can be skipped are the ones that must not
 * be: an approval, a settle, a change report and an output ceiling are each invisible by absence. A second
 * consumer assembling them again would not fail, it would quietly do less, which is how the session and a zone
 * came to disagree about which options they honoured.
 */
export class ToolRunner {
  /**
   * Tool execution is serialized across every runner in the page, because `AgentAbort` and `AgentProgress` reach
   * the running call through a module slot rather than a parameter — two calls in flight restore each other's
   * slot and the second one's progress goes nowhere. Two agents on one screen (a zone and the root chat) are
   * already two callers, so the invariant those slots assume has to be kept somewhere they both pass through.
   *
   * A call that neither settles nor aborts holds the queue; every consumer races the call against its own abort
   * signal, and an abort releases it. Approval waits outside the queue on purpose — a question parked in front of
   * the user is not work, and holding the lock across it would let one agent's unanswered card freeze the other's.
   */
  static #queue: Promise<void> = Promise.resolve();

  readonly #surface: SurfaceView;
  readonly #host: ToolRunnerHost;

  constructor(surface: SurfaceView, host: ToolRunnerHost = {}) {
    this.#surface = surface;
    this.#host = host;
  }

  /** Never throws: a refused guard, a declined approval and an unknown name are all results the model reads. */
  async run(call: ToolCallRequest, signal: AbortSignal): Promise<ToolCallResult> {
    // Bounded here, at the one place a tool's answer is produced, because from here on it rides every later turn.
    return ToolOutput.clipped(await this.#answer(call, signal));
  }

  async #answer(call: ToolCallRequest, signal: AbortSignal): Promise<ToolCallResult> {
    const base = { id: call.id, name: call.name };
    const entry = this.#surface.tool(call.name);
    if (!entry) {
      const fallback = this.#host.fallback;
      return fallback ? await fallback(call, signal) : { ...base, error: `Unknown tool: ${call.name}` };
    }
    if (entry.card) return await this.#carded(call, entry, signal);
    const message = ToolRunner.confirmMessage(call.name, entry, call.args);
    if (message) {
      const approve = this.#host.approve;
      if (!approve)
        return { ...base, error: `${call.name} needs the user's approval, and nothing here can ask them for it.` };
      const approved = await approve({ callId: call.id, name: call.name, args: call.args, message }, signal);
      if (approved !== true) return { ...base, error: approved };
    }
    return await ToolRunner.#serialized(() => this.#execute(call, entry, message, signal));
  }

  /**
   * A call the user answers. It waits **outside** the serialization queue, for the reason an approval does: a card
   * parked in front of somebody is not work, and holding the lock across it would let one agent's unanswered form
   * freeze every other agent on the page.
   *
   * The screen is still snapshotted around the wait, because a card that writes what it collected into a store is
   * the ordinary case and the model has to be told what moved. Nothing is drawn through `activity` — that draws a
   * call landing *on* the page, and this one lands in the chat.
   */
  async #carded(call: ToolCallRequest, entry: ToolCardEntry, signal: AbortSignal): Promise<ToolCallResult> {
    const base = { id: call.id, name: call.name };
    const verdict = entry.guard?.(call.args) ?? true;
    if (verdict !== true) return { ...base, error: verdict };
    const ask = this.#host.card;
    if (!ask) return { ...base, error: `${call.name} is answered by the user, and nothing here can ask them.` };
    const before = this.#surface.snapshot();
    const answered = await ask({ callId: call.id, name: call.name, args: call.args, render: entry.card }, signal);
    if ("error" in answered) return { ...base, error: answered.error };
    if (entry.settle !== false) await this.#host.settle?.();
    const changes = this.#surface.diffSince(before);
    return {
      ...base,
      ...(answered.result !== undefined ? { result: answered.result } : {}),
      ...(changes.length ? { changes } : {}),
    };
  }

  async #execute(
    call: ToolCallRequest,
    entry: ToolEntry,
    message: string | null,
    signal: AbortSignal,
  ): Promise<ToolCallResult> {
    const base = { id: call.id, name: call.name };
    //? Aborted while it queued behind another call: past this point the work starts, and an abort only stops waiting.
    if (signal.aborted) return { ...base, error: "The call was stopped before it ran." };
    if (!this.#stillDecided(call, entry, message)) return { ...base, error: ToolRunner.#movedError(call.name) };
    const before = this.#surface.snapshot();
    // Here rather than in `#answer`, so nothing is drawn for a call an approval or a guard turned back.
    await this.#host.activity?.({ callId: call.id, name: call.name, args: call.args, phase: "start" });
    let failed: string | undefined;
    try {
      //? Again past the awaited start, in the tick of `surface.call`'s own lookup, so nothing re-registers between.
      if (!this.#stillDecided(call, entry, message)) throw new Error(ToolRunner.#movedError(call.name));
      const result = await AgentAbort.run(signal, () =>
        AgentProgress.run(
          (report) => this.#host.progress?.({ callId: call.id, report }),
          () => ToolRunner.raced(this.#surface.call(call.name, call.args), signal),
        ),
      );
      // A read returns what is already there; anything else may still be landing, and a report taken now would
      // describe the screen as it was one tick before the call.
      if (entry.settle !== false) await this.#host.settle?.();
      const changes = this.#surface.diffSince(before);
      return {
        ...base,
        ...(result !== undefined ? { result } : {}),
        ...(changes.length ? { changes } : {}),
      };
    } catch (error) {
      failed = error instanceof Error ? error.message : String(error);
      return { ...base, error: failed };
    } finally {
      this.#host.progress?.({ callId: call.id, report: null });
      this.#host.activity?.({
        callId: call.id,
        name: call.name,
        args: call.args,
        phase: "end",
        ...(failed ? { error: failed } : {}),
      });
    }
  }

  /**
   * A consent covers the action the user read. Another registration of that declaration — one per row of a list — is
   * the same action; anything else the screen put under the name since may not run in its place, asked or not.
   */
  #stillDecided(call: ToolCallRequest, decided: ToolEntry, message: string | null) {
    const shown = this.#surface.tool(call.name);
    return (
      !!shown &&
      !shown.card &&
      shown.description === decided.description &&
      JSON.stringify(shown.parameters) === JSON.stringify(decided.parameters) &&
      ToolRunner.confirmMessage(call.name, shown, call.args) === message
    );
  }

  static #movedError(name: string) {
    return `${name} changed on screen before it ran, so it did not run.`;
  }

  static #serialized<T>(work: () => Promise<T>): Promise<T> {
    const run = ToolRunner.#queue.then(work);
    ToolRunner.#queue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  /**
   * The call, or the abort — whichever lands first.
   *
   * A tool is handed the signal through `AgentAbort` and may stop itself, but nothing obliges it to, and a tool
   * that waits on a two-minute job is exactly the one a user reaches for Stop during. Without this race the
   * caller stays parked inside the call for those two minutes with the chat still showing a turn in flight.
   *
   * The losing promise is left running rather than cancelled: the work is usually a job a server is already
   * doing, and throwing away a result that is about to land helps nobody. Both of its outcomes are handled here,
   * so a late failure settles nothing instead of surfacing as an unhandled rejection.
   */
  static raced<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const onAbort = () => reject(new Error("The user aborted the turn."));
      work.then(
        (value) => {
          signal.removeEventListener("abort", onAbort);
          resolve(value);
        },
        (error: unknown) => {
          signal.removeEventListener("abort", onAbort);
          reject(error instanceof Error ? error : new Error(String(error)));
        },
      );
      if (signal.aborted) onAbort();
      else signal.addEventListener("abort", onAbort, { once: true });
    });
  }

  /** `null` when this call needs no asking — an absent `confirm`, or one that decided against it per arguments. */
  static confirmMessage(name: string, entry: ToolEntry, args: Record<string, unknown>): string | null {
    const confirm = entry.confirm;
    if (confirm === undefined || confirm === false) return null;
    if (typeof confirm === "string") return confirm;
    const verdict = confirm === true ? true : confirm(args);
    if (verdict === false) return null;
    return verdict === true ? `Run ${name}?` : verdict;
  }
}
