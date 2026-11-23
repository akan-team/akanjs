import stringWidth from "string-width";

export interface CodeTuiStyle {
  color?: string;
  dim?: boolean;
  bold?: boolean;
  italic?: boolean;
  strikethrough?: boolean;
  underline?: boolean;
  inverse?: boolean;
}

export type CodeTuiSpan = CodeTuiStyle & { text: string };

/** Exactly one terminal row. */
export interface CodeTuiLine {
  key: string;
  spans: CodeTuiSpan[];
}

/** A row before wrapping: `prefix` marks its first line and `hang` indents the rest. */
export interface CodeTuiRow {
  spans: CodeTuiSpan[];
  prefix?: CodeTuiSpan;
  /** Defaults to blanks as wide as `prefix`. */
  hang?: string;
}

/** Wraps here rather than in Ink so the scroll arithmetic knows every row; widths use Ink's own `string-width`. */
export class CodeTuiLines {
  static width(text: string) {
    return stringWidth(text);
  }

  static rows(rows: CodeTuiRow[], width: number, keyBase: string): CodeTuiLine[] {
    const lines: CodeTuiLine[] = [];
    rows.forEach((row, idx) => {
      for (const line of CodeTuiLines.#row(row, Math.max(8, width), `${keyBase}:${idx}`)) lines.push(line);
    });
    return lines;
  }

  static #row(row: CodeTuiRow, width: number, key: string): CodeTuiLine[] {
    const prefix = row.prefix;
    const head = prefix ? CodeTuiLines.width(prefix.text) : 0;
    const hang = row.hang ?? " ".repeat(head);
    const body = width - Math.max(head, CodeTuiLines.width(hang));
    const wrapped = CodeTuiLines.#wrap(row.spans, Math.max(4, body));
    if (!wrapped.length) wrapped.push([]);
    return wrapped.map((spans, at) => ({
      key: `${key}:${at}`,
      spans: [...(at === 0 ? (prefix ? [prefix] : []) : hang ? [{ text: hang } satisfies CodeTuiSpan] : []), ...spans],
    }));
  }

  static #wrap(spans: CodeTuiSpan[], width: number): CodeTuiSpan[][] {
    const lines: CodeTuiSpan[][] = [];
    let line: CodeTuiSpan[] = [];
    let used = 0;
    // Leading whitespace is dropped only after an overflow break; after a newline it is the writer's indentation.
    let soft = false;
    const push = (fromWrap: boolean) => {
      lines.push(line);
      line = [];
      used = 0;
      soft = fromWrap;
    };
    for (const span of spans) {
      const { text, ...style } = span;
      for (const piece of text.split("\n").flatMap((part, at) => (at ? [null, part] : [part]))) {
        if (piece === null) {
          push(false);
          continue;
        }
        for (const word of CodeTuiLines.#words(piece)) {
          const size = CodeTuiLines.width(word);
          if (!word.trim() && !used && soft) continue;
          if (used && used + size > width) push(true);
          if (size > width) {
            for (const chunk of CodeTuiLines.chunks(word, width)) {
              if (used) push(true);
              line.push({ ...style, text: chunk });
              used = CodeTuiLines.width(chunk);
              if (used >= width) push(true);
            }
            continue;
          }
          line.push({ ...style, text: word });
          used += size;
        }
      }
    }
    if (line.length) lines.push(line);
    return lines;
  }

  static #words(text: string) {
    return text.match(/\S+\s*|\s+/g) ?? [];
  }

  static chunks(word: string, width: number) {
    const chunks: string[] = [];
    let chunk = "";
    for (const char of word) {
      if (CodeTuiLines.width(chunk + char) > width) {
        chunks.push(chunk);
        chunk = char;
      } else chunk += char;
    }
    if (chunk) chunks.push(chunk);
    return chunks;
  }

  static text(line: CodeTuiLine) {
    return line.spans.map((span) => span.text).join("");
  }
}
