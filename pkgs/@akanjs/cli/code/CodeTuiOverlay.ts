import type { CodeAgent, CodeSessionEntry } from "@akanjs/devkit/codeAgent";
import type { CodeTranscript } from "akanjs/common";
import { type CodeTuiLine, CodeTuiLines, type CodeTuiRow, type CodeTuiSpan } from "./CodeTuiLines";
import { CodeTuiMarkdown } from "./CodeTuiMarkdown";

interface OverlayText {
  title: string;
  text: string;
}

interface CodeTuiOverlayHost {
  render: () => void;
  say: (text: string) => void;
}

export class CodeTuiOverlay {
  readonly #agent: CodeAgent;
  readonly #transcript: CodeTranscript;
  readonly #host: CodeTuiOverlayHost;
  #overlay: OverlayText | null = null;
  #overlayAt = 0;
  #picker: { entries: CodeSessionEntry[]; at: number } | null = null;

  constructor(agent: CodeAgent, transcript: CodeTranscript, host: CodeTuiOverlayHost) {
    this.#agent = agent;
    this.#transcript = transcript;
    this.#host = host;
  }

  get shown() {
    return this.#overlay !== null;
  }

  get picker() {
    return this.#picker;
  }

  block(width: number, height: number) {
    if (this.#picker) return this.#pickerBlock(width, height);
    const overlay = this.#overlay;
    if (!overlay) return null;
    const room = Math.max(1, height - 3); // a border pair and the title row
    const body = Math.max(8, width - 4);
    const all = CodeTuiOverlay.#overlayRows(overlay.text, body);
    const first = Math.max(0, Math.min(this.#overlayAt, all.length - room));
    return {
      title: overlay.title,
      lines: all.slice(first, first + room),
      above: first,
      below: Math.max(0, all.length - first - room),
      selectable: false,
    };
  }

  #pickerBlock(width: number, height: number) {
    const picker = this.#picker;
    if (!picker) return null;
    const room = Math.max(1, height - 3);
    const body = Math.max(8, width - 4);
    const first = Math.max(0, Math.min(picker.at - Math.floor(room / 2), picker.entries.length - room));
    const rows = picker.entries
      .slice(first, first + room)
      .map((entry, at) => CodeTuiOverlay.#sessionRow(entry, first + at === picker.at));
    return {
      title: `sessions · ${picker.entries.length}`,
      // One row per session: a wrapped entry would push the list past the box.
      lines: rows.flatMap((row, at) => CodeTuiLines.rows([row], body, `sessions:${first + at}`).slice(0, 1)),
      above: first,
      below: Math.max(0, picker.entries.length - first - room),
      selectable: true,
    };
  }

  static #sessionRow(entry: CodeSessionEntry, selected: boolean): CodeTuiRow {
    const label = entry.name ?? entry.id.slice(0, 8);
    return {
      prefix: { text: selected ? "❯ " : "  ", color: "cyan" },
      spans: [
        { text: label, bold: selected },
        {
          text: `  ${CodeTuiOverlay.#ago(entry.updatedAt)} · ${entry.turns} turn${entry.turns === 1 ? "" : "s"}`,
          dim: true,
        },
        ...(entry.opening ? ([{ text: `  ${entry.opening}`, dim: true }] satisfies CodeTuiSpan[]) : []),
      ],
    };
  }

  static #ago(at: number) {
    const minutes = Math.max(0, Math.round((Date.now() - at) / 60_000));
    if (minutes < 60) return `${minutes}m ago`;
    if (minutes < 60 * 24) return `${Math.round(minutes / 60)}h ago`;
    return `${Math.round(minutes / (60 * 24))}d ago`;
  }

  // Line by line: the markdown scanner would fold a column of commands into one paragraph.
  static #overlayRows(text: string, width: number): CodeTuiLine[] {
    return text.split("\n").flatMap((line, at) =>
      // A row with no spans renders nothing, so a blank line keeps a space.
      CodeTuiLines.rows(
        line.trim() ? CodeTuiMarkdown.rows(line, width) : [{ spans: [{ text: " " }] }],
        width,
        `overlay:${at}`,
      ),
    );
  }

  openSessions = () => {
    const entries = this.#agent.sessions();
    if (!entries.length) return this.#host.say("no stored sessions yet");
    const current = this.#transcript.info?.sessionId;
    this.#picker = {
      entries,
      at: Math.max(
        0,
        entries.findIndex((entry) => entry.id === current),
      ),
    };
    this.#host.render();
  };

  move(delta: number) {
    const picker = this.#picker;
    if (!picker) return;
    picker.at = Math.max(0, Math.min(picker.entries.length - 1, picker.at + delta));
    this.#host.render();
  }

  scroll(delta: number) {
    this.#overlayAt = Math.max(0, this.#overlayAt + Math.trunc(delta));
    this.#host.render();
  }

  // Over the transcript, not in it: a persisted transcript would reload every `/help` answer next session.
  open(title: string, text: string) {
    this.#overlay = { title, text };
    this.#overlayAt = 0;
    this.#host.render();
  }

  dismiss() {
    this.#overlay = null;
    this.#overlayAt = 0;
    this.#picker = null;
    this.#host.render();
  }
}
