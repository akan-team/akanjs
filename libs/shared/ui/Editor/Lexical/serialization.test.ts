import { describe, expect, it } from "bun:test";
import { $createParagraphNode, $createTextNode, $getRoot, createEditor, type Klass, type LexicalNode } from "lexical";

import { isSerializedEditorState } from "./softGuard";

// NOTE: intentionally imports only `lexical` core (RootNode/ParagraphNode/TextNode
// are always registered) and the pure `softGuard`. Importing `./config` would
// pull @lexical/list|link|code, whose dev ESM builds trip bun's module loader
// under `bun test` (a test-runtime-only issue; the app webpack build is fine).
// See [[akan-lexical-editor-bun-test]].
const makeEditor = (nodes: Klass<LexicalNode>[] = []) =>
  createEditor({
    namespace: "akan-test",
    nodes,
    onError: (error) => {
      throw error;
    },
  });

describe("Lexical serialization", () => {
  it("round-trips a document without loss (toJSON → parse → toJSON)", () => {
    const editor = makeEditor();
    editor.update(
      () => {
        const root = $getRoot();
        const paragraph = $createParagraphNode();
        paragraph.append($createTextNode("안녕하세요 Lexical").toggleFormat("bold"));
        root.append(paragraph);
      },
      { discrete: true },
    );

    const json1 = editor.getEditorState().toJSON();
    const json2 = editor.parseEditorState(json1).toJSON();

    // Serialized state survives a parse/serialize cycle byte-for-byte.
    expect(json2).toEqual(json1);
    // ...and it is recognized as a valid Lexical state by the soft guard.
    expect(isSerializedEditorState(json1)).toBe(true);
  });

  it("preserves Korean text and mark formatting across the cycle", () => {
    const editor = makeEditor();
    editor.update(
      () => {
        const root = $getRoot();
        const paragraph = $createParagraphNode();
        paragraph.append($createTextNode("한글 조합 입력 테스트").toggleFormat("italic").toggleFormat("underline"));
        root.append(paragraph);
      },
      { discrete: true },
    );

    const restored = editor.parseEditorState(editor.getEditorState().toJSON());
    const text = restored.read(() => $getRoot().getTextContent());
    expect(text).toBe("한글 조합 입력 테스트");
  });

  // All 6 Akan marks are core TextNode formats, so they round-trip without the
  // sibling node packages that trip bun (see note above). Element blocks
  // (heading/list/code/hr/link) are covered by the app build + `/lexical-demo`.
  it("round-trips every supported mark (bold/italic/underline/strikethrough/code/highlight)", () => {
    const marks = ["bold", "italic", "underline", "strikethrough", "code", "highlight"] as const;
    const editor = makeEditor();
    editor.update(
      () => {
        const root = $getRoot();
        for (const mark of marks) {
          const paragraph = $createParagraphNode();
          paragraph.append($createTextNode(mark).toggleFormat(mark));
          root.append(paragraph);
        }
      },
      { discrete: true },
    );

    const json1 = editor.getEditorState().toJSON();
    const json2 = editor.parseEditorState(json1).toJSON();
    expect(json2).toEqual(json1);
    // Each mark sets a non-zero format bitmask that must survive serialization.
    const restored = editor.parseEditorState(json1);
    const formats = restored.read(() =>
      $getRoot()
        .getChildren()
        .map((block) => (block.getFirstChild() as ReturnType<typeof $createTextNode>).getFormat()),
    );
    expect(formats.every((f) => f > 0)).toBe(true);
    expect(new Set(formats).size).toBe(marks.length);
  });
});

describe("mention node", () => {
  // Imported inside the test, not at module scope: `class MentionNode extends TextNode`
  // evaluated at import time turns a runner that cannot initialize lexical into an
  // unloadable module (the whole file disappears from the report) instead of ordinary
  // test failures.
  const insertMention = async () => {
    const [{ MentionNode }, { $createMentionNode }] = await Promise.all([
      import("./nodes/MentionNode"),
      import("./nodes/mentionNode.util"),
    ]);
    const editor = makeEditor([MentionNode]);
    editor.update(
      () => {
        const paragraph = $createParagraphNode();
        paragraph.append($createTextNode("cc "));
        paragraph.append(
          $createMentionNode({
            refName: "admin",
            refId: "a1",
            label: "kangmin",
            href: "/admin/a1",
            imageUrl: "https://cdn.akan.io/a1.png",
          }),
        );
        $getRoot().append(paragraph);
      },
      { discrete: true },
    );
    return editor;
  };

  it("round-trips its ref payload and token mode", async () => {
    const editor = await insertMention();
    const json1 = editor.getEditorState().toJSON();
    const json2 = editor.parseEditorState(json1).toJSON();
    expect(json2).toEqual(json1);

    const chip = editor
      .parseEditorState(json1)
      .read(() => $getRoot().getFirstChild()?.getLastChild()?.exportJSON()) as Record<string, unknown>;
    expect(chip).toMatchObject({
      type: "akan-mention",
      refName: "admin",
      refId: "a1",
      label: "kangmin",
      href: "/admin/a1",
      imageUrl: "https://cdn.akan.io/a1.png",
      mode: "token",
      text: "kangmin",
    });
  });

  it("reads back as the bare label so previews and search stay in sync with the chip", async () => {
    const editor = await insertMention();
    const text = editor.getEditorState().read(() => $getRoot().getTextContent());
    expect(text).toBe("cc kangmin");
  });

  it("strips a legacy `@label` text field on import", async () => {
    const { MentionNode } = await import("./nodes/MentionNode");
    const editor = makeEditor([MentionNode]);
    const legacy = {
      root: {
        type: "root",
        version: 1,
        children: [
          {
            type: "paragraph",
            version: 1,
            children: [
              {
                type: "akan-mention",
                version: 1,
                text: "@kangmin",
                refName: "admin",
                refId: "a1",
                label: "kangmin",
                href: "/admin/a1",
                imageUrl: null,
                format: 0,
                detail: 0,
                mode: "token",
                style: "",
              },
            ],
          },
        ],
      },
    };
    const restored = editor.parseEditorState(legacy);
    expect(restored.read(() => $getRoot().getTextContent())).toBe("kangmin");
  });
});

describe("soft guard (isSerializedEditorState)", () => {
  it("rejects legacy Yoopta content", () => {
    const yoopta = {
      "block-1": { id: "block-1", type: "Paragraph", value: [], meta: { order: 0, depth: 0 } },
    };
    expect(isSerializedEditorState(yoopta)).toBe(false);
  });

  it("rejects null / primitives / arrays / rootless objects", () => {
    expect(isSerializedEditorState(null)).toBe(false);
    expect(isSerializedEditorState(undefined)).toBe(false);
    expect(isSerializedEditorState("string")).toBe(false);
    expect(isSerializedEditorState(42)).toBe(false);
    expect(isSerializedEditorState([])).toBe(false);
    expect(isSerializedEditorState({ notRoot: {} })).toBe(false);
    expect(isSerializedEditorState({ root: { type: "paragraph" } })).toBe(false);
  });
});
