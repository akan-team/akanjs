import { describe, expect, it } from "bun:test";
import type { LexicalEditor } from "lexical";

// lexical and the command module are imported inside the tests, as in `mentionPlugin.command.test.ts`, so this
// file still loads under a runner that cannot initialize lexical's dev ESM. A stub stands in for `CodeNode`, whose
// package trips that loader; the helpers recognise a code block by its type alone.
const lexical = () => import("lexical");
const commands = () => import("./submitPlugin.command");

const makeEditor = async () => {
  const { createEditor, ElementNode } = await lexical();
  class StubCodeNode extends ElementNode {
    static override getType() {
      return "code";
    }
    static override clone(node: StubCodeNode) {
      return new StubCodeNode(node.__key);
    }
    override createDOM() {
      return document.createElement("code");
    }
    override updateDOM() {
      return false;
    }
  }
  const editor = createEditor({
    namespace: "akan-test",
    nodes: [StubCodeNode],
    onError: (error) => {
      throw error;
    },
  });
  return { editor, createCode: () => new StubCodeNode() };
};

// Each line becomes a paragraph; `|` inside a line marks a line break within that paragraph.
const writeParagraphs = async (editor: LexicalEditor, paragraphs: string[]) => {
  const { $createLineBreakNode, $createParagraphNode, $createTextNode, $getRoot } = await lexical();
  editor.update(
    () => {
      const root = $getRoot().clear();
      for (const value of paragraphs) {
        const paragraph = $createParagraphNode();
        value.split("|").forEach((line, idx) => {
          if (idx) paragraph.append($createLineBreakNode());
          if (line) paragraph.append($createTextNode(line));
        });
        root.append(paragraph);
      }
      root.selectEnd();
    },
    { discrete: true },
  );
};

const read = async (editor: LexicalEditor, run: () => boolean) => {
  let result = false;
  editor.update(
    () => {
      result = run();
    },
    { discrete: true },
  );
  return result;
};

describe("$entersNewline", () => {
  it("sends from prose", async () => {
    const { editor } = await makeEditor();
    const { $entersNewline } = await commands();
    await writeParagraphs(editor, ["hello", "world"]);
    expect(await read(editor, $entersNewline)).toBe(false);
  });

  it("breaks the line inside an unclosed fence, over line breaks and paragraphs alike", async () => {
    const { editor } = await makeEditor();
    const { $entersNewline } = await commands();
    await writeParagraphs(editor, ["hi|```ts|const a = 1;"]);
    expect(await read(editor, $entersNewline)).toBe(true);
    await writeParagraphs(editor, ["```", "const a = 1;"]);
    expect(await read(editor, $entersNewline)).toBe(true);
  });

  it("sends once the fence is closed", async () => {
    const { editor } = await makeEditor();
    const { $entersNewline } = await commands();
    await writeParagraphs(editor, ["```|ㅁㄴㅇ|```"]);
    expect(await read(editor, $entersNewline)).toBe(false);
  });

  it("breaks the line inside a code block", async () => {
    const { editor, createCode } = await makeEditor();
    const { $createTextNode, $getRoot } = await lexical();
    const { $entersNewline } = await commands();
    editor.update(
      () => {
        const code = createCode();
        code.append($createTextNode("const a = 1;"));
        $getRoot().clear().append(code);
        code.selectEnd();
      },
      { discrete: true },
    );
    expect(await read(editor, $entersNewline)).toBe(true);
  });
});

describe("$closeCodeFence", () => {
  it("takes a closing fence out of the last line and leaves the block", async () => {
    const { editor, createCode } = await makeEditor();
    const { $createLineBreakNode, $createTextNode, $getRoot, $getSelection, $isParagraphNode, $isRangeSelection } =
      await lexical();
    const { $closeCodeFence } = await commands();
    editor.update(
      () => {
        const code = createCode();
        code.append($createTextNode("a"), $createLineBreakNode(), $createTextNode("```"));
        $getRoot().clear().append(code);
        code.selectEnd();
      },
      { discrete: true },
    );
    expect(await read(editor, $closeCodeFence)).toBe(true);
    editor.getEditorState().read(() => {
      const [code, paragraph] = $getRoot().getChildren();
      expect(code.getTextContent()).toBe("a");
      expect($isParagraphNode(paragraph)).toBe(true);
      const selection = $getSelection();
      expect($isRangeSelection(selection) && selection.anchor.getNode().is(paragraph)).toBe(true);
    });
  });

  it("leaves a block whose last line is code alone", async () => {
    const { editor, createCode } = await makeEditor();
    const { $createTextNode, $getRoot } = await lexical();
    const { $closeCodeFence } = await commands();
    editor.update(
      () => {
        const code = createCode();
        code.append($createTextNode("const a = 1;"));
        $getRoot().clear().append(code);
        code.selectEnd();
      },
      { discrete: true },
    );
    expect(await read(editor, $closeCodeFence)).toBe(false);
  });
});
