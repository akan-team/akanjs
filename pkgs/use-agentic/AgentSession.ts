import { AgentAbort } from "./AgentAbort";
import { AgentProgress, type AgentProgressReport } from "./AgentProgress";
import { Compaction, type CompactOptions } from "./Compaction";
import { ToolOutput } from "./ToolOutput";
import { Transcript } from "./Transcript";
import type {
  AgentRunner,
  ChatMessage,
  ContextBlock,
  PublishedTool,
  RunnerRequest,
  SurfaceView,
  ToolCallRequest,
  ToolCallResult,
  ToolEntry,
} from "./types";

export interface PendingApproval {
  callId: string;
  name: string;
  args: Record<string, unknown>;
  message: string;
  approve: () => void;
  reject: (reason?: string) => void;
}

/**
 * A decision the agent handed back to the user mid-turn. The loop is parked on it until it settles, exactly as it
 * parks on an approval. `choices` is empty for a free-text ask, and `multiple` never accompanies an empty one.
 */
export interface PendingQuestion {
  callId: string;
  question: string;
  choices: string[];
  multiple: boolean;
  answer: (value: string | string[]) => void;
  dismiss: (reason?: string) => void;
}

/**
 * Where a session keeps its transcript across page loads. Storage-neutral: the host decides what backs it, so a
 * server-side transcript is as legal as web storage — which is why every method may answer asynchronously. A
 * `load` still in flight when the user sends the first message is dropped rather than merged: the conversation
 * on screen is the one they are having, and splicing a restored one under it would rewrite what they just said.
 *
 * Which makes **sending on mount a race the restore loses** — an opening prompt fired from an effect beats the
 * fetch, and the user watches the conversation they came back to never arrive. Wait for `isRestoring` to clear,
 * or write the prompt into the composer and leave the send to them.
 */
export interface SessionHistory {
  load(): ChatMessage[] | null | Promise<ChatMessage[] | null>;
  save(messages: readonly ChatMessage[]): void | Promise<void>;
  clear(): void | Promise<void>;
}

export interface AgentSessionOptions {
  instructions?: string;
  buildContext?: (surface: SurfaceView) => ContextBlock[];
  /** Assistant turns per send before the session asks whether to keep going, or stops. */
  maxTurns?: number;
  /**
   * Restores settled messages at construction and saves after every change, debounced. Failures are silent, and
   * saves are chained rather than issued in parallel — an async host would otherwise land them out of order and
   * persist an older transcript last.
   */
  history?: SessionHistory;
  /**
   * Awaited after a tool that changed something and before its change report is taken. A surface is read
   * synchronously and a screen does not settle synchronously, so without this the report describes the moment
   * before the change landed. `ScreenSettle.wait` is what an akan app passes.
   */
  settle?: () => Promise<void> | void;
  /**
   * Turns the turn cap into a question instead of a dead end. Omitted, the cap fails as before — a host that
   * renders no `pendingQuestion` would otherwise wait forever for an answer nobody can give. Read per ask rather
   * than at construction, so the text follows a language switched mid-conversation.
   */
  continueAsk?: () => { question: string; keep: string };
  /**
   * Keeps a long conversation inside the model's window: past `at` estimated tokens the history above the last
   * few messages is replaced by one summary of itself, before the turn that would have overflowed is sent.
   */
  compact?: CompactOptions;
  /**
   * Fires after a compaction replaced `replaced` with `summary`. A host that keeps its own server-side summary
   * uses it to move its watermark to the same cut, so the two do not summarize the same messages twice.
   *
   * It matters most to a host whose watermark is a *position*: compaction shrinks the transcript in place, so a
   * "sync everything past index N" scheme silently stops syncing once N is past the shortened array — no
   * duplicate, no error, just messages that never reach the server. Reset the mark here.
   */
  onCompact?: (replaced: readonly ChatMessage[], summary: ChatMessage) => void;
}

/**
 * The client-side conversation loop: send → model turn → tool calls → approval gate → execute → report diffs → next
 * turn. The loop lives here rather than on a server because the tools do — the runner is one stateless model turn,
 * so any backend that answers it works and none has to hold a session.
 *
 * Failures land in the transcript instead of being thrown past it: a refused guard, a rejected approval, and an
 * unknown tool are all things the agent did, and the model reads them as tool results the same way a person reads
 * them in the chat.
 */
