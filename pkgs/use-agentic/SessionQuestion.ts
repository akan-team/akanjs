import type { PendingQuestion } from "./AgentSession";
import { Transcript } from "./Transcript";
import type { ChatMessage, ToolCallRequest, ToolCallResult } from "./types";

type Settled = { result: string | string[] } | { error: string };
type Asked = Pick<PendingQuestion, "question" | "choices" | "multiple">;

export class SessionQuestion {
  static readonly toolName = "askUser";
  static readonly dismissed = "The user dismissed the question without answering it.";

  readonly #changed: () => void;
  #pending: PendingQuestion | null = null;

  constructor(changed: () => void) {
    this.#changed = changed;
  }

  get pending(): PendingQuestion | null {
    return this.#pending;
  }

  clear() {
    this.#pending = null;
  }

  /** No surface call and so no diff to report: the only thing this changes is what the model knows. */
  async ask(call: ToolCallRequest, signal: AbortSignal): Promise<ToolCallResult> {
    const base = { id: call.id, name: call.name };
    const asked = SessionQuestion.#asked(call);
    if (!asked) return { ...base, error: "askUser needs a question to ask." };
    return { ...base, ...(await this.wait(call.id, asked, signal)) };
  }

  wait(callId: string, asked: Asked, signal: AbortSignal): Promise<Settled> {
    return new Promise((resolve) => {
      const settle = (value: Settled) => {
        this.#pending = null;
        signal.removeEventListener("abort", onAbort);
        this.#changed();
        resolve(value);
      };
      const onAbort = () => settle({ error: "The user aborted the turn." });
      signal.addEventListener("abort", onAbort);
      this.#pending = {
        callId,
        ...asked,
        answer: (value) => settle({ result: value }),
        dismiss: (reason) => settle({ error: reason ?? SessionQuestion.dismissed }),
      };
      this.#changed();
    });
  }

  /**
   * Puts back a question a restored transcript ends on, which a run asked while no chat was open; settling it hands
   * the result to `resume` once, and a turn that starts first takes it down, leaving the call to the wire's closing.
   */
  reopen(messages: readonly ChatMessage[], resume: (result: ToolCallResult) => void) {
    const call = SessionQuestion.openCall(messages);
    const asked = call ? SessionQuestion.#asked(call) : null;
    if (!call || !asked) return;
    const settle = (value: Settled) => {
      if (this.#pending !== question) return;
      this.#pending = null;
      resume({ id: call.id, name: call.name, ...value });
    };
    const question: PendingQuestion = {
      callId: call.id,
      ...asked,
      answer: (value) => settle({ result: value }),
      dismiss: (reason) => settle({ error: reason ?? SessionQuestion.dismissed }),
    };
    this.#pending = question;
  }

  //? The first unanswered call of the last batch, if it asks something: a run parks there once the calls before it ran.
  static openCall(messages: readonly ChatMessage[]): ToolCallRequest | null {
    const last = messages.findLast((message) => message.role !== "tool" && Transcript.carries(message));
    if (last?.role !== "assistant") return null;
    const answered = new Set(messages.flatMap((message) => (message.toolResults ?? []).map((result) => result.id)));
    const call = last.toolCalls?.find((one) => !answered.has(one.id));
    return call?.name === SessionQuestion.toolName && SessionQuestion.#asked(call) ? call : null;
  }

  static #asked({ args }: ToolCallRequest): Asked | null {
    const question = typeof args.question === "string" ? args.question.trim() : "";
    if (!question) return null;
    // Deduped and trimmed because the answer is the choice's own text — two identical options cannot be told apart.
    const choices = [
      ...new Set(
        (Array.isArray(args.choices) ? args.choices : [])
          .filter((choice): choice is string => typeof choice === "string")
          .map((choice) => choice.trim())
          .filter(Boolean),
      ),
    ];
    return { question, choices, multiple: args.multiple === true && choices.length > 1 };
  }
}
