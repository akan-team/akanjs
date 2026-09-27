import { describe, expect, test } from "bun:test";

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
});
