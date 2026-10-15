import { describe, expect, it } from "bun:test";
import { $getRoot, createEditor } from "lexical";
import { RichEditor } from "../../../common/richEditor";
import { isSerializedEditorState } from "./softGuard";

// Imports only `lexical` core and the pure guard, for the reason spelled out in serialization.test.ts.
const makeEditor = () =>
  createEditor({
    namespace: "akan-test",
    nodes: [],
    onError: (error) => {
      throw error;
    },
  });

describe("RichEditor.contentFromText", () => {
  it("builds a state Lexical parses and re-serializes unchanged", () => {
    const content = RichEditor.contentFromText("hello");
    expect(isSerializedEditorState(content)).toBe(true);
    expect(makeEditor().parseEditorState(content).toJSON()).toEqual(content);
  });

  it("round-trips through extractTextFromContent", () => {
    const text = "첫 줄\n두 번째 줄";
    expect(RichEditor.extractTextFromContent(RichEditor.contentFromText(text)).trim()).toBe(text);
  });

  it("keeps a blank line as an empty paragraph", () => {
    const state = makeEditor().parseEditorState(RichEditor.contentFromText("a\n\nb"));
    expect(state.read(() => $getRoot().getChildrenSize())).toBe(3);
  });

  it("makes an empty string one empty paragraph, not an invalid state", () => {
    const content = RichEditor.contentFromText("");
    expect(isSerializedEditorState(content)).toBe(true);
    expect(
      makeEditor()
        .parseEditorState(content)
        .read(() => $getRoot().getTextContent()),
    ).toBe("");
  });
});
