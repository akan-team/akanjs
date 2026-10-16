import { describe, expect, test } from "bun:test";
import { MarkdownSpans } from "./markdownSpans";

describe("MarkdownSpans", () => {
  test("links the innermost label when an unclosed bracket comes before it", () => {
    expect(MarkdownSpans.of("see [the [docs](https://bun.com/docs)")).toEqual([
      { kind: "text", text: "see [the " },
      { kind: "link", text: "docs", href: "https://bun.com/docs" },
    ]);
  });

  test("keeps a run of brackets nothing closes as text", () => {
    const text = `[${"[\\".repeat(50_000)}`;
    expect(MarkdownSpans.of(text)).toEqual([{ kind: "text", text }]);
  });
});
