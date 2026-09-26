import type { CodeAgentQuestion } from "akanjs/common";

interface Deferred<T> {
  resolve: (value: T) => void;
  promise: Promise<T>;
}

/**
 * Holds what the agent is waiting on a person for.
 *
 * A question is a **single slot**: asking one ends the turn, so a second cannot exist. An approval is a
 * **queue**: "may I write this file" naturally arrives twice in a row while a turn is still running, and a
 * single slot would drop the second silently.
 *
 * Idempotency is by id. Two browser tabs, or answering after a refresh, both produce a second answer for an id
 * that is already resolved — which must be ignored rather than applied to whatever is pending now.
 */
export class CodeAgentAsks {
  #question: { question: CodeAgentQuestion; deferred: Deferred<string> } | undefined;
  readonly #approvals = new Map<string, Deferred<boolean>>();
  #nextId = 0;
  //* Ids outlive the process on a suspending session, so a resumed worker must not hand out `q1` a second time.
  readonly #epoch = Date.now().toString(36);

  get pendingQuestionId() {
    return this.#question?.question.questionId;
  }

  /** The open question, so an answer can be rendered against the options it was asked with. */
  questionOf(questionId: string) {
    return this.#question?.question.questionId === questionId ? this.#question.question : undefined;
  }

  get hasPendingApproval() {
    return this.#approvals.size > 0;
  }

  nextId(prefix: string) {
    this.#nextId += 1;
    return `${prefix}${this.#epoch}.${this.#nextId}`;
  }

  openQuestion(question: CodeAgentQuestion) {
    // A question opened while one is already pending replaces it: the old turn is gone, so nobody is left to
    // receive the old answer, and leaving it would strand the caller forever.
    this.#question?.deferred.resolve("");
    const deferred = CodeAgentAsks.#defer<string>();
    this.#question = { question, deferred };
    return deferred.promise;
  }

  answer(id: string, text: string) {
    if (this.#question?.question.questionId !== id) return false;
    const { deferred } = this.#question;
    this.#question = undefined;
    deferred.resolve(text);
    return true;
  }

  openApproval(id: string) {
    const deferred = CodeAgentAsks.#defer<boolean>();
    this.#approvals.set(id, deferred);
    return deferred.promise;
  }

  resolveApproval(id: string, approved: boolean) {
    const deferred = this.#approvals.get(id);
    if (!deferred) return false;
    this.#approvals.delete(id);
    deferred.resolve(approved);
    return true;
  }

  /** Every pending ask dies with its turn — an approval outlives nothing, and a question is reopened on resume. */
  clear() {
    this.#question?.deferred.resolve("");
    this.#question = undefined;
    for (const deferred of this.#approvals.values()) deferred.resolve(false);
    this.#approvals.clear();
  }

  static #defer<T>(): Deferred<T> {
    let resolve: (value: T) => void = () => {};
    const promise = new Promise<T>((r) => {
      resolve = r;
    });
    return { resolve, promise };
  }
}
