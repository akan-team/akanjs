import { describe, expect, test } from "bun:test";
import { MarkdownSpans } from "./markdownSpans";

describe("MarkdownSpans", () => {
  test("links the innermost label when an unclosed bracket comes before it", () => {
    expect(MarkdownSpans.of("see [the [docs](https://bun.com/docs)")).toEqual([
      { kind: "text", text: "see [the " },
      { kind: "link", text: "docs", href: "https://bun.com/docs" },
    ]);
  });

  test("reads a link's scheme the way the URL parser does", () => {
    for (const href of ["\u0001javascript:x", "\u0000javascript:x", "\u001fvbscript:x"])
      expect(MarkdownSpans.of(`[go](${href})`)).toEqual([{ kind: "plain", text: "go" }]);
    for (const href of [" javascript:x", "java\tscript:x", "java\nscript:x", "\r\ndata:text/html,x"])
      expect(MarkdownSpans.isSafeHref(href)).toBe(false);
    expect(MarkdownSpans.isSafeHref("\u0001https://bun.com")).toBe(true);
    expect(MarkdownSpans.isSafeHref("/docs/intro")).toBe(true);
  });

  test("keeps a run of brackets nothing closes as text", () => {
    const text = `[${"[\\".repeat(50_000)}`;
    expect(MarkdownSpans.of(text)).toEqual([{ kind: "text", text }]);
  });
});
