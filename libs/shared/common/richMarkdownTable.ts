import { RichInlineReader } from "./richInlineReader";
import { RichInlineWriter, type WritableNode } from "./richInlineWriter";
import { RichNode } from "./richNode";

interface TableNode extends WritableNode {
  children?: TableNode[];
  headerState?: number;
  colSpan?: number;
  rowSpan?: number;
  backgroundColor?: string | null;
  width?: number;
  height?: number;
  verticalAlign?: string;
  colWidths?: number[];
  indent?: number;
  format?: unknown;
}

/**
 * Tables in both forms the codec speaks. A GFM pipe table says only "one header row", so a table with no header,
 * a header column, a merged cell, a fill or an indented cell paragraph is written as a line-per-row `<table>`
 * instead: `<th>` is Lexical's header-row state and `data-header` names the other two.
 */
export class RichMarkdownTable {
  static readonly #row = /^\s*\|.*\|\s*$/;
  static readonly #htmlStart = /^\s*<table(?:\s[^>]*)?>\s*$/i;
  static readonly #htmlEnd = /^\s*<\/table>\s*$/i;
  static readonly #attr = /([\w-]+)="([^"]*)"/g;
  static readonly #safeAttr = /^[^"<>]*$/;

  static gfmAt(lines: string[], at: number) {
    const divider = lines[at + 1];
    if (!RichMarkdownTable.#row.test(lines[at]) || divider === undefined || !RichMarkdownTable.#row.test(divider))
      return false;
    return RichMarkdownTable.#cellsOf(divider).every((cell) => /^:?-+:?$/.test(cell));
  }

  static htmlAt(lines: string[], at: number) {
    return RichMarkdownTable.#htmlStart.test(lines[at]);
  }

  static readGfm(lines: string[], at: number) {
    const rows = [RichMarkdownTable.#cellsOf(lines[at])];
    let next = at + 2;
    while (next < lines.length && RichMarkdownTable.#row.test(lines[next])) {
      rows.push(RichMarkdownTable.#cellsOf(lines[next]));
      next += 1;
    }
    const columns = rows[0].length;
    const tableRows = rows.map((cells, rowIdx) =>
      RichNode.block(
        "tablerow",
        Array.from({ length: columns }, (_, column) =>
          RichMarkdownTable.#cell([RichMarkdownTable.#paragraph(cells[column] ?? "", {})], {
            headerState: rowIdx === 0 ? 1 : 0,
          }),
        ),
      ),
    );
    return { node: RichNode.block("table", tableRows), next };
  }

  static readHtml(lines: string[], at: number) {
    const open = RichMarkdownTable.#attrsOf(lines[at]);
    const body: string[] = [];
    let next = at + 1;
    while (next < lines.length && !RichMarkdownTable.#htmlEnd.test(lines[next])) {
      body.push(lines[next]);
      next += 1;
    }
    const rows = [...body.join("\n").matchAll(/<tr((?:\s+[\w-]+="[^"]*")*)\s*>([\s\S]*?)<\/tr>/g)].map(
      ([, attrs, cells]) => {
        const height = RichMarkdownTable.#number(RichMarkdownTable.#attrsOf(attrs)["data-height"]);
        const tableCells = [
          ...cells.matchAll(/<(t[hd])((?:\s+[\w-]+="[^"]*")*)\s*>((?:\\.|(?!<\/t[hd]>)[\s\S])*)<\/\1>/g),
        ].map(([, tag, cellAttrs, content]) =>
          RichMarkdownTable.#htmlCell(tag, RichMarkdownTable.#attrsOf(cellAttrs), content),
        );
        return RichNode.block("tablerow", tableCells, height === undefined ? {} : { height });
      },
    );
    const colWidths = open["data-col-widths"]?.split(",").map(Number);
    return { node: RichNode.block("table", rows, colWidths ? { colWidths } : {}), next: next + 1 };
  }

  /** Every form the table can take, simplest first; the caller keeps the first one that reads back unchanged. */
  static write(table: TableNode): string[] {
    const rows = table.children ?? [];
    if (!rows.length || rows.some((row) => row.type !== "tablerow")) return [];
    return [RichMarkdownTable.#gfm(rows), RichMarkdownTable.#html(table, rows)].filter(
      (markdown): markdown is string => markdown !== null,
    );
  }

  static #gfm(rows: TableNode[]) {
    const columns = Math.max(...rows.map((row) => row.children?.length ?? 0));
    if (!columns) return null;
    const lines: string[] = [];
    for (const [idx, row] of rows.entries()) {
      const cells = (row.children ?? []).map((cell) => {
        const [paragraph, ...others] = cell.children ?? [];
        if (others.length || paragraph?.type !== "paragraph") return null;
        return RichInlineWriter.write(paragraph.children ?? [], { inTable: "gfm" });
      });
      if (cells.some((cell) => cell === null)) return null;
      lines.push(`| ${cells.join(" | ")} |`);
      if (!idx) lines.push(`| ${Array.from({ length: columns }, () => "---").join(" | ")} |`);
    }
    return lines.join("\n");
  }

  static #html(table: TableNode, rows: TableNode[]) {
    const widths = table.colWidths?.length ? ` data-col-widths="${table.colWidths.join(",")}"` : "";
    const lines = [`<table${widths}>`];
    for (const row of rows) {
      const cells = (row.children ?? []).map(RichMarkdownTable.#htmlCellOf);
      if (cells.some((cell) => cell === null)) return null;
      const height = row.height === undefined ? "" : ` data-height="${row.height}"`;
      lines.push(`<tr${height}>${cells.join("")}</tr>`);
    }
    lines.push("</table>");
    return lines.join("\n");
  }

  static #htmlCellOf(cell: TableNode) {
    if (cell.type !== "tablecell") return null;
    const header = cell.headerState ?? 0;
    const attrs = [
      header > 1 ? ["data-header", header] : null,
      (cell.colSpan ?? 1) > 1 ? ["colspan", cell.colSpan] : null,
      (cell.rowSpan ?? 1) > 1 ? ["rowspan", cell.rowSpan] : null,
      cell.backgroundColor ? ["data-bg", cell.backgroundColor] : null,
      cell.width === undefined ? null : ["data-width", cell.width],
      cell.verticalAlign ? ["data-valign", cell.verticalAlign] : null,
    ].filter((pair): pair is [string, string | number] => pair !== null);
    if (attrs.some(([, value]) => !RichMarkdownTable.#safeAttr.test(String(value)))) return null;
    const content = RichMarkdownTable.#htmlContentOf(cell.children ?? []);
    if (content === null) return null;
    const tag = header ? "th" : "td";
    return `<${tag}${attrs.map(([key, value]) => ` ${key}="${value}"`).join("")}>${content}</${tag}>`;
  }

  // One plain paragraph is bare inline text; anything else spells each paragraph out so its indent survives.
  static #htmlContentOf(children: TableNode[]) {
    if (children.some((child) => child.type !== "paragraph")) return null;
    const [only, ...others] = children;
    const plain = only && !others.length && !only.indent && !only.format;
    if (plain) return RichInlineWriter.write(only.children ?? [], { inTable: "html" });
    const paragraphs = children.map((paragraph) => {
      const inline = RichInlineWriter.write(paragraph.children ?? [], { inTable: "html" });
      const indent = paragraph.indent ? ` data-indent="${paragraph.indent}"` : "";
      const align = typeof paragraph.format === "string" && paragraph.format ? ` data-align="${paragraph.format}"` : "";
      return inline === null ? null : `<p${indent}${align}>${inline}</p>`;
    });
    return paragraphs.some((paragraph) => paragraph === null) ? null : paragraphs.join("");
  }

  static #htmlCell(tag: string, attrs: Record<string, string>, content: string) {
    const paragraphs = [...content.matchAll(/<p((?:\s+[\w-]+="[^"]*")*)\s*>((?:\\.|(?!<\/p>)[\s\S])*)<\/p>/g)];
    const children = paragraphs.length
      ? paragraphs.map(([, pAttrs, inline]) => {
          const attr = RichMarkdownTable.#attrsOf(pAttrs);
          return RichMarkdownTable.#paragraph(inline, {
            indent: RichMarkdownTable.#number(attr["data-indent"]) ?? 0,
            format: attr["data-align"] ?? "",
          });
        })
      : [RichMarkdownTable.#paragraph(content, {})];
    const width = RichMarkdownTable.#number(attrs["data-width"]);
    return RichMarkdownTable.#cell(children, {
      headerState: tag === "th" ? (RichMarkdownTable.#number(attrs["data-header"]) ?? 1) : 0,
      colSpan: RichMarkdownTable.#number(attrs.colspan) ?? 1,
      rowSpan: RichMarkdownTable.#number(attrs.rowspan) ?? 1,
      backgroundColor: attrs["data-bg"] ?? null,
      ...(width === undefined ? {} : { width }),
      ...(attrs["data-valign"] ? { verticalAlign: attrs["data-valign"] } : {}),
    });
  }

  static #cell(children: object[], extra: object) {
    return RichNode.block("tablecell", children, {
      backgroundColor: null,
      colSpan: 1,
      headerState: 0,
      rowSpan: 1,
      ...extra,
    });
  }

  static #paragraph(inline: string, extra: { indent?: number; format?: string }) {
    const children = RichInlineReader.readLines(inline ? inline.split(/<br\s*\/?>/i) : []);
    const first = children[0] as { type?: string; format?: unknown } | undefined;
    return RichNode.block("paragraph", children, {
      textFormat: first?.type === "text" ? first.format : 0,
      textStyle: "",
      ...extra,
    });
  }

  /** A row split on its unescaped pipes; `\|` is how a cell holds one, including inside a code span, as in GFM. */
  static #cellsOf(line: string) {
    const inner = line
      .trim()
      .replace(/^\|/, "")
      .replace(/(?<!\\)\|$/, "");
    const cells: string[] = [];
    let current = "";
    for (let idx = 0; idx < inner.length; idx += 1) {
      const char = inner[idx];
      if (char === "\\" && inner[idx + 1] === "|") {
        current += "|";
        idx += 1;
      } else if (char === "|") {
        cells.push(current);
        current = "";
      } else current += char;
    }
    cells.push(current);
    return cells.map((cell) => cell.trim());
  }

  static #attrsOf(source: string) {
    return Object.fromEntries([...source.matchAll(RichMarkdownTable.#attr)].map(([, key, value]) => [key, value]));
  }

  static #number(value: string | undefined) {
    if (value === undefined) return undefined;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
}
