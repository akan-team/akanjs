import { describe, expect, it } from "bun:test";

import { RichContentShape } from "./richContentShape";
import { RichMarkdownReader } from "./richMarkdownReader";
import { RichMarkdownWriter } from "./richMarkdownWriter";

const text = (value: string, format = 0) => ({
  detail: 0,
  format,
  mode: "normal",
  style: "",
  text: value,
  type: "text",
  version: 1,
});
const element = (type: string, children: object[], extra: object = {}) => ({
  children,
  direction: "ltr",
  format: "",
  indent: 0,
  type,
  version: 1,
  ...extra,
});
const paragraph = (children: object[], extra: object = {}) =>
  element("paragraph", children, { textFormat: 0, textStyle: "", ...extra });
const cell = (headerState: number, value: string, extra: object = {}) =>
  element("tablecell", [paragraph([text(value)])], {
    backgroundColor: null,
    colSpan: 1,
    headerState,
    rowSpan: 1,
    ...extra,
  });
const doc = (...children: object[]) => ({ root: element("root", children) });

const reread = (markdown: string) => (RichMarkdownReader.read(markdown).root as { children: unknown[] }).children;
const expectLossless = (content: { root: { children: unknown[] } }) => {
  const markdown = RichMarkdownWriter.write(content);
  expect(RichContentShape.same(reread(markdown), content.root.children)).toBe(true);
  return markdown;
};

describe("RichMarkdownWriter round-trips markdown it did not write", () => {
  const samples = [
    "# Title\n\nA paragraph with **bold**, _italic_, ~~strike~~, ==highlight== and `code`.",
    "**bold _and italic_ inside** then plain",
    "- a\n  - nested\n    - deeper\n- b",
    "1. one\n2. two\n   - mixed child",
    "- [x] done\n- [ ] todo",
    "> quoted\n> twice",
    "```ts\nconst a = `tick`;\n```",
    "| a | b |\n| --- | --- |\n| 1 | 2 |",
    'Visit <https://a.com> or [the site](https://a.com "Site").',
    "cc @[Kim [lead]](mention:user/u1) please",
    "```mermaid\ngraph TD\n  A-->B\n```",
    "---",
    "Literal \\*stars\\*, snake_case, \\# not a heading, 1\\. not a list",
  ];
  for (const markdown of samples) {
    it(`keeps ${JSON.stringify(markdown.slice(0, 40))} as markdown and loses nothing`, () => {
      const content = RichMarkdownReader.read(markdown) as { root: { children: unknown[] } };
      const written = expectLossless(content);
      expect(written).not.toContain(RichMarkdownReader.islandFence);
      expect(RichMarkdownWriter.write(RichMarkdownReader.read(written))).toBe(written);
    });
  }
});

describe("RichMarkdownWriter on documents the editor stored", () => {
  it("writes a code block split into highlight tokens as one fence", () => {
    const code = element(
      "code",
      [
        { ...text("const"), type: "code-highlight", highlightType: "keyword" },
        text(" a"),
        { type: "linebreak", version: 1 },
        { type: "tab", version: 1 },
        text("b"),
      ],
      { language: "javascript" },
    );
    expect(expectLossless(doc(code))).toBe("```javascript\nconst a\n\tb\n```");
  });

  it("writes a list whose first item was tabbed in, and keeps it apart from the list after it", () => {
    const tabbed = element(
      "list",
      [
        element(
          "listitem",
          [
            element("list", [element("listitem", [text("in")], { indent: 1, value: 1 })], {
              listType: "bullet",
              start: 1,
              tag: "ul",
            }),
          ],
          { value: 1 },
        ),
      ],
      { listType: "bullet", start: 1, tag: "ul" },
    );
    const next = element("list", [element("listitem", [text("next")], { value: 1 })], {
      listType: "number",
      start: 1,
      tag: "ol",
    });
    const markdown = expectLossless(doc(tabbed, next));
    expect(markdown).toBe("  - in\n\n<!-- -->\n\n1. next");
  });

  it("writes a table with no header row, or with a header column, as HTML rather than a JSON island", () => {
    const plain = element("table", [element("tablerow", [cell(0, "a"), cell(0, "b")])]);
    const column = element("table", [
      element("tablerow", [cell(3, "k"), cell(1, "v")]),
      element("tablerow", [cell(2, "row"), cell(0, "x", { backgroundColor: "#eee" })]),
    ]);
    const markdown = expectLossless(doc(plain, column));
    expect(markdown).toContain("<table>");
    expect(markdown).not.toContain(RichMarkdownReader.islandFence);
  });

  it("keeps empty paragraphs, empty lines and a trailing line break", () => {
    const markdown = expectLossless(
      doc(paragraph([text("a"), { type: "linebreak", version: 1 }]), paragraph([]), paragraph([text("b")])),
    );
    expect(markdown).toBe("a\n\\\n\n<br>\n\nb");
  });

  it("keeps a heading's surrounding spaces and a link the toolbar made", () => {
    const heading = element("heading", [text(" spaced "), text("bold", 1)], { tag: "h3" });
    const link = paragraph([
      element("link", [text("site")], { rel: "noreferrer", target: null, title: null, url: "https://a.com" }),
    ]);
    expect(expectLossless(doc(heading, link))).toBe("###  spaced **bold**\n\n[site](https://a.com)");
  });

  it("keeps what markdown cannot say verbatim, and only that block", () => {
    const indented = paragraph([text("indented")], { indent: 1 });
    const underlined = paragraph([text("under", 8)]);
    const image = {
      type: "akan-image",
      version: 1,
      fileId: "f1",
      src: "https://a.com/i.png",
      alt: "",
      width: 10,
      height: 10,
      align: "center",
      fit: "contain",
    };
    const markdown = expectLossless(doc(indented, underlined, image, paragraph([text("plain")])));
    expect(markdown.match(new RegExp(`\`\`\`${RichMarkdownReader.islandFence}`, "g"))?.length).toBe(3);
    expect(markdown.endsWith("\n\nplain")).toBe(true);
  });

  it("writes the empty document and legacy values without inventing content", () => {
    expect(RichMarkdownWriter.write(RichMarkdownReader.read(""))).toBe("");
    expect(RichMarkdownWriter.write([])).toBe("");
    expect(RichMarkdownWriter.write(null)).toBe("");
    expect(RichMarkdownWriter.write("plain legacy text")).toBe("plain legacy text");
  });
});
