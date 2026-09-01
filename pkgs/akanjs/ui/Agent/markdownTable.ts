export type Align = "left" | "center" | "right";

export interface TableBlock {
  kind: "table";
  aligns: (Align | null)[];
  head: string[];
  rows: string[][];
}

const cellSplit = /(?<!\\)\|/;
const delimiter = /^:?-+:?$/;

/** GFM table scan, kept out of the block scanner because the delimiter row makes it the one shape that has to
 *  read the line after the one it starts on. */
export class MarkdownTable {
  static at(lines: string[], at: number): { block: TableBlock; next: number } | null {
    const header = lines[at];
    const aligns = MarkdownTable.#aligns(lines[at + 1]);
    if (!header?.includes("|") || !aligns) return null;
    const head = MarkdownTable.#cells(header);
    const rows: string[][] = [];
    let next = at + 2;
    for (; next < lines.length; next += 1) {
      const line = lines[next];
      if (!line.trim() || !line.includes("|")) break;
      const cells = MarkdownTable.#cells(line);
      // GFM sizes every row to the header — a short row is padded, a long one truncated — so the columns hold
      // their shape where a model miscounted its own pipes.
      rows.push(head.map((_, idx) => cells[idx] ?? ""));
    }
    return { block: { kind: "table", aligns, head, rows }, next };
  }

  static #cells(line: string): string[] {
    return line
      .trim()
      .replace(/^\|/, "")
      .replace(/(?<!\\)\|$/, "")
      .split(cellSplit)
      .map((cell) => cell.trim().replace(/\\\|/g, "|"));
  }

  /** The delimiter row is what separates a table from a paragraph that merely contains a pipe, and from the
   *  `---` of a rule — which is why the pipe is required of it rather than of the header. */
  static #aligns(line: string | undefined): (Align | null)[] | null {
    if (!line?.includes("|")) return null;
    const cells = MarkdownTable.#cells(line);
    if (!cells.every((cell) => delimiter.test(cell))) return null;
    return cells.map((cell) => {
      const closed = cell.endsWith(":");
      if (cell.startsWith(":")) return closed ? "center" : "left";
      return closed ? "right" : null;
    });
  }
}
