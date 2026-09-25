import { describe, expect, it } from "bun:test";
import {
  $convertFromMarkdownString,
  $convertToMarkdownString,
  BOLD_STAR,
  HEADING,
  type Transformer,
} from "@lexical/markdown";
import { HeadingNode } from "@lexical/rich-text";
import { TableCellNode, TableNode, TableRowNode } from "@lexical/table";
import { $getRoot, createEditor, type LexicalEditor } from "lexical";

import { MENTION } from "./markdownMention";
import { isLossyTable, tableTransformer } from "./markdownTable";
import { MentionNode } from "./nodes/MentionNode";

// `lexical` core plus `@lexical/{markdown,table}` only — the real `AKAN_TRANSFORMERS` reaches MermaidNode
// → `@libs/util/ui` → the util store, which demands AKAN_PUBLIC_* at import time. That is exactly why
// `tableTransformer` takes its transformer list as a thunk instead of importing it.
const transformers: Transformer[] = [];
transformers.push(
  HEADING,
  tableTransformer(() => transformers),
  BOLD_STAR,
  MENTION,
);

const makeEditor = () =>
  createEditor({
    namespace: "akan-test",
    nodes: [TableNode, TableRowNode, TableCellNode, HeadingNode, MentionNode],
    onError: (error) => {
      throw error;
    },
  });

const importMarkdown = (markdown: string) => {
  const editor = makeEditor();
  editor.update(() => $convertFromMarkdownString(markdown, transformers), { discrete: true });
  return editor;
};

const exportMarkdown = (editor: LexicalEditor) =>
  editor.getEditorState().read(() => $convertToMarkdownString(transformers));

const shapeOf = (editor: LexicalEditor) =>
  editor.getEditorState().read(() =>
    $getRoot()
      .getChildren()
      .map((node) => node.getType()),
  );

const SIMPLE = ["| Name | Role |", "| --- | --- |", "| Kangmin | Lead |", "| Ari | Design |"].join("\n");

describe("markdown table", () => {
  describe("import", () => {
    it("builds one table from the whole block", () => {
      const editor = importMarkdown(SIMPLE);
      expect(shapeOf(editor)).toEqual(["table"]);
      editor.getEditorState().read(() => {
        const table = $getRoot().getFirstChild() as TableNode;
        expect(table.getChildrenSize()).toBe(3);
        expect(table.getTextContent().replace(/\s+/g, " ").trim()).toBe("Name Role Kangmin Lead Ari Design");
      });
    });

    it("marks the row above the delimiter as the header", () => {
      const editor = importMarkdown(SIMPLE);
      editor.getEditorState().read(() => {
        const rows = ($getRoot().getFirstChild() as TableNode).getChildren() as TableRowNode[];
        const headerCells = rows[0].getChildren() as TableCellNode[];
        const bodyCells = rows[1].getChildren() as TableCellNode[];
        expect(headerCells.every((cell) => cell.hasHeader())).toBe(true);
        expect(bodyCells.some((cell) => cell.hasHeader())).toBe(false);
      });
    });

    it("leaves a pipe line alone when no delimiter row follows — it is prose, not a table", () => {
      expect(shapeOf(importMarkdown("| not | a table |"))).toEqual(["paragraph"]);
    });

    it("stops at the first line that is not a row, leaving the rest of the document intact", () => {
      const editor = importMarkdown(`${SIMPLE}\n\n# After`);
      expect(shapeOf(editor)).toEqual(["table", "heading"]);
    });

    it("pads a short row and truncates a long one to the header's column count", () => {
      const editor = importMarkdown(["| a | b |", "| --- | --- |", "| 1 |", "| 1 | 2 | 3 |"].join("\n"));
      editor.getEditorState().read(() => {
        const rows = ($getRoot().getFirstChild() as TableNode).getChildren() as TableRowNode[];
        expect(rows.map((row) => row.getChildrenSize())).toEqual([2, 2, 2]);
      });
    });

    it("reads inline markdown inside a cell", () => {
      const editor = importMarkdown(["| a |", "| --- |", "| **bold** |"].join("\n"));
      const bold = editor.getEditorState().read(() => $getRoot().getLastDescendant()?.getTextContent());
      expect(bold).toBe("bold");
      expect(exportMarkdown(editor)).toContain("**bold**");
    });

    it("keeps an escaped pipe inside its cell instead of starting a column", () => {
      const editor = importMarkdown(["| expr |", "| --- |", "| a \\| b |"].join("\n"));
      editor.getEditorState().read(() => {
        const rows = ($getRoot().getFirstChild() as TableNode).getChildren() as TableRowNode[];
        expect(rows[1].getChildrenSize()).toBe(1);
        expect(rows[1].getTextContent()).toBe("a | b");
      });
    });
  });

  describe("with a mention in a cell", () => {
    const WITH_MENTION = ["| Owner |", "| --- |", "| @[Kangmin](mention:user/u1) |"].join("\n");

    it("builds the chip inside the cell — a cell takes the same inline vocabulary as a paragraph", () => {
      const editor = importMarkdown(WITH_MENTION);
      const payload = editor.getEditorState().read(() =>
        $getRoot()
          .getAllTextNodes()
          .find((node) => node instanceof MentionNode)
          ?.getPayload(),
      );
      expect(payload).toMatchObject({ refName: "user", refId: "u1", label: "Kangmin" });
    });

    it("round-trips, so a whole-field rewrite does not flatten the chip into text", () => {
      expect(exportMarkdown(importMarkdown(WITH_MENTION))).toBe(WITH_MENTION);
    });
  });

  describe("export", () => {
    it("round-trips a table unchanged", () => {
      expect(exportMarkdown(importMarkdown(SIMPLE))).toBe(SIMPLE);
    });

    it("re-escapes a pipe so the row survives the next import", () => {
      const once = exportMarkdown(importMarkdown(["| expr |", "| --- |", "| a \\| b |"].join("\n")));
      expect(once).toContain("a \\| b");
      expect(exportMarkdown(importMarkdown(once))).toBe(once);
    });
  });

  describe("isLossyTable", () => {
    const cell = (extra: Record<string, unknown> = {}) => ({
      type: "tablecell",
      children: [{ type: "paragraph" }],
      ...extra,
    });
    const tableOf = (...cells: unknown[]) => ({ type: "table", children: [{ type: "tablerow", children: cells }] });

    it("is no loss for an ordinary table", () => {
      expect(isLossyTable(tableOf(cell(), cell()))).toBe(false);
    });

    it("is a loss once a cell spans columns or rows", () => {
      expect(isLossyTable(tableOf(cell({ colSpan: 2 })))).toBe(true);
      expect(isLossyTable(tableOf(cell({ rowSpan: 2 })))).toBe(true);
    });

    it("is a loss when a cell holds a block markdown cannot put in a row", () => {
      expect(isLossyTable(tableOf({ type: "tablecell", children: [{ type: "akan-image" }] }))).toBe(true);
    });
  });
});
