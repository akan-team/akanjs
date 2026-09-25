import {
  $convertToMarkdownString,
  $generateNodesFromMarkdownString,
  isTableRowDivider,
  type MultilineElementTransformer,
  type Transformer,
} from "@lexical/markdown";
import {
  $createTableCellNode,
  $createTableNode,
  $createTableRowNode,
  $isTableCellNode,
  $isTableNode,
  $isTableRowNode,
  TableCellHeaderStates,
  TableCellNode,
  TableNode,
  TableRowNode,
} from "@lexical/table";
import { $createParagraphNode, $isElementNode } from "lexical";

import type { EditorNodeLike } from "./feature";

/** `@lexical/markdown`'s own row shape, kept identical so its line sanitizer and this agree on what a row is. */
const TABLE_ROW = /^(?:\|)(.+)(?:\|)\s?$/;

/**
 * A cell holds inline markdown and nothing else: a table, a fence or a heading has no cell-level form,
 * and a row is one line, so a block transformer could only ever mangle it. Taking the subset off the
 * live list rather than naming the inline transformers here is what makes a new inline feature — a
 * mention, say — work inside a cell the moment it is added to `AKAN_FEATURES`.
 */
const inlineOnly = (transformers: readonly Transformer[]) =>
  transformers.filter((transformer) => transformer.type === "text-format" || transformer.type === "text-match");

/**
 * Splits a row on its unescaped pipes.
 *
 * `\|` is the only way a cell can contain a pipe, and mention labels are document titles — a `|` in one
 * would otherwise silently start a new column. `\n` is the playground's escape for a newline inside a
 * cell and is undone here for the same round-trip.
 */
const cellsOf = (line: string): string[] | null => {
  const inner = line.match(TABLE_ROW)?.[1];
  if (inner === undefined) return null;
  const cells: string[] = [];
  let current = "";
  for (let index = 0; index < inner.length; index += 1) {
    const char = inner[index];
    if (char === "\\" && inner[index + 1] === "|") {
      current += "|";
      index += 1;
    } else if (char === "|") {
      cells.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  cells.push(current);
  return cells.map((cell) => cell.trim().replace(/\\n/g, "\n"));
};

const $cellOf = (markdown: string, transformers: readonly Transformer[], header: boolean) => {
  const cell = $createTableCellNode(header ? TableCellHeaderStates.ROW : TableCellHeaderStates.NO_STATUS);
  for (const node of $generateNodesFromMarkdownString(markdown, inlineOnly(transformers)))
    cell.append($isElementNode(node) ? node : $createParagraphNode().append(node));
  if (!cell.getChildrenSize()) cell.append($createParagraphNode());
  return cell;
};

const cellMarkdown = (cell: TableCellNode | undefined, transformers: readonly Transformer[]) =>
  cell
    ? $convertToMarkdownString(inlineOnly(transformers) as Transformer[], cell)
        .trim()
        .replace(/\|/g, "\\|")
        .replace(/\n/g, "\\n")
    : "";

/**
 * GFM pipe tables (`| a | b |` over a `| --- | --- |` delimiter).
 *
 * `@lexical/markdown` ships no table transformer — it exports `isTableRowDivider` and keeps table rows
 * out of paragraph merging, then stops — so without this one an agent's `| a | b |` lands as literal
 * text. Nothing else in the editor converts markdown either: the paste pipeline reads
 * `application/x-lexical-editor` → `text/html` → `text/plain` and never parses markdown, so a pasted
 * table only ever arrives as HTML through `TableNode.importDOM`.
 *
 * Import runs entirely in `handleImportAfterStartMatch`, which consumes the whole block at once. The
 * Lexical playground instead matches one row at a time and walks backwards merging it into the previous
 * sibling; that leans on the preceding paragraph still being intact and rebuilds the table per row.
 * `replace` therefore always cancels — it is only reachable from `registerMarkdownShortcuts`, and a
 * paragraph turning into a table the moment someone types a pipe is not wanted.
 *
 * **The delimiter row is required**, as in GFM. Without it a line of pipes is ordinary prose, and the
 * transformer steps aside (`null`) rather than eating it.
 *
 * Two things do not survive a round-trip and are declared lossy through `isLossyTable`: a merged cell
 * (`hasCellMerge` is on, and markdown has no colspan) and a cell holding anything but paragraphs.
 * Column alignment (`:--`) is dropped in both directions, and a table whose first row is not a header
 * comes back with one, because markdown has no way to write a table without a delimiter row.
 */
export const tableTransformer = (transformers: () => readonly Transformer[]): MultilineElementTransformer => ({
  dependencies: [TableNode, TableRowNode, TableCellNode],
  regExpStart: TABLE_ROW,
  handleImportAfterStartMatch: ({ lines, rootNode, startLineIndex }) => {
    const header = cellsOf(lines[startLineIndex]);
    const divider = lines[startLineIndex + 1];
    if (!header || divider === undefined || !isTableRowDivider(divider.trim())) return null;
    const rows = [header];
    let lastLine = startLineIndex + 1;
    while (lastLine + 1 < lines.length) {
      const cells = cellsOf(lines[lastLine + 1]);
      if (!cells) break;
      rows.push(cells);
      lastLine += 1;
    }
    const active = transformers();
    const table = $createTableNode();
    rows.forEach((cells, index) => {
      const row = $createTableRowNode();
      for (let column = 0; column < header.length; column += 1)
        row.append($cellOf(cells[column] ?? "", active, index === 0));
      table.append(row);
    });
    rootNode.append(table);
    return [true, lastLine];
  },
  replace: () => false,
  export: (node) => {
    if (!$isTableNode(node)) return null;
    const rows = node.getChildren().filter($isTableRowNode);
    if (!rows.length) return null;
    const active = transformers();
    const columns = Math.max(...rows.map((row) => row.getChildren().filter($isTableCellNode).length));
    const lines: string[] = [];
    for (const [index, row] of rows.entries()) {
      const cells = row.getChildren().filter($isTableCellNode);
      lines.push(
        `| ${Array.from({ length: columns }, (_, column) => cellMarkdown(cells[column], active)).join(" | ")} |`,
      );
      if (index === 0) lines.push(`| ${Array.from({ length: columns }, () => "---").join(" | ")} |`);
    }
    return lines.join("\n");
  },
  type: "multiline-element",
});

/** A table markdown carries whole is no loss; one with a merged cell or a cell holding a block is. */
export const isLossyTable = (node: EditorNodeLike) =>
  (node.children ?? []).some((row) =>
    (row.children ?? []).some((cell) => {
      const { colSpan, rowSpan } = cell as { colSpan?: number; rowSpan?: number };
      if ((colSpan ?? 1) > 1 || (rowSpan ?? 1) > 1) return true;
      return (cell.children ?? []).some((child) => child.type !== "paragraph");
    }),
  );
