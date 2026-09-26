import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { CodeAgentApprovalRequest, CodeAgentQuestion } from "akanjs/common";

interface SuspendedState {
  question?: CodeAgentQuestion;
  approvals: CodeAgentApprovalRequest[];
}

/**
 * What a suspending profile is waiting on after its turn ended — the question it asked and the approvals it
 * parked. The turn is gone, so nothing in memory holds them; this does, and on a file-backed session it writes
 * them beside the session so a worker that restarts and resumes still knows what it asked.
 *
 * Taking an ask removes it, which is what makes an answer idempotent: a second tab or a retried frame finds
 * nothing to take and is refused instead of opening a second turn.
 */
export class CodeAgentSuspended {
  readonly #file: string | null;
  #state: SuspendedState;

  constructor(file: string | null) {
    this.#file = file;
    this.#state = CodeAgentSuspended.#read(file);
  }

  static fileOf(sessionDir: string | undefined, sessionId: string) {
    return sessionDir ? path.join(sessionDir, `${sessionId}.suspended.json`) : null;
  }

  get question() {
    return this.#state.question;
  }

  get approvals(): readonly CodeAgentApprovalRequest[] {
    return this.#state.approvals;
  }

  //* A new question replaces the old one: asking ends the turn, so the earlier question has nobody left to answer it.
  setQuestion(question: CodeAgentQuestion) {
    this.#state = { ...this.#state, question };
    this.#save();
  }

  addApproval(request: CodeAgentApprovalRequest) {
    this.#state = { ...this.#state, approvals: [...this.#state.approvals, request] };
    this.#save();
  }

  takeQuestion(questionId: string) {
    const question = this.#state.question;
    if (question?.questionId !== questionId) return undefined;
    this.#state = { approvals: this.#state.approvals };
    this.#save();
    return question;
  }

  takeApproval(approvalId: string) {
    const request = this.#state.approvals.find((approval) => approval.approvalId === approvalId);
    if (!request) return undefined;
    this.#state = { ...this.#state, approvals: this.#state.approvals.filter((approval) => approval !== request) };
    this.#save();
    return request;
  }

  //* A prompt the user typed instead of answering moves the conversation on; the parked asks belong to a turn it replaced.
  clear() {
    if (!this.#state.question && !this.#state.approvals.length) return;
    this.#state = { approvals: [] };
    this.#save();
  }

  #save() {
    if (!this.#file) return;
    if (!this.#state.question && !this.#state.approvals.length) {
      rmSync(this.#file, { force: true });
      return;
    }
    mkdirSync(path.dirname(this.#file), { recursive: true });
    writeFileSync(this.#file, `${JSON.stringify(this.#state)}\n`);
  }

  static #read(file: string | null): SuspendedState {
    if (!file || !existsSync(file)) return { approvals: [] };
    try {
      const parsed = JSON.parse(readFileSync(file, "utf8")) as Partial<SuspendedState>;
      return { ...(parsed.question ? { question: parsed.question } : {}), approvals: parsed.approvals ?? [] };
    } catch {
      return { approvals: [] };
    }
  }
}