export class AgentSession {
  /**
   * The one built-in the session owns instead of the surface: the answer comes from the conversation, not the
   * screen, so every host that renders `pendingQuestion` gets it and a zone agent asks inside its own transcript.
   * A surface tool of this name shadows it, like any other built-in.
   */
  static readonly askUserTool: PublishedTool = {
    name: "askUser",
    description:
      "Ask the user to decide something that is theirs to decide — an ambiguous request, a missing value, a choice between paths. Use it instead of guessing. Pass `choices` to offer options, or omit them for a free-text answer; the user may answer off-list either way. Returns what they chose or wrote, and errors if they dismiss it.",
    parameters: {
      type: "object",
      properties: {
        question: { type: "string", description: "What to ask, in one sentence." },
        choices: { type: "array", items: { type: "string" }, description: "The options to offer, as short labels." },
        multiple: { type: "boolean", description: "Let the user pick several choices. Ignored without choices." },
      },
      required: ["question"],
      additionalProperties: false,
    },
    needsConfirm: false,
  };

  readonly #surface: SurfaceView;
  readonly #runner: AgentRunner;
  readonly #options: AgentSessionOptions;
  #messages: ChatMessage[] = [];
  #running = false;
  #pending: PendingApproval | null = null;
  #question: PendingQuestion | null = null;
  #progress: (AgentProgressReport & { callId: string }) | null = null;
  #controller: AbortController | null = null;
  #active: Promise<void> | null = null;
  #version = 0;
  #listeners = new Set<() => void>();
  #saveTimer: ReturnType<typeof setTimeout> | null = null;
  #saving: Promise<unknown> = Promise.resolve();
  #restoring = false;
  // Mutable rather than read off `#options`: both can be attached after construction, which is what lets a zone
  // be assembled by a server component and still keep its transcript where the app keeps it.
  #history: SessionHistory | undefined;
  #onCompact: AgentSessionOptions["onCompact"];
  #compacting = false;
  /** Size below which auto-compaction stays out of the way, raised when a summary failed to shrink anything. */
  #compactFloor = 0;

  constructor(surface: SurfaceView, runner: AgentRunner, options: AgentSessionOptions = {}) {
    this.#surface = surface;
    this.#runner = runner;
    this.#options = options;
    this.#history = options.history;
    this.#onCompact = options.onCompact;
    const restored = AgentSession.#restored(options.history);
    if (Array.isArray(restored)) this.#messages = restored;
    else {
      this.#restoring = true;
      void this.#hydrate(restored);
    }
  }

  /**
   * True while an async `history.load()` is still in flight — the transcript is empty but not yet known to be.
   * A host that opens with a prompt of its own waits for this before sending, or the restore loses the race.
   */
  get isRestoring() {
    return this.#restoring;
  }

  get surface(): SurfaceView {
    return this.#surface;
  }

  get messages(): readonly ChatMessage[] {
    return this.#messages;
  }

  get isRunning() {
    return this.#running;
  }

  /**
   * True while the conversation is summarizing itself. Distinct from `isRunning`, which an auto-compaction runs
   * inside: the summarizing turn answers nothing the user asked for and takes as long as a model turn, so a chat
   * that only says "running" reads as a question being ignored.
   */
  get isCompacting() {
    return this.#compacting;
  }

  get pendingApproval(): PendingApproval | null {
    return this.#pending;
  }

  get pendingQuestion(): PendingQuestion | null {
    return this.#question;
  }

  /** What the tool running now last said about its own progress, for the row that is still spinning. */
  get progress(): (AgentProgressReport & { callId: string }) | null {
    return this.#progress;
  }

  /** Bumped on every change, so a store binding can use it as the snapshot. */
  get version() {
    return this.#version;
  }

  subscribe = (listener: () => void) => {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  };

