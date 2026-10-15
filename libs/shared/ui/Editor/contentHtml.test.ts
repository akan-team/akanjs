import { describe, expect, test } from "bun:test";
import { RichNode } from "@libs/shared/common";

import { ContentHtml } from "./contentHtml.util";

const doc = (...children: unknown[]) => ({ root: { type: "root", version: 1, children } });
const text = (value: string, format = 0) => ({
  type: "text",
  version: 1,
  text: value,
  format,
  style: "",
  mode: "normal",
  detail: 0,
});
const paragraph = (...children: unknown[]) => ({ type: "paragraph", version: 1, children });

describe("ContentHtml", () => {
  test("renders a paragraph of plain text", () => {
    const html = ContentHtml.render(doc(paragraph(text("hello"))));
    expect(html).toContain("<p");
    expect(html).toContain("hello");
  });

  test("escapes text rather than emitting it as markup", () => {
    const html = ContentHtml.render(doc(paragraph(text("<script>alert(1)</script>"))));
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  test("nests the format bits a text node carries", () => {
    const html = ContentHtml.render(doc(paragraph(text("bold", 1), text("code", 16))));
    expect(html).toContain("font-bold");
    expect(html).toContain("<code");
  });

  test("draws an empty paragraph as a line break so it keeps its height", () => {
    expect(ContentHtml.render(doc(paragraph()))).toContain("<br />");
  });

  test("renders headings, quotes, lists and a rule", () => {
    const html = ContentHtml.render(
      doc(
        { type: "heading", version: 1, tag: "h2", children: [text("Title")] },
        { type: "quote", version: 1, children: [text("quoted")] },
        {
          type: "list",
          version: 1,
          listType: "number",
          tag: "ol",
          start: 1,
          children: [{ type: "listitem", version: 1, value: 1, children: [text("one")] }],
        },
        { type: "horizontalrule", version: 1 },
      ),
    );
    expect(html).toContain("<h2");
    expect(html).toContain("<blockquote");
    expect(html).toContain("<ol");
    expect(html).toContain("<li");
    expect(html).toContain("<hr");
  });

  test("keeps a checklist item's checked and unchecked skins apart", () => {
    const item = (checked: boolean) =>
      ContentHtml.render(
        doc({
          type: "list",
          version: 1,
          listType: "check",
          tag: "ul",
          children: [{ type: "listitem", version: 1, value: 1, checked, children: [text("task")] }],
        }),
      );
    expect(item(true)).toContain("line-through");
    expect(item(false)).not.toContain("line-through");
  });

  test("links only to schemes that cannot execute", () => {
    const link = (url: string) =>
      ContentHtml.render(doc(paragraph({ type: "link", version: 1, url, children: [text("go")] })));
    expect(link("https://example.com")).toContain('href="https://example.com"');
    expect(link("/org/1")).toContain('href="/org/1"');
    expect(link("javascript:alert(1)")).toBeNull();
  });

  test("adds noreferrer to a link that opens a new tab", () => {
    const html = ContentHtml.render(
      doc(
        paragraph({ type: "link", version: 1, url: "https://example.com", target: "_blank", children: [text("go")] }),
      ),
    );
    expect(html).toContain('rel="noreferrer noopener"');
  });

  test("renders a table with header cells and spans", () => {
    const html = ContentHtml.render(
      doc({
        type: "table",
        version: 1,
        children: [
          {
            type: "tablerow",
            version: 1,
            children: [
              { type: "tablecell", version: 1, headerState: 1, colSpan: 2, children: [text("head")] },
              { type: "tablecell", version: 1, headerState: 0, children: [text("cell")] },
            ],
          },
        ],
      }),
    );
    expect(html).toContain("<th");
    expect(html).toContain('colspan="2"');
    expect(html).toContain("<td");
  });

  test("renders a callout by its variant and a mention as a chip", () => {
    const html = ContentHtml.render(
      doc(
        { type: "akan-callout", version: 1, variant: "warning", children: [paragraph(text("careful"))] },
        paragraph({ type: "akan-mention", version: 1, text: "@ada", label: "@ada", href: "/user/1", format: 0 }),
      ),
    );
    expect(html).toContain("bg-warning/10");
    expect(html).toContain('href="/user/1"');
  });

  // A chip with no href is a reference, and an anchor would invent a link the model never had.
  test("renders a mention that carries no href as a plain span", () => {
    const html = ContentHtml.render(
      doc(paragraph({ type: "akan-mention", version: 1, text: "@ada", label: "@ada", format: 0 })),
    );
    expect(html).toContain("<span");
    expect(html).not.toContain("href=");
    expect(html).not.toContain("cursor-pointer");
  });

  // The whole document falls back, never part of it: a page rendered with its diagram missing is worse
  // than one rendered by the client editor.
  test("returns null for a node it cannot draw", () => {
    expect(ContentHtml.render(doc({ type: "akan-excalidraw", version: 1, data: "{}" }))).toBeNull();
    expect(ContentHtml.render(doc(paragraph({ type: "akan-page-block", version: 1, pageBlockId: "1" })))).toBeNull();
    expect(ContentHtml.render(doc(paragraph(text("x", 32))))).toBeNull();
  });

  test("returns null for content that is not a Lexical document", () => {
    expect(ContentHtml.render(null)).toBeNull();
    expect(ContentHtml.render([])).toBeNull();
    expect(ContentHtml.render({ nope: true })).toBeNull();
  });

  // A throw here is a 500 on the page that embeds the document, so a malformed node falls back like any
  // other node it cannot draw.
  test("returns null rather than throwing on a malformed node", () => {
    expect(ContentHtml.render(doc(null))).toBeNull();
    expect(ContentHtml.render(doc("a string where a node belongs"))).toBeNull();
    expect(ContentHtml.render(doc(paragraph(null, text("after"))))).toBeNull();
    expect(ContentHtml.render({ root: { type: "root", version: 1, children: "not an array" } })).toBe("");
  });

  test("links a mention chip only to a path on this site", () => {
    const chip = (href: string) =>
      ContentHtml.render(doc(paragraph({ type: "akan-mention", version: 1, label: "ada", href, format: 0 })));
    expect(chip("/user/1")).toContain('href="/user/1"');
    for (const href of ["https://evil.com", "//evil.com", "/\\evil.com", "javascript:x"]) {
      expect(chip(href)).not.toContain("href=");
      expect(chip(href)).toContain("ada");
    }
  });

  test("draws links and chips without a target under disableHref", () => {
    const html = ContentHtml.render(
      doc(
        paragraph(
          { type: "link", version: 1, url: "https://example.com", children: [text("site")] },
          { type: "akan-mention", version: 1, label: "ada", href: "/user/1", format: 0 },
        ),
      ),
      { disableHref: true },
    );
    expect(html).toContain("site");
    expect(html).toContain("ada");
    expect(html).not.toContain("href=");
  });

  test("draws an unlinked autolink as its text, and a callout stored without a variant as info", () => {
    const html = ContentHtml.render(
      doc(
        paragraph({ type: "autolink", version: 1, url: "https://a.com", isUnlinked: true, children: [text("a.com")] }),
        { type: "akan-callout", version: 1, children: [text("note")] },
      ),
    );
    expect(html).not.toContain("<a");
    expect(html).toContain("bg-info/10");
  });
});

describe("ContentHtml fidelity", () => {
  test("numbers every ordered item itself, so a nested list's wrapper does not shift the count", () => {
    const item = (value: number, ...children: unknown[]) => ({ type: "listitem", version: 1, value, children });
    const html = ContentHtml.render(
      doc({
        type: "list",
        version: 1,
        listType: "number",
        children: [
          item(1, text("one")),
          item(2, { type: "list", version: 1, listType: "bullet", children: [item(1, text("inner"))] }),
          item(2, text("two")),
        ],
      }),
    );
    expect(html?.match(/<li[^>]*value="\d+"/g)?.length).toBe(3);
    expect(html).toContain('value="2">two</li>');
    expect(html).toContain('<li class="pl-2">inner</li>');
  });

  test("draws a block's alignment, indent and direction from fixed vocabularies only", () => {
    const html = ContentHtml.render(
      doc(
        { type: "paragraph", version: 1, format: "center", indent: 2, direction: "rtl", children: [text("x")] },
        { type: "paragraph", version: 1, format: 'center;" onclick="x', indent: 999, children: [text("y")] },
      ),
    );
    expect(html).toContain('style="text-align: center; padding-inline-start: 80px" dir="rtl"');
    expect(html).not.toContain("onclick");
    expect(html).toContain("padding-inline-start: 800px");
  });
});

describe("ContentHtml.resolve", () => {
  const pageBlock = { type: "akan-page-block", version: 1, pageBlockId: "p1", title: "Child", emoji: null };

  test("swaps a plugin node for its stand-in, which both renderers can draw", () => {
    const resolved = ContentHtml.resolve(doc(paragraph(text("intro")), pageBlock), {
      "akan-page-block": () => RichNode.paragraph([RichNode.link("/pages/p1", [RichNode.text("Child")])]),
    });
    const html = ContentHtml.render(resolved);
    expect(html).toContain('href="/pages/p1"');
    expect(html).toContain("Child");
  });

  // The client fallback parses nothing else: one unregistered type and it would open the whole document empty.
  test("leaves out a node the editor does not register, and a child that is no node", () => {
    const resolved = ContentHtml.resolve(doc(paragraph(text("kept"), null), pageBlock, { type: "akan-unknown" }));
    expect(resolved).toEqual(doc(paragraph(text("kept"))));
  });

  test("hands back a document with nothing to resolve as the same object", () => {
    const clean = doc(paragraph(text("plain")));
    expect(ContentHtml.resolve(clean)).toBe(clean);
    expect(ContentHtml.resolve(null)).toBeNull();
  });
});
