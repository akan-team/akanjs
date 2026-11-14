import { type CodeTranscript, codeAgentClip } from "akanjs/common";
import type { CodeTuiSnapshot } from "../ui/CodeTuiApp";
import { CodeTuiAgents } from "./CodeTuiAgents";
import { type CodeTuiLine, CodeTuiLines, type CodeTuiRow, type CodeTuiSpan } from "./CodeTuiLines";
import { CodeTuiParts } from "./CodeTuiParts";

export interface CodeTuiAskBlock {
  rows: number;
  above: number; // rows drawn above the prompt's first line, which the caret row is counted from
  selected: number;
  caret: { row: number; col: number } | undefined;
  snapshot: Pick<CodeTuiSnapshot, "input" | "menu" | "menuSelected" | "options">;
}

export class CodeTuiFrame {
  static readonly chromeRows = 1; // the hint row under the input
  static readonly promptRuleRows = 1; // the rule above the prompt box, and its twin below
  static readonly minBodyRows = 3; // the pane's header plus one line of conversation
  static readonly maxInputRows = 8;
  static readonly title = "Akan — write one line, deploy every stack";

  readonly #transcript: CodeTranscript;
  readonly #stdout: NodeJS.WriteStream;
  #thinking: boolean;

  constructor(transcript: CodeTranscript, stdout: NodeJS.WriteStream, thinking: boolean) {
    this.#transcript = transcript;
    this.#stdout = stdout;
    this.#thinking = thinking;
  }

  // Ink overwrites rather than clips an overflowing column, so every row split of the frame has to be exact.
  static layout(frameRows: number, askRows: number, railRows = 0) {
    const room = Math.max(1, frameRows - CodeTuiFrame.minBodyRows - CodeTuiFrame.chromeRows - railRows);
    const ask = Math.max(1, Math.min(askRows, room));
    return {
      ask,
      bodyHeight: Math.max(CodeTuiFrame.minBodyRows, frameRows - ask - CodeTuiFrame.chromeRows - railRows),
    };
  }

  // One row short: Ink treats a terminal-filling frame as fullscreen, erasing scrollback and misplacing the caret.
  static frameRowsOf(terminalRows: number) {
    return Math.max(CodeTuiFrame.minBodyRows + CodeTuiFrame.chromeRows + 1, terminalRows - 1);
  }

  toggleThinking() {
    this.#thinking = !this.#thinking;
    return this.#thinking;
  }

  lines(width: number): CodeTuiLine[] {
    return [
      ...CodeTuiLines.rows(this.#banner(), width, "banner"),
      ...CodeTuiParts.lines(this.#transcript.parts, width, { thinking: this.#thinking }),
    ];
  }

  // Dropped rather than windowed when it does not fit: half a list of running children reads as the whole one.
  railRows(columns: number): CodeTuiLine[] {
    const agents = this.#transcript.subagents;
    if (!agents.length) return [];
    const rows = CodeTuiAgents.rows(agents, this.#transcript.info?.name ?? "main", columns);
    const room =
      CodeTuiFrame.frameRowsOf(Math.max(10, this.#stdout.rows || 24)) -
      CodeTuiFrame.minBodyRows -
      CodeTuiFrame.chromeRows -
      2 * CodeTuiFrame.promptRuleRows -
      1;
    return rows.length <= room ? rows : [];
  }

  #banner(): CodeTuiRow[] {
    const cwd = this.#transcript.info?.cwd;
    return [
      { prefix: { text: "✻ ", color: "cyan" }, spans: [{ text: CodeTuiFrame.title, bold: true }] },
      {
        prefix: { text: "  " },
        spans: [{ text: cwd ? `${cwd} · /help for commands` : "/help for commands", dim: true }],
      },
    ];
  }

  static rule(left: string, right: string, width: number): CodeTuiSpan[] {
    const room = (label: string) => (label ? 3 + CodeTuiLines.width(label) : 1);
    const tail = right ? codeAgentClip(right, Math.max(1, width - 4)) : "";
    const head = width - room(left) - room(tail) >= 0 ? left : "";
    const fill = Math.max(0, width - room(head) - room(tail));
    return [
      ...(head
        ? ([
            { text: "─ ", dim: true },
            { text: head, color: "cyan" },
            { text: " ", dim: true },
          ] satisfies CodeTuiSpan[])
        : ([{ text: "─", dim: true }] satisfies CodeTuiSpan[])),
      { text: "─".repeat(fill), dim: true },
      ...(tail
        ? ([
            { text: " ", dim: true },
            { text: tail, dim: true },
            { text: " ─", dim: true },
          ] satisfies CodeTuiSpan[])
        : ([{ text: "─", dim: true }] satisfies CodeTuiSpan[])),
    ];
  }

  queueLabel() {
    const queue = this.#transcript.queue;
    const parts: string[] = [];
    if (queue.steering || queue.followUp) parts.push(`queued ${queue.steering + queue.followUp}`);
    if (this.#transcript.compacting) parts.push("compacting");
    return parts.join(" · ");
  }

  // The declared window stays visible: a wrong but self-consistent descriptor passes every check but a reader's.
  statusLabel() {
    const info = this.#transcript.info;
    if (!info) return "starting…";
    const context = this.#transcript.context;
    const window = info.contextTokens ? `${Math.round(info.contextTokens / 1000)}k` : "";
    const used = context?.max ? `${Math.round((context.used / context.max) * 100)}% of ${window}` : "";
    const compactsAt = info.autoCompactAt ? `compacts at ${info.autoCompactAt}%` : "";
    return [info.model?.name ?? "no model", used || (window && `${window} ctx`), compactsAt, info.profile, info.effort]
      .filter((part) => !!part)
      .join(" · ");
  }

  status() {
    if (this.#transcript.compacting) return "compacting";
    return this.#transcript.streaming ? "working" : "";
  }
}
