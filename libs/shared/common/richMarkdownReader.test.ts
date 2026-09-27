import { describe, expect, it } from "bun:test";

import { RichMarkdownReader } from "./richMarkdownReader";

interface Node {
  type: string;
  text?: string;
  format?: number | string;
  children?: Node[];
  [key: string]: unknown;
}

const blocks = (markdown: string) => (RichMarkdownReader.read(markdown).root as { children: Node[] }).children;
const texts = (node: Node): string[] =>
  node.type === "text" ? [node.text ?? ""] : (node.children ?? []).flatMap((child) => texts(child));

describe("RichMarkdownReader lists", () => {
  it("nests by indentation the way Lexical stores it: a wrapper item, a depth indent, and no number for the wrapper", () => {
    const [list] = blocks("- a\n  - b\n  - c\n- d");
    expect(list.children?.map((item) => [item.indent, item.value, item.children?.[0]?.type])).toEqual([
      [0, 1, "text"],
      [0, 2, "list"],
      [0, 2, "text"],
    ]);
    const nested = list.children?.[1].children?.[0];
    expect(nested?.children?.map((item) => [item.indent, texts(item).join("")])).toEqual([
      [1, "b"],
      [1, "c"],
    ]);
  });

  it("reads a list that opens indented as an outer list holding only the nested one", () => {
    const [list] = blocks("  - tabbed in");
    expect(list.children?.length).toBe(1);
    expect(list.children?.[0].children?.[0].type).toBe("list");
    expect(list.children?.[0].children?.[0].children?.[0].indent).toBe(1);
  });

  it("reads task items as a checklist and keeps an ordered list's own start", () => {
    const [check] = blocks("- [x] done\n- [ ] todo");
    expect(check.listType).toBe("check");
    expect(check.children?.map((item) => item.checked)).toEqual([true, false]);
    const [ordered] = blocks("3. three\n4. four");
    expect([ordered.listType, ordered.start, ordered.tag]).toEqual(["number", 3, "ol"]);
  });

  it("keeps two lists apart across a `<!-- -->` line and merges them without one", () => {
    expect(blocks("- a\n\n<!-- -->\n\n- b").map((block) => block.type)).toEqual(["list", "list"]);
    expect(blocks("- a\n\n- b").map((block) => block.type)).toEqual(["list"]);
  });
});

describe("RichMarkdownReader tables", () => {
  it("reads a GFM table with a header row, unescaping a pipe even inside a code span", () => {
    const [table] = blocks("| a | b |\n| --- | --- |\n| `x\\|y` | c<br>d |");
    const [header, body] = table.children ?? [];
    expect(header.children?.map((cell) => cell.headerState)).toEqual([1, 1]);
    expect(body.children?.map((cell) => cell.headerState)).toEqual([0, 0]);
    expect(body.children?.[0].children?.[0].children?.[0]).toMatchObject({ text: "x|y", format: 16 });
    expect(body.children?.[1].children?.[0].children?.map((node) => node.type)).toEqual(["text", "linebreak", "text"]);
  });

  it("reads an HTML table carrying what GFM cannot: header states, spans, a fill and an indented paragraph", () => {
    const [table] = blocks(
      [
        "<table>",
        '<tr><th data-header="3">a</th><th data-header="2">b</th></tr>',
        '<tr><th colspan="2" data-bg="#eee"><p data-indent="1">c</p></th><td>d</td></tr>',
        "</table>",
      ].join("\n"),
    );
    const [first, second] = table.children ?? [];
    expect(first.children?.map((cell) => cell.headerState)).toEqual([3, 2]);
    expect(second.children?.[0]).toMatchObject({ headerState: 1, colSpan: 2, backgroundColor: "#eee" });
    expect(second.children?.[0].children?.[0].indent).toBe(1);
    expect(second.children?.[1].headerState).toBe(0);
  });
});

describe("RichMarkdownReader blocks", () => {
  it("reads a mermaid fence with its size and alignment", () => {
    expect(blocks("```mermaid width=640 align=left\ngraph TD\n```")[0]).toEqual({
      type: "akan-mermaid",
      version: 1,
      code: "graph TD",
      width: 640,
      align: "left",
    });
  });

  it("reads an image on a line of its own", () => {
    expect(blocks("![logo](https://x.com/a.png)")[0]).toMatchObject({ type: "akan-image", src: "https://x.com/a.png" });
  });

  it("reads an akan-node fence verbatim, and one naming an unregistered node as the code block it looks like", () => {
    const callout = { type: "akan-callout", version: 1, children: [] };
    expect(blocks(`\`\`\`akan-node\n${JSON.stringify(callout)}\n\`\`\``)[0]).toEqual(callout);
    const [code] = blocks('```akan-node\n{"type":"script"}\n```');
    expect(code.type).toBe("code");
    expect(texts(code).join("")).toBe('{"type":"script"}');
  });

  it("reads `<br>` as an empty paragraph and a lone backslash as an empty line inside one", () => {
    expect(blocks("<br>")[0].children).toEqual([]);
    expect(blocks("a\n\\\nb")[0].children?.map((node) => node.type)).toEqual([
      "text",
      "linebreak",
      "linebreak",
      "text",
    ]);
  });

  it("keeps the spaces around a heading's text", () => {
    expect(texts(blocks("###  title ")[0])).toEqual([" title "]);
  });
});

describe("RichMarkdownReader inline", () => {
  it("honours backslash escapes and never opens `_` inside a word", () => {
    expect(blocks("\\*not italic\\* and snake_case_name")[0].children).toEqual([
      expect.objectContaining({ text: "*not italic* and snake_case_name", format: 0 }),
    ]);
    expect(blocks("an _italic_ word")[0].children?.[1]).toMatchObject({ text: "italic", format: 2 });
  });

  it("reads highlight, a bare autolink and an autolink whose text is not its url", () => {
    expect(blocks("==hot==")[0].children?.[0]).toMatchObject({ text: "hot", format: 128 });
    expect(blocks("<https://a.com>")[0].children?.[0]).toMatchObject({ type: "autolink", url: "https://a.com" });
    expect(blocks("[a.com](<https://a.com/>)")[0].children?.[0]).toMatchObject({
      type: "autolink",
      url: "https://a.com/",
    });
  });

  it("reads a link title and leaves rel/target to the editor's default", () => {
    expect(blocks('[a](https://a.com "A \\"quoted\\" title")')[0].children?.[0]).toMatchObject({
      type: "link",
      url: "https://a.com",
      title: 'A "quoted" title',
      rel: null,
      target: null,
    });
  });
});
