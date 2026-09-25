import { describe, expect, it } from "bun:test";
import { $createTableNodeWithDimensions, TableCellNode, TableNode, TableRowNode } from "@lexical/table";
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  createEditor,
  type LexicalEditor,
  type LexicalNode,
} from "lexical";

import { $spliceRichBlocks, type RichBlockOp } from "./agentRichPlugin.command";
import { richBlocksOf } from "./agentRichPlugin.util";

// `lexical` core plus `@lexical/table` only. The plugin's own markdown conversion cannot be reached from a
// test: `AKAN_TRANSFORMERS` imports MermaidNode, which reaches `@libs/util/ui` and builds the util store,
// which demands AKAN_PUBLIC_* at import time — which is why the splice takes nodes rather than markdown.
const makeEditor = () =>
  createEditor({
    namespace: "akan-test",
    nodes: [TableNode, TableRowNode, TableCellNode],
    onError: (error) => {
      throw error;
    },
  });

const run = (editor: LexicalEditor, fn: () => void) => {
  editor.update(fn, { discrete: true });
};

const seed = (editor: LexicalEditor, texts: string[]) => {
  run(editor, () => {
    const root = $getRoot();
    root.clear();
    for (const text of texts) root.append($createParagraphNode().append($createTextNode(text)));
  });
};

const splice = (editor: LexicalEditor, op: RichBlockOp, index: number, texts: string[] = []) => {
  run(editor, () => {
    $spliceRichBlocks(
      op,
      index,
      texts.map((text) => $createParagraphNode().append($createTextNode(text)) as LexicalNode),
    );
  });
};

const blocksOf = (editor: LexicalEditor) => richBlocksOf(editor.getEditorState().toJSON());
const textsOf = (editor: LexicalEditor) => blocksOf(editor).map((block) => block.text);

describe("$spliceRichBlocks", () => {
  it("appends at the end", () => {
    const editor = makeEditor();
    seed(editor, ["one"]);
    splice(editor, "append", 0, ["two"]);
    expect(textsOf(editor)).toEqual(["one", "two"]);
  });

  it("inserts before the named index", () => {
    const editor = makeEditor();
    seed(editor, ["one", "three"]);
    splice(editor, "insert", 1, ["two"]);
    expect(textsOf(editor)).toEqual(["one", "two", "three"]);
  });

  it("replaces exactly one block", () => {
    const editor = makeEditor();
    seed(editor, ["one", "wrong", "three"]);
    splice(editor, "replace", 1, ["two"]);
    expect(textsOf(editor)).toEqual(["one", "two", "three"]);
  });

  it("removes exactly one block", () => {
    const editor = makeEditor();
    seed(editor, ["one", "two", "three"]);
    splice(editor, "remove", 1);
    expect(textsOf(editor)).toEqual(["one", "three"]);
  });

  it("keeps several blocks in the order they were given", () => {
    const editor = makeEditor();
    seed(editor, ["tail"]);
    splice(editor, "insert", 0, ["a", "b", "c"]);
    expect(textsOf(editor)).toEqual(["a", "b", "c", "tail"]);
  });

  it("leaves a paragraph behind rather than an empty root", () => {
    const editor = makeEditor();
    seed(editor, ["only"]);
    splice(editor, "remove", 0);
    expect(blocksOf(editor)).toEqual([{ index: 0, type: "paragraph", text: "" }]);
  });

  it("is a no-op on an index that names no block", () => {
    const editor = makeEditor();
    seed(editor, ["one"]);
    splice(editor, "replace", 7, ["two"]);
    expect(textsOf(editor)).toEqual(["one"]);
  });

  // The reason block ops exist at all: exporting the whole field to markdown would flatten this table into
  // one run of cell text, so editing its neighbour must not put it through the converter.
  it("carries a table through an edit to its neighbour, byte for byte", () => {
    const editor = makeEditor();
    run(editor, () => {
      const root = $getRoot();
      root.clear();
      root.append($createParagraphNode().append($createTextNode("caption")));
      root.append($createTableNodeWithDimensions(2, 2));
    });
    const before = JSON.stringify(editor.getEditorState().toJSON().root.children[1]);
    splice(editor, "replace", 0, ["new caption"]);
    const after = editor.getEditorState().toJSON().root.children[1];
    expect(JSON.stringify(after)).toBe(before);
    expect(textsOf(editor)[0]).toBe("new caption");
  });
});
