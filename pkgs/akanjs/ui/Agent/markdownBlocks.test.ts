import { describe, expect, test } from "bun:test";
import { MarkdownBlocks } from "./markdownBlocks";

describe("MarkdownBlocks", () => {
  test("joins a paragraph's soft breaks and splits on a blank line", () => {
    expect(MarkdownBlocks.of("one\ntwo\n\nthree")).toEqual([
      { kind: "para", text: "one two" },
      { kind: "para", text: "three" },
    ]);
  });

  test("reads a heading level and stops the paragraph before it", () => {
    expect(MarkdownBlocks.of("intro\n## Summary\nbody")).toEqual([
      { kind: "para", text: "intro" },
      { kind: "heading", level: 2, text: "Summary" },
      { kind: "para", text: "body" },
    ]);
  });

  test("keeps a fenced block verbatim and ignores block syntax inside it", () => {
    const blocks = MarkdownBlocks.of("```ts\n# not a heading\n- not a list\n```\nafter");
    expect(blocks).toEqual([
      { kind: "code", lang: "ts", text: "# not a heading\n- not a list" },
      { kind: "para", text: "after" },
    ]);
  });

  test("closes an unclosed fence at the end of the text, as a mid-stream delta leaves it", () => {
    expect(MarkdownBlocks.of("```ts\nconst x = 1;")).toEqual([{ kind: "code", lang: "ts", text: "const x = 1;" }]);
  });

  test("keeps the fence's language and drops the rest of the info string", () => {
    expect(MarkdownBlocks.of("```tsx title=Chat.tsx\nx\n```")).toEqual([{ kind: "code", lang: "tsx", text: "x" }]);
    expect(MarkdownBlocks.of("```\nx\n```")).toEqual([{ kind: "code", text: "x" }]);
  });

  test("closes a fence only on its own marker", () => {
    expect(MarkdownBlocks.of("~~~\na ``` b\n~~~")).toEqual([{ kind: "code", text: "a ``` b" }]);
  });

  test("scores bullet nesting by indent and folds a lazy continuation into its item", () => {
    expect(MarkdownBlocks.of("- one\n  wrapped\n  - two\n    - three\n- four")).toEqual([
      {
        kind: "list",
        items: [
          { depth: 0, ordered: false, num: 0, text: "one wrapped" },
          { depth: 1, ordered: false, num: 0, text: "two" },
          { depth: 2, ordered: false, num: 0, text: "three" },
          { depth: 0, ordered: false, num: 0, text: "four" },
        ],
      },
    ]);
  });

  test("carries each ordered item's own number", () => {
    expect(MarkdownBlocks.of("3. c\n4. d")).toEqual([
      {
        kind: "list",
        items: [
          { depth: 0, ordered: true, num: 3, text: "c" },
          { depth: 0, ordered: true, num: 4, text: "d" },
        ],
      },
    ]);
  });

  test("keeps an indented bullet under a numbered step inside the same list", () => {
    expect(MarkdownBlocks.of("1. step\n   - point\n2. next")).toEqual([
      {
        kind: "list",
        items: [
          { depth: 0, ordered: true, num: 1, text: "step" },
          { depth: 1, ordered: false, num: 0, text: "point" },
          { depth: 0, ordered: true, num: 2, text: "next" },
        ],
      },
    ]);
  });

  test("starts a new list when the marker changes at the margin", () => {
    expect(MarkdownBlocks.of("1. a\n- b")).toEqual([
      { kind: "list", items: [{ depth: 0, ordered: true, num: 1, text: "a" }] },
      { kind: "list", items: [{ depth: 0, ordered: false, num: 0, text: "b" }] },
    ]);
  });

  test("joins a blockquote's lines and ends it on the first line that is not quoted", () => {
    expect(MarkdownBlocks.of("> a\n> b\nplain")).toEqual([
      { kind: "quote", text: "a b" },
      { kind: "para", text: "plain" },
    ]);
  });

  test("reads a dash run as a rule rather than as a bullet", () => {
    expect(MarkdownBlocks.of("a\n\n---\n\nb")).toEqual([
      { kind: "para", text: "a" },
      { kind: "rule" },
      { kind: "para", text: "b" },
    ]);
  });

  test("ends a paragraph at a table that follows it with no blank line between", () => {
    expect(MarkdownBlocks.of("Options:\n| a | b |\n| --- | --- |\n| 1 | 2 |")).toEqual([
      { kind: "para", text: "Options:" },
      { kind: "table", aligns: [null, null], head: ["a", "b"], rows: [["1", "2"]] },
    ]);
  });

  test("keeps a rule under a line that merely contains a pipe", () => {
    expect(MarkdownBlocks.of("a | b\n---")).toEqual([{ kind: "para", text: "a | b" }, { kind: "rule" }]);
  });

  test("normalizes CRLF and yields nothing for blank input", () => {
    expect(MarkdownBlocks.of("a\r\nb")).toEqual([{ kind: "para", text: "a b" }]);
    expect(MarkdownBlocks.of("   \n\n ")).toEqual([]);
  });
});
