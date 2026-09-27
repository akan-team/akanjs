import { describe, expect, test } from "bun:test";

import { RichEditor } from "@libs/shared/common";

import { hasEditorContent, toSerializedEditorState } from "./softGuard";

const textOf = (state: unknown) => RichEditor.extractTextFromContent(state).trim();

describe("toSerializedEditorState", () => {
  test("hands a real document back untouched", () => {
    const doc = RichEditor.contentFromText("already a document");
    expect(toSerializedEditorState(doc)).toBe(doc as never);
  });

  test("reads plain text — what an agent writes into an Any field — as a document", () => {
    const state = toSerializedEditorState("재현 방법: 고양이가 키보드 위로\n\n기대 동작: BGM 유지");
    expect(state).not.toBeNull();
    expect(textOf(state)).toContain("고양이가 키보드 위로");
    expect(textOf(state)).toContain("기대 동작");
  });

  test("reads a legacy block array by its text", () => {
    const blocks = [{ type: "paragraph", children: [{ type: "text", text: "legacy body" }] }];
    expect(textOf(toSerializedEditorState(blocks))).toBe("legacy body");
  });

  test("returns null for everything with nothing to show", () => {
    for (const empty of [null, undefined, "", "   ", [], 42, {}, { notRoot: {} }])
      expect(toSerializedEditorState(empty)).toBeNull();
  });
});

describe("hasEditorContent", () => {
  test("is false for the empty defaults a rich field is stored with", () => {
    for (const empty of [null, undefined, [], "", { root: { type: "root", children: [] } }])
      expect(hasEditorContent(empty)).toBe(false);
  });

  test("is true for a document and for plain text", () => {
    expect(hasEditorContent(RichEditor.contentFromText("body"))).toBe(true);
    expect(hasEditorContent("body an agent wrote")).toBe(true);
  });
});
