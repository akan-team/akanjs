import { type CodeTranscriptPart, codeAgentClip } from "akanjs/common";
import { type CodeTuiLine, CodeTuiLines, type CodeTuiRow, type CodeTuiSpan } from "./CodeTuiLines";
import { CodeTuiMarkdown } from "./CodeTuiMarkdown";

export interface CodeTuiPartsOptions {
  /** Whether reasoning is drawn in full. Folded to one line otherwise. */
  thinking?: boolean;
}

export class CodeTuiParts {
  static readonly thinkingLines = 6;
  /** Lines shown of a failed or refused call's output; a successful call's output is never shown. */
  static readonly outputLines = 4;

  static lines(parts: readonly CodeTranscriptPart[], width: number, options: CodeTuiPartsOptions = {}): CodeTuiLine[] {
    const lines: CodeTuiLine[] = [];
    parts.forEach((part, at) => {
      const rows = CodeTuiParts.rows(part, width, options);
      for (const line of CodeTuiLines.rows(rows, width, `${part.id}:${at}`)) lines.push(line);
    });
    return lines;
  }

  static rows(part: CodeTranscriptPart, width = 80, options: CodeTuiPartsOptions = {}): CodeTuiRow[] {
    switch (part.kind) {
      case "user":
        return [
          { prefix: { text: "› ", color: "cyan", bold: true }, spans: [{ text: part.text, color: "cyan" }] },
          ...(part.images
            ? [
                {
                  prefix: { text: "  ", dim: true },
                  spans: [{ text: `⧉ ${part.images} image${part.images > 1 ? "s" : ""}`, dim: true }],
                },
              ]
            : []),
        ];
      case "assistant":
        return CodeTuiParts.#assistant(part, width);
      case "thinking":
        return options.thinking ? CodeTuiParts.#thinking(part.text) : CodeTuiParts.#folded(part.text);
      case "tool":
        return CodeTuiParts.#tool(part);
      case "notice":
        return part.text.split("\n").map((line, at) => ({
          prefix: { text: at === 0 && part.level !== "info" ? "! " : "  ", ...CodeTuiParts.#noticeStyle(part.level) },
          spans: CodeTuiMarkdown.spans(line, CodeTuiParts.#noticeStyle(part.level)),
        }));
      case "question":
        return CodeTuiParts.#question(part);
      case "approval":
        return [
          { prefix: { text: "? ", color: "yellow" }, spans: [{ text: part.request.summary, color: "yellow" }] },
          ...(part.approved === undefined
            ? []
            : [
                {
                  prefix: { text: "  " },
                  spans: [{ text: CodeTuiParts.#verdict(part.approved, part.remembered), dim: true }],
                },
              ]),
        ];
      case "host":
        return [{ prefix: { text: "  ", dim: true }, spans: [{ text: `${part.hostKind} ${part.text}`, dim: true }] }];
      default:
        return [];
    }
  }

  static #assistant(part: Extract<CodeTranscriptPart, { kind: "assistant" }>, width: number): CodeTuiRow[] {
    // Safe to render mid-stream: an unterminated fence already scans as `code`, so no block changes kind later.
    const rows = CodeTuiMarkdown.rows(part.text, width);
    if (!part.truncated) return rows;
    return [
      ...rows,
      { spans: [{ text: "… the answer stopped at the model's output limit — ask it to continue", color: "yellow" }] },
    ];
  }

  // Folded to one marked line, not dropped: a turn opening with a long think would otherwise be a blank screen.
  static #folded(text: string): CodeTuiRow[] {
    const count = text.split("\n").filter((line) => line.trim()).length;
    return [
      {
        prefix: { text: "✻ ", dim: true },
        spans: [{ text: `thinking · ${count} line${count === 1 ? "" : "s"} · /thinking to show`, dim: true }],
      },
    ];
  }

  static #thinking(text: string): CodeTuiRow[] {
    const all = text.split("\n").filter((line) => line.trim());
    const shown = all.slice(-CodeTuiParts.thinkingLines);
    const hidden = all.length - shown.length;
    return [
      ...(hidden
        ? [{ prefix: { text: "· ", dim: true }, spans: [{ text: `(${hidden} earlier lines)`, dim: true }] }]
        : []),
      ...shown.map((line) => ({
        prefix: { text: "· ", dim: true },
        spans: [{ text: line, dim: true, italic: true }] satisfies CodeTuiSpan[],
      })),
    ];
  }

  static #tool(part: Extract<CodeTranscriptPart, { kind: "tool" }>): CodeTuiRow[] {
    const running = part.outcome === undefined;
    const mark = running ? "◐" : part.outcome === "ok" ? "⏺" : part.outcome === "blocked" ? "⦸" : "⏺";
    const color = running ? "cyan" : part.outcome === "ok" ? "green" : part.outcome === "blocked" ? "yellow" : "red";
    const head: CodeTuiRow = {
      prefix: { text: `${mark} `, color },
      hang: "  ",
      spans: CodeTuiParts.#title(part.tool.name, part.tool.title),
    };
    const detail = CodeTuiParts.#detail(part);
    if (!detail.length) return [head];
    return [
      head,
      ...detail.map((line, at) => ({
        prefix: { text: at === 0 ? "  ⎿ " : "    ", dim: true },
        hang: "    ",
        spans: [{ text: line, dim: true }] satisfies CodeTuiSpan[],
      })),
    ];
  }

  static #title(name: string, title: string): CodeTuiSpan[] {
    if (!title.startsWith(name)) return [{ text: title, bold: true }];
    return [
      { text: name, bold: true },
      { text: title.slice(name.length), dim: true },
    ];
  }

  static #detail(part: Extract<CodeTranscriptPart, { kind: "tool" }>) {
    if (part.outcome === undefined) return part.progress ? [part.progress] : [];
    if (part.outcome === "ok") return [];
    return (part.output ?? "")
      .split("\n")
      .filter((line) => line.trim())
      .slice(0, CodeTuiParts.outputLines)
      .map((line) => codeAgentClip(line.trim(), 200));
  }

  static #question(part: Extract<CodeTranscriptPart, { kind: "question" }>): CodeTuiRow[] {
    return [
      { prefix: { text: "? ", color: "yellow" }, spans: [{ text: part.question.prompt, color: "yellow" }] },
      ...(part.question.options ?? []).map((option) => ({
        prefix: { text: "  · ", dim: true },
        spans: [{ text: `${option.label}${option.recommended ? " (recommended)" : ""}`, dim: true }],
      })),
      ...(part.rendered === undefined
        ? []
        : [{ prefix: { text: "  = ", color: "green" }, spans: [{ text: part.rendered, color: "green" }] }]),
    ];
  }

  static #verdict(approved: boolean, remembered: string[] | undefined) {
    if (!approved) return "denied";
    return remembered?.length ? `approved · ${remembered.join(", ")} runs unasked until this session ends` : "approved";
  }

  static #noticeStyle(level: "info" | "warning" | "error") {
    if (level === "error") return { color: "red" };
    if (level === "warning") return { color: "yellow" };
    return { dim: true };
  }
}