  /** A user's text, or prewritten messages — how a host injects a prompt's result as the user's turn. */
  send = async (input: string | ChatMessage[]) => {
    if (this.#running) throw new Error("A turn is already running.");
    this.#running = true;
    const run = this.#turn(input);
    this.#active = run;
    await run;
  };

  async #turn(input: string | ChatMessage[]) {
    const controller = new AbortController();
    this.#controller = controller;
    if (typeof input === "string") this.#append({ role: "user", text: input });
    else for (const message of input) this.#append(message);
    const maxTurns = this.#options.maxTurns ?? 8;
    try {
      let budget = maxTurns;
      for (let turn = 0; ; turn += 1) {
        if (controller.signal.aborted) return;
        if (turn >= budget) {
          // The cap is a guess about when a loop has gone wrong, and the user is the one who can tell. The answer
          // rides as a user message, so a steer typed instead of the keep-going choice reaches the model as one.
          const answer = await this.#askToContinue(turn, controller.signal);
          if (answer === null) {
            this.#fail(`Stopped after ${turn} assistant turns without a final answer.`);
            return;
          }
          this.#append({ role: "user", text: answer });
          budget = turn + maxTurns;
        }
        await this.#autoCompact(controller.signal);
        const { toolCalls, stop } = await this.#assistantTurn(controller.signal);
        // Stop can land after the calls were recorded and before any of them ran. They are answered rather than
        // dropped: an unanswered call is the one shape every provider dialect refuses, and the transcript this
        // turn leaves behind is what the next one posts.
        if (controller.signal.aborted) {
          this.#unanswered(toolCalls);
          return;
        }
        if (stop !== "toolUse" || !toolCalls.length) return;
        const toolResults: ToolCallResult[] = [];
        for (const call of toolCalls)
          toolResults.push(
            controller.signal.aborted
              ? { id: call.id, name: call.name, error: Transcript.unanswered }
              : // Bounded here, at the one place every tool's answer enters the transcript, because from here on it
                // rides every later turn as well.
                ToolOutput.clipped(await this.#execute(call, controller.signal)),
          );
        this.#append({ role: "tool", toolResults });
      }
    } catch (error) {
      if (!controller.signal.aborted) this.#fail(error instanceof Error ? error.message : String(error));
    } finally {
      this.#running = false;
      this.#controller = null;
      this.#active = null;
      this.#pending = null;
      this.#question = null;
      this.#progress = null;
      this.#notify();
    }
  }

  abort = () => {
    this.#controller?.abort();
  };

  /**
   * Empties the transcript and the persisted history, ending a turn that is still running. Awaiting the abort
   * matters: the loop settles in its own `finally`, a microtask later, and a transcript emptied before that lands
   * is one the winding-down turn appends onto. The returned promise waits for the history to clear too.
   */
  reset = async () => {
    if (this.#active) {
      this.#controller?.abort();
      await this.#active;
    }
    this.#messages = [];
    this.#compactFloor = 0;
    // The pending debounced save would re-create the entry clear() just removed.
    if (this.#saveTimer) {
      clearTimeout(this.#saveTimer);
      this.#saveTimer = null;
    }
    const history = this.#history;
    if (history) {
      // Chained behind the pending saves so a clear can never be overtaken by one queued before it, and awaited
      // so the returned promise means what it says: an async host has cleared by the time this resolves.
      this.#saving = this.#saving.then(() => history.clear()).catch(() => undefined);
      await this.#saving;
    }
    this.#version += 1;
    for (const listener of this.#listeners) listener();
  };

  /**
   * Attaches a transcript store to a session built without one — what `Agent.History` mounts, so a zone can be
   * assembled by a server component and still keep its transcript wherever the app keeps it. `null` detaches.
   *
   * Restoring follows the rule an async `load` already follows: it lands only while nothing has happened to this
   * session yet. Attach before the first turn and it restores; attach after and it saves from there on, with the
   * store never asked for a transcript that would be discarded. One rule rather than a mount-order surprise.
   *
   * Returns the detach, which clears the slot only while this call's store is still the one in it.
   */
  setHistory = (history: SessionHistory | null) => {
    this.#history = history ?? undefined;
    if (history && this.#version === 0) {
      const restored = AgentSession.#restored(history);
      if (restored instanceof Promise) {
        this.#restoring = true;
        void this.#hydrate(restored);
      } else this.#restore(restored);
    }
    // Detaches only what this call installed. Whoever attached last owns the slot — another mount, or a host
    // taking it back — and an unmount that arrives after them must not silently stop their saving.
    return () => {
      if (history && this.#history === history) this.#history = undefined;
    };
  };

  /** The compaction hook as a setter, for the same reason `setHistory` is one: a host attaches it after the fact. */
  setOnCompact = (onCompact: AgentSessionOptions["onCompact"] | null) => {
    this.#onCompact = onCompact ?? undefined;
    return () => {
      if (onCompact && this.#onCompact === onCompact) this.#onCompact = undefined;
    };
  };

  /**
   * Re-runs the last user message, dropping what the previous attempt produced. Turns fail for reasons that have
   * nothing to do with what was asked — a refused relay, a model that is unavailable — and retyping is otherwise the
   * only way back. Only the trailing message is replayed, so a prompt's own preamble stays where it is.
   */
  retry = async (): Promise<boolean> => {
    if (this.#active) return false;
    const at = this.#messages.findLastIndex(
      // A summary wears the user's role but is history, not an ask: replaying it would send the notes as a question.
      (message) => message.role === "user" && !message.summary && (!!message.text || !!message.attachments?.length),
    );
    if (at < 0) return false;
    const again = this.#messages[at];
    this.#messages = this.#messages.slice(0, at);
    await this.send([again]);
    return true;
  };

  /**
   * Replaces the history with one summary of itself and returns whether anything was replaced. `keep` leaves that
   * many trailing messages verbatim; the command that a user types keeps none, because a summary of everything is
   * what they asked for. A turn in flight refuses — the transcript it is appending to is not one to rewrite.
   */
  compact = async ({ keep = 0 }: { keep?: number } = {}): Promise<boolean> => {
    if (this.#running) return false;
    const controller = new AbortController();
    this.#controller = controller;
    this.#running = true;
    // Summarizing is a model turn like any other, so the chat shows it as one — and Stop reaches it.
    this.#notify();
    const run = this.#compact(keep, controller.signal);
    // Swallowed on this branch only: `reset` awaits `#active` to let a dying run finish, and a rejection there
    // would come out of `/new` instead of out of the caller below, which is the one that reports it.
    this.#active = run.then(
      () => undefined,
      () => undefined,
    );
    try {
      return await run;
    } catch (error) {
      // Stop is not a failure — the loop records nothing for an aborted turn either.
      if (controller.signal.aborted) return false;
      throw error;
    } finally {
      this.#running = false;
      this.#controller = null;
      this.#active = null;
      this.#notify();
    }
  };

  /** What the transcript is estimated to cost the next turn, in tokens — the number auto-compaction watches. */
  get tokens() {
    return Compaction.tokensOf(this.#messages);
  }

  /** Records a host-side failure (a prompt fetch, an upload) in the transcript, where every other failure lands. */
  report = (error: string) => {
    this.#append({ role: "assistant", error });
  };

  /** A line the host wrote — a command's own output. Rendered in the transcript, withheld from the model. */
  note = (text: string) => {
    this.#append({ role: "assistant", text, local: true });
  };

  async #compact(keep: number, signal: AbortSignal): Promise<boolean> {
    const at = Compaction.cutAt(this.#messages, keep);
    if (at <= 0) return false;
    this.#compacting = true;
    this.#notify();
    try {
      const summary = (await this.#summarize(Compaction.digest(this.#messages.slice(0, at)), signal)).trim();
      if (!summary || signal.aborted) return false;
      const replaced = this.#messages.slice(0, at);
      const message = Compaction.message(summary);
      this.#messages = [message, ...this.#messages.slice(at)];
      try {
        this.#onCompact?.(replaced, message);
      } catch {
        // A host that fails to record the cut does not undo one the transcript has already taken.
      }
      return true;
    } finally {
      this.#compacting = false;
      this.#notify();
    }
  }

  /**
   * Runs before the turn that would have overflowed rather than after it fails: the provider answers a request
   * that is too long with a refusal, not with a shorter answer, so there is nothing to recover from afterwards.
   * Best effort — a summary that cannot be produced leaves the transcript as it stands and the turn goes out as
   * it would have, since it may well still fit.
   */
  async #autoCompact(signal: AbortSignal) {
    const { at = Compaction.defaults.at, keep = Compaction.defaults.keep } = this.#options.compact ?? {};
    if (!at || Compaction.tokensOf(this.#messages) < Math.max(at, this.#compactFloor)) return;
    let compacted = false;
    try {
      compacted = await this.#compact(keep, signal);
    } catch (error) {
      // The floor is left where it is: a summarizer that was momentarily unreachable says nothing about whether
      // this transcript can shrink, and raising it would push the next attempt a whole threshold further out for
      // a turn that never ran.
      console.warn(`[use-agentic] compaction failed: ${error instanceof Error ? error.message : String(error)}`);
      return;
    }
    const after = Compaction.tokensOf(this.#messages);
    // A transcript still over the threshold after summarizing itself cannot shrink — one kept message is that
    // large — so the next attempt waits for another threshold's worth of growth rather than re-summarizing on
    // every turn. A summary that never landed is not that: retrying it costs one call, and never retrying it
    // costs the conversation.
    this.#compactFloor = compacted && after >= at ? after + at : 0;
  }

  /** No tools and no screen context: this turn summarizes the conversation, and must not act on it. */
  async #summarize(digest: string, signal: AbortSignal): Promise<string> {
    const custom = this.#options.compact?.summarize;
    if (custom) return await custom(digest, signal);
    let text = "";
    for await (const event of this.#runner.run({
      messages: [{ role: "user", text: digest }],
      tools: [],
      context: [],
      instructions: Compaction.instruction,
      signal,
    })) {
      if (event.type === "text") text += event.delta;
      else if (event.type === "error") throw new Error(event.message);
    }
    return text;
  }

  async #assistantTurn(signal: AbortSignal): Promise<{ toolCalls: ToolCallRequest[]; stop: "end" | "toolUse" }> {
    const { tools, guides } = this.#surface.snapshot();
    const instructions = [this.#options.instructions, ...guides].filter(Boolean).join("\n\n");
    const request: RunnerRequest = {
      messages: Transcript.wire(this.#messages),
      tools: tools.some((tool) => tool.name === AgentSession.askUserTool.name)
        ? tools
        : [...tools, AgentSession.askUserTool],
      context: this.#options.buildContext?.(this.#surface) ?? AgentSession.#defaultContext(this.#surface),
      ...(instructions ? { instructions } : {}),
      signal,
    };
    this.#append({ role: "assistant" });
    let text = "";
    const toolCalls: ToolCallRequest[] = [];
    let stop: "end" | "toolUse" = "end";
    for await (const event of this.#runner.run(request)) {
      if (signal.aborted) break;
      if (event.type === "text") {
        text += event.delta;
        this.#patchLast({ text });
      } else if (event.type === "toolCall") toolCalls.push({ id: event.id, name: event.name, args: event.args });
      else if (event.type === "done") stop = event.stop;
      else throw new Error(event.message);
    }
    if (toolCalls.length) this.#patchLast({ toolCalls });
    return { toolCalls, stop };
  }

  async #execute(call: ToolCallRequest, signal: AbortSignal): Promise<ToolCallResult> {
    const base = { id: call.id, name: call.name };
    const entry = this.#surface.tool(call.name);
    if (!entry) {
      if (call.name === AgentSession.askUserTool.name) return await this.#ask(call, signal);
      return { ...base, error: `Unknown tool: ${call.name}` };
    }
    const message = AgentSession.#confirmMessage(call.name, entry, call.args);
    if (message) {
      const approved = await this.#awaitApproval(call, message, signal);
      if (approved !== true) return { ...base, error: approved };
    }
    const before = this.#surface.snapshot();
    try {
      const result = await AgentAbort.run(signal, () =>
        AgentProgress.run(
          (report) => {
            this.#progress = { ...report, callId: call.id };
            this.#notify();
          },
          () => AgentSession.#raced(this.#surface.call(call.name, call.args), signal),
        ),
      );
      // A read returns what is already there; anything else may still be landing, and a report taken now would
      // describe the screen as it was one tick before the call.
      if (entry.settle !== false) await this.#options.settle?.();
      const changes = this.#surface.diffSince(before);
      return {
        ...base,
        ...(result !== undefined ? { result } : {}),
        ...(changes.length ? { changes } : {}),
      };
    } catch (error) {
      return { ...base, error: error instanceof Error ? error.message : String(error) };
    } finally {
      if (this.#progress?.callId === call.id) {
        this.#progress = null;
        this.#notify();
      }
    }
  }

  /** `null` when the user declined or no ask is configured: both mean stop and record why. */
  async #askToContinue(turns: number, signal: AbortSignal): Promise<string | null> {
    const ask = this.#options.continueAsk?.();
    if (!ask) return null;
    const settled = await this.#awaitAnswer(`continue-${turns}`, ask.question, [ask.keep], false, signal);
    if ("error" in settled) return null;
    return Array.isArray(settled.result) ? settled.result.join(", ") : settled.result;
  }

  /** No surface call and so no diff to report: the only thing this changes is what the model knows. */
  async #ask(call: ToolCallRequest, signal: AbortSignal): Promise<ToolCallResult> {
    const base = { id: call.id, name: call.name };
    const question = typeof call.args.question === "string" ? call.args.question.trim() : "";
    if (!question) return { ...base, error: "askUser needs a question to ask." };
    // Deduped and trimmed because the answer is the choice's own text — two identical options cannot be told apart.
    const choices = [
      ...new Set(
        (Array.isArray(call.args.choices) ? call.args.choices : [])
          .filter((choice): choice is string => typeof choice === "string")
          .map((choice) => choice.trim())
          .filter(Boolean),
      ),
    ];
    const multiple = call.args.multiple === true && choices.length > 1;
    return { ...base, ...(await this.#awaitAnswer(call.id, question, choices, multiple, signal)) };
  }

  #awaitAnswer(
    callId: string,
    question: string,
    choices: string[],
    multiple: boolean,
    signal: AbortSignal,
  ): Promise<{ result: string | string[] } | { error: string }> {
    return new Promise((resolve) => {
      const settle = (value: { result: string | string[] } | { error: string }) => {
        this.#question = null;
        signal.removeEventListener("abort", onAbort);
        this.#notify();
        resolve(value);
      };
      const onAbort = () => settle({ error: "The user aborted the turn." });
      signal.addEventListener("abort", onAbort);
      this.#question = {
        callId,
        question,
        choices,
        multiple,
        answer: (value) => settle({ result: value }),
        dismiss: (reason) => settle({ error: reason ?? "The user dismissed the question without answering it." }),
      };
      this.#notify();
    });
  }

  #awaitApproval(call: ToolCallRequest, message: string, signal: AbortSignal): Promise<true | string> {
    return new Promise((resolve) => {
      const settle = (value: true | string) => {
        this.#pending = null;
        signal.removeEventListener("abort", onAbort);
        this.#notify();
        resolve(value);
      };
      const onAbort = () => settle("The user aborted the turn.");
      signal.addEventListener("abort", onAbort);
      this.#pending = {
        callId: call.id,
        name: call.name,
        args: call.args,
        message,
        approve: () => settle(true),
        reject: (reason) => settle(reason ?? "The user declined."),
      };
      this.#notify();
    });
  }

  /**
   * The call, or the abort — whichever lands first.
   *
   * A tool is handed the signal through `AgentAbort` and may stop itself, but nothing obliges it to, and a tool
   * that waits on a two-minute job is exactly the one a user reaches for Stop during. Without this race the loop
   * stays parked inside the call for those two minutes with the chat still showing a turn in flight.
   *
   * The losing promise is left running rather than cancelled: the work is usually a job a server is already
   * doing, and throwing away a result that is about to land helps nobody. Both of its outcomes are handled here,
   * so a late failure settles nothing instead of surfacing as an unhandled rejection.
   */
  static #raced<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
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

  static #confirmMessage(name: string, entry: ToolEntry, args: Record<string, unknown>): string | null {
    const confirm = entry.confirm;
    if (confirm === undefined || confirm === false) return null;
    if (typeof confirm === "string") return confirm;
    const verdict = confirm === true ? true : confirm(args);
    if (verdict === false) return null;
    return verdict === true ? `Run ${name}?` : verdict;
  }

  static #defaultContext(surface: SurfaceView): ContextBlock[] {
    const { resources, scopes } = surface.snapshot();
    return [
      ...(scopes.length ? [{ kind: "screen", scopes }] : []),
      ...(resources.length ? [{ kind: "resources", resources }] : []),
    ];
  }

