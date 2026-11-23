import type { CodeAgentQuestion } from "akanjs/common";

// A question is a single slot (asking ends the turn); approvals queue, since two can arrive within one turn.
// Idempotent by id: a second tab, or an answer after a refresh, for an already resolved id is ignored.
export class CodeAgentAsks {
  #question: { question: CodeAgentQuestion; deferred: PromiseWithResolvers<string> } | undefined;
  readonly #approvals = new Map<string, PromiseWithResolvers<boolean>>();
  #nextId = 0;
  //* Ids outlive the process on a suspending session, so a resumed worker must not hand out `q1` a second time.
  readonly #epoch = Date.now().toString(36);

  get pendingQuestionId() {
    return this.#question?.question.questionId;
  }

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
    // Replaces a pending question: its turn is gone, and leaving it unresolved would strand its caller.
    this.#question?.deferred.resolve("");
    const deferred = Promise.withResolvers<string>();
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
    const deferred = Promise.withResolvers<boolean>();
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
}
