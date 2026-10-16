import { describe, expect, test } from "bun:test";
import { Reference } from "./Reference";
import type { MessageReference } from "./types";

const at = (path?: string): MessageReference => ({ refName: "videoCut", refId: "6a1f", label: "Cut 3", path });

describe("Reference identity", () => {
  test("a path is part of what a reference points at, so two fields of one document are two references", () => {
    expect(Reference.keyOf(at())).toBe("videoCut/6a1f");
    expect(Reference.keyOf(at("cutFrames.2.content"))).toBe("videoCut/6a1f#cutFrames.2.content");
    expect(Reference.same(at("cutFrames.2.content"), at("cutFrames.3.content"))).toBe(false);
    expect(Reference.same(at("cutFrames.2.content"), { ...at("cutFrames.2.content"), label: "renamed" })).toBe(true);
  });
});

describe("Reference.clipped", () => {
  test("a value under the ceiling is handed back untouched, object identity included", () => {
    const value = { content: "a wide establishing shot" };
    const reference = { ...at("cutFrames.2"), value };
    expect(Reference.clipped(reference)).toBe(reference);
  });

  test("a reference carrying no value is not given one", () => {
    expect(Reference.clipped(at())).toEqual(at());
  });

  test("a value past the ceiling is cut to it and the note says the JSON is unterminated", () => {
    const value = { frames: Array.from({ length: 4000 }, (_, idx) => ({ idx, content: "a".repeat(20) })) };
    const clipped = Reference.clipped({ ...at("cutFrames"), value });
    const text = clipped.value as string;
    expect(typeof text).toBe("string");
    // The ellipsis is the only character past the ceiling, so what a provider is charged for is the ceiling.
    expect(text.length).toBe(Reference.limit + 1);
    expect(text.startsWith('{"frames":[{"idx":0')).toBe(true);
    expect(clipped.note).toContain("cut mid-structure");
    expect(clipped.note).toContain("Read a narrower part of it with a tool");
  });

  test("the pointer survives clipping, because it is how the model reads the rest", () => {
    const value = "x".repeat(Reference.limit + 100);
    const clipped = Reference.clipped({ ...at("cutFrames.2.content"), value });
    expect(clipped.refName).toBe("videoCut");
    expect(clipped.refId).toBe("6a1f");
    expect(clipped.path).toBe("cutFrames.2.content");
  });
});

describe("Reference tokens", () => {
  test("a token says everything the pointer does, so the text can carry it alone", () => {
    expect(Reference.token({ ...at("cutFrames.2.content"), label: "Cut 3 body" })).toBe(
      "@[Cut 3 body](mention:videoCut/6a1f#cutFrames.2.content)",
    );
    expect(Reference.token({ ...at(), label: "Karina" })).toBe("@[Karina](mention:videoCut/6a1f)");
  });

  test("a draft parses back to the pointers it names, in order and without values", () => {
    const draft = "compare @[Karina](mention:videoCharacter/c1) against @[Cut 3](mention:videoCut/6a1f#c.2) please";
    expect(Reference.parse(draft)).toEqual([
      { refName: "videoCharacter", refId: "c1", label: "Karina" },
      { refName: "videoCut", refId: "6a1f", label: "Cut 3", path: "c.2" },
    ]);
  });

  test("a token round-trips through the text it was written into", () => {
    const one = { ...at("cutFrames.2.content"), label: "Cut 3 body", value: "a wide shot" };
    const [parsed] = Reference.parse(`fix ${Reference.token(one)} now`);
    // The value is deliberately not in the token: the text says what was pointed at, `staged` says what it held.
    expect(parsed.value).toBeUndefined();
    expect(Reference.keyOf(parsed)).toBe(Reference.keyOf(one));
  });

  test("text naming nothing parses to nothing, including a bare markdown link", () => {
    expect(Reference.parse("see [the docs](https://example.com) and @nobody")).toEqual([]);
  });

  test("a stray `@[` typed ahead of a token stays text, and a run of them is read once", () => {
    expect(Reference.parse("look @[@[Karina](mention:videoCharacter/c1)")).toEqual([
      { refName: "videoCharacter", refId: "c1", label: "Karina" },
    ]);
    expect(Reference.parse(`@[${"@[\\".repeat(50_000)}`)).toEqual([]);
  });
});