  /** Closes the calls a stopped turn never ran, so the pairing every provider dialect requires still holds. */
  #unanswered(calls: ToolCallRequest[]) {
    if (!calls.length) return;
    this.#append({
      role: "tool",
      toolResults: calls.map((call) => ({ id: call.id, name: call.name, error: Transcript.unanswered })),
    });
  }

  /** Recorded on the open assistant draft when there is one, so a failed turn reads as that turn failing. */
  #fail(message: string) {
    const last = this.#messages[this.#messages.length - 1];
    if (last?.role === "assistant" && !last.error) this.#patchLast({ error: message });
    else this.#append({ role: "assistant", error: message });
  }

  #append(message: ChatMessage) {
    this.#messages = [...this.#messages, message];
    this.#notify();
  }

  #patchLast(patch: Partial<ChatMessage>) {
    const last = this.#messages[this.#messages.length - 1];
    if (!last) return;
    this.#messages = [...this.#messages.slice(0, -1), { ...last, ...patch }];
    this.#notify();
  }

  #notify() {
    this.#version += 1;
    for (const listener of this.#listeners) listener();
    this.#schedulePersist();
  }

  /** Debounced: streaming patches the last message on every delta, and a save per delta would thrash storage. */
  #schedulePersist() {
    const history = this.#history;
    if (!history) return;
    if (this.#saveTimer) clearTimeout(this.#saveTimer);
    this.#saveTimer = setTimeout(() => {
      this.#saveTimer = null;
      // Chained, not fired: an async host save issued per change would race, and the loser writing last would
      // persist the older transcript. Reading `#messages` at run time also collapses a queued pair into one save.
      this.#saving = this.#saving.then(() => history.save(this.#messages)).catch(() => undefined);
    }, 300);
  }

  /** Sync for the storage case, a promise for a host that fetches — the constructor takes whichever it gets. */
  static #restored(history: SessionHistory | undefined): ChatMessage[] | Promise<ChatMessage[]> {
    if (!history) return [];
    try {
      const messages = history.load();
      if (messages instanceof Promise) return messages.then(AgentSession.#settled, () => []);
      return AgentSession.#settled(messages);
    } catch {
      return [];
    }
  }

  static #settled(messages: ChatMessage[] | null): ChatMessage[] {
    // A reload mid-turn leaves both an assistant draft that never settled and calls nothing answered.
    return Array.isArray(messages) ? Transcript.sanitize(messages) : [];
  }

  /**
   * Lands an async restore, and only into a session nothing has happened to yet: `#version` is still 0 exactly
   * while the transcript is untouched, so a user who sent a message — or cleared the chat — during the fetch keeps
   * what they did. Notifies by hand rather than through `#notify`, which would save the transcript it just loaded.
   */
  async #hydrate(pending: Promise<ChatMessage[]>) {
    let restored: ChatMessage[] = [];
    try {
      restored = await pending;
    } catch {
      // History is best-effort; a transcript that cannot be fetched leaves the chat starting empty.
    }
    this.#restoring = false;
    this.#restore(restored);
  }

  /**
   * Lands a restore under the one rule — only into a session nothing has happened to yet — and notifies either
   * way, because `isRestoring` may have turned over with it. Notifies by hand rather than through `#notify`,
   * which would save the transcript it has just loaded.
   */
  #restore(restored: ChatMessage[]) {
    if (this.#version === 0 && restored.length) this.#messages = restored;
    this.#version += 1;
    for (const listener of this.#listeners) listener();
  }
}
