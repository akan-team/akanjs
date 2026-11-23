import { type CodeAgentEvent, codeAgentEventLabel } from "akanjs/common";
import chalk from "chalk";

export interface CodeAgentStreamPrinterOptions {
  /** One JSON object per line instead of prose, for a pipe that parses. */
  json?: boolean;
  thinking?: boolean;
  write?: (text: string) => void;
}

export class CodeAgentStreamPrinter {
  readonly #options: CodeAgentStreamPrinterOptions;
  readonly #write: (text: string) => void;
  #streaming = false;

  constructor(options: CodeAgentStreamPrinterOptions = {}) {
    this.#options = options;
    this.#write = options.write ?? ((text) => process.stdout.write(text));
  }

  print(event: CodeAgentEvent) {
    if (this.#options.json) return this.#write(`${JSON.stringify(event)}\n`);
    switch (event.type) {
      case "text_delta":
        this.#streaming = true;
        return this.#write(event.text);
      case "thinking_delta":
        if (!this.#options.thinking) return;
        this.#streaming = true;
        return this.#write(chalk.dim(event.text));
      case "tool_start":
        return this.#line(chalk.cyan(`→ ${event.tool.title}`));
      case "tool_end":
        return this.#line(CodeAgentStreamPrinter.#toolEnd(event));
      case "session":
        return this.#line(chalk.dim(codeAgentEventLabel(event)));
      case "turn_end":
        // Only `truncated` is said: a cut answer looks exactly like a finished one.
        if (event.stopReason === "truncated") return this.#line(chalk.yellow(codeAgentEventLabel(event)));
        return;
      case "message":
      case "tool_progress":
      case "turn_start":
      case "idle":
      case "queue":
      case "context":
      // A stream has no rail to redraw; the pool already reports a child's start and cost as notices.
      case "subagent":
        return;
      case "question":
        return this.#line(chalk.yellow(`? ${event.question.prompt}`));
      case "approval":
        return this.#line(chalk.yellow(`approve? ${event.request.summary}`));
      case "notice":
        return this.#line(CodeAgentStreamPrinter.#notice(event.level, event.message));
      case "error":
        return this.#line(chalk.red(`error: ${event.message}`));
      default:
        return this.#line(chalk.dim(codeAgentEventLabel(event)));
    }
  }

  /** Closes a half-written streamed line so the exit code and the shell prompt do not land mid-sentence. */
  finish() {
    if (this.#streaming) this.#write("\n");
    this.#streaming = false;
  }

  #line(text: string) {
    if (this.#streaming) this.#write("\n");
    this.#streaming = false;
    this.#write(`${text}\n`);
  }

  static #toolEnd(event: Extract<CodeAgentEvent, { type: "tool_end" }>) {
    if (event.outcome === "ok") return chalk.green(`✓ ${event.tool.title}`);
    if (event.outcome === "blocked") return chalk.yellow(`⦸ ${event.tool.title} — ${event.output}`);
    return chalk.red(`✗ ${event.tool.title} — ${event.output.split("\n")[0] ?? ""}`);
  }

  static #notice(level: "info" | "warning" | "error", message: string) {
    if (level === "error") return chalk.red(message);
    if (level === "warning") return chalk.yellow(message);
    return chalk.dim(message);
  }
}
