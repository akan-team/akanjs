import type { CodeAgent } from "@akanjs/devkit/codeAgent";
import type { CodeAgentAnswer, CodeAgentApprovalRequest, CodeAgentQuestion, CodeTranscript } from "akanjs/common";
import type { CodeTuiOption, CodeTuiSnapshot } from "../ui/CodeTuiApp";
import type { CodeTuiEditor } from "./CodeTuiEditor";
import { type CodeTuiAskBlock, CodeTuiFrame } from "./CodeTuiFrame";

export class CodeTuiQuestion {
  // Host-only choice: picking it opens the prompt instead of answering, so the key never reaches the core.
  static readonly freeTextKey = "__free_text__";

  readonly #agent: CodeAgent;
  readonly #transcript: CodeTranscript;
  readonly #editor: CodeTuiEditor;
  readonly #render: () => void;
  #selected = 0;
  #typing = false; // answering the open question in prose rather than from its list
  #checked: string[] = [];

  constructor(agent: CodeAgent, transcript: CodeTranscript, editor: CodeTuiEditor, render: () => void) {
    this.#agent = agent;
    this.#transcript = transcript;
    this.#editor = editor;
    this.#render = render;
  }

  get typing() {
    return this.#typing;
  }

  get checked() {
    return this.#checked;
  }

  block(question: CodeAgentQuestion | undefined, frameRows: number): CodeTuiAskBlock {
    const all = CodeTuiQuestion.optionsOf(question);
    const chrome = 1 + 2 * CodeTuiFrame.promptRuleRows;
    const budget = Math.max(1, frameRows - CodeTuiFrame.minBodyRows - CodeTuiFrame.chromeRows - chrome);
    const shown = Math.min(all.length, budget);
    const first = Math.max(0, Math.min(this.#selected - Math.floor(shown / 2), all.length - shown));
    return {
      rows: chrome + shown,
      above: CodeTuiFrame.promptRuleRows,
      selected: this.#selected - first,
      caret: undefined,
      snapshot: {
        input: [] as string[],
        menu: [] as CodeTuiOption[],
        menuSelected: 0,
        options: all.slice(first, first + shown),
      },
    };
  }

  static modeOf(
    question: CodeAgentQuestion | undefined,
    approval: CodeAgentApprovalRequest | undefined,
  ): CodeTuiSnapshot["mode"] {
    if (approval) return "confirm";
    if (!question) return "input";
    if (question.kind === "confirm") return "confirm";
    if (question.kind === "select" && question.options?.length) return "select";
    return "input";
  }

  static optionsOf(question: CodeAgentQuestion | undefined): CodeTuiOption[] {
    const options = (question?.options ?? []).map((option) => ({
      key: option.key,
      label: option.recommended ? `${option.label} (recommended)` : option.label,
      ...(option.detail ? { detail: option.detail } : {}),
    }));
    if (!options.length || !question?.freeText) return options;
    return [
      ...options,
      { key: CodeTuiQuestion.freeTextKey, label: "Something else…", detail: "answer in your own words" },
    ];
  }

  static promptOf(question: CodeAgentQuestion | undefined, approval: CodeAgentApprovalRequest | undefined) {
    if (approval) return `approve? ${approval.summary}  [y/n]`;
    return question ? `? ${question.prompt}` : "";
  }

  hint(mode: CodeTuiSnapshot["mode"], multiSelect: boolean) {
    if (this.#typing) return "enter answer · esc back to the choices";
    if (mode === "confirm") return "y yes · n no · esc no";
    if (mode === "select")
      return `↑↓ choose${multiSelect ? " · space toggle" : ""} · enter answer · esc skip · pgup/pgdn scroll`;
    return "enter send · shift+enter newline · ↑↓ move · esc interrupt · pgup/pgdn scroll · ^c quit · /help";
  }

  placeholder() {
    if (this.#typing) return "your answer";
    if (this.#transcript.question) return "type an answer, or esc to skip";
    return this.#transcript.streaming ? "type to steer, esc to interrupt" : "ask for something, / for commands";
  }

  move(delta: number) {
    const count = CodeTuiQuestion.optionsOf(this.#transcript.question).length;
    if (!count) return;
    this.#selected = (this.#selected + delta + count) % count;
    this.#render();
  }

  toggle = () => {
    const option = CodeTuiQuestion.optionsOf(this.#transcript.question)[this.#selected];
    if (!option) return;
    this.#checked = this.#checked.includes(option.key)
      ? this.#checked.filter((key) => key !== option.key)
      : [...this.#checked, option.key];
    this.#render();
  };

  answerConfirm = (value: boolean) => {
    const approval = this.#transcript.approval;
    if (approval) return void this.#agent.approve(approval.approvalId, value);
    const question = this.#transcript.question;
    if (question) void this.answer(question.questionId, { text: value ? "yes" : "no" });
  };

  open(question: CodeAgentQuestion) {
    this.#typing = false;
    this.#checked = [];
    this.#selected = Math.max(
      0,
      (question.options ?? []).findIndex((option) => option.recommended),
    );
  }

  answerCurrent(questionId: string) {
    const question = this.#transcript.question;
    const shown = CodeTuiQuestion.optionsOf(question);
    if (this.#typing || !shown.length) {
      const text = this.#editor.text.trim();
      this.#editor.clear();
      this.#typing = false;
      return void this.answer(questionId, { text });
    }
    if (shown[this.#selected]?.key === CodeTuiQuestion.freeTextKey) {
      this.#typing = true;
      this.#editor.clear();
      return this.#render();
    }
    const keys = question?.multiSelect
      ? this.#checked.filter((key) => key !== CodeTuiQuestion.freeTextKey)
      : [shown[this.#selected]?.key ?? ""];
    this.#editor.clear();
    void this.answer(questionId, { keys });
  }

  backToChoices() {
    this.#typing = false;
    this.#editor.clear();
    this.#render();
  }

  async answer(questionId: string, answer: CodeAgentAnswer) {
    this.#selected = 0;
    this.#checked = [];
    this.#render();
    await this.#agent.answer(questionId, answer);
  }
}
