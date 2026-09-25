import { describe, expect, it } from "bun:test";
import { $createParagraphNode, $createTextNode, $getRoot, createEditor } from "lexical";

import { isSerializedEditorState } from "./softGuard";

// NOTE: intentionally imports only `lexical` core (RootNode/ParagraphNode/TextNode
// are always registered) and the pure `softGuard`. Importing `./config` would
// pull @lexical/list|link|code, whose dev ESM builds trip bun's module loader
// under `bun test` (a test-runtime-only issue; the app webpack build is fine).
// See [[akan-lexical-editor-bun-test]].
const makeEditor = () =>
  createEditor({
    namespace: "akan-test",
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
