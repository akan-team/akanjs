import { RichInlineReader } from "./richInlineReader";
import { RichMarkdownTable } from "./richMarkdownTable";
import { RichNode } from "./richNode";

type ListType = "bullet" | "number" | "check";

interface ListLine {
  depth: number;
  listType: ListType;
  start: number;
  checked: boolean;
  lines: string[];
}

interface IslandNode {
  type?: unknown;
  children?: unknown;
}

/**
 * Markdown as a Lexical document, built without an editor.
 *
 * `@lexical/markdown` needs a live editor and its transformer table reaches into client-only nodes, so a server
 * write — an MCP tool, a signal body — has no way to call it. This is that path, and the grammar `RichMarkdownWriter`
 * emits: CommonMark blocks plus task lists, `==highlight==`, ```` ```mermaid ```` diagrams, GFM or line-per-row HTML
 * tables, `<br>` for an empty paragraph, `<!-- -->` between two lists that must stay two, and an
 * ```` ```akan-node ```` fence carrying one node verbatim for everything markdown has no words for.
 */
export class RichMarkdownReader {
  static readonly islandFence = "akan-node";

  // The editor's registered vocabulary. `parseEditorState` rejects a whole document over one node type it does not
  // know, so an island naming anything else is read back as the code block it looks like instead.
  static readonly islandTypes: ReadonlySet<string> = new Set([
    "paragraph",
    "text",
    "linebreak",
    "tab",
    "heading",
    "quote",
    "list",
    "listitem",
    "link",
    "autolink",
    "code",
    "code-highlight",
    "horizontalrule",
    "table",
    "tablerow",
    "tablecell",
    "akan-mention",
    "akan-image",
    "akan-video",
    "akan-file",
    "akan-embed",
    "akan-callout",
    "akan-collapsible",
    "akan-collapsible-title",
    "akan-collapsible-content",
    "akan-excalidraw",
    "akan-mermaid",
    "akan-page-block",
  ]);

  static readonly #separator = /^\s*<!--.*-->\s*$/;
  static readonly #fence = /^ {0,3}(`{3,}|~{3,})(.*)$/;
  static readonly #rule = /^ {0,3}([-*_])[ \t]*(\1[ \t]*){2,}$/;
  static readonly #heading = /^ {0,3}(#{1,6})(?:[ \t](.*))?$/;
  static readonly #emptyParagraph = /^\s*<br\s*\/?>\s*$/i;
  static readonly #image = /^ {0,3}!\[((?:\\.|[^\]\\])*)\]\(([^()\s]+)\)\s*$/;
  static readonly #quote = /^ {0,3}>/;
  static readonly #listItem = /^( *)([-*+]|\d{1,9}[.)])(?:[ \t](.*))?$/;
  static readonly #mediaAligns: ReadonlySet<string> = new Set(["left", "center", "right"]);

  static read(markdown: string) {
    const blocks = new RichMarkdownReader(markdown).#run();
    return RichNode.root(blocks.length ? blocks : [RichNode.paragraph([])]);
  }

  readonly #lines: string[];
  readonly #blocks: object[] = [];
  #at = 0;

  constructor(markdown: string) {
    this.#lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  }

  #run() {
    while (this.#at < this.#lines.length) {
      const line = this.#lines[this.#at];
      if (!line.trim() || RichMarkdownReader.#separator.test(line)) this.#at += 1;
      else if (RichMarkdownReader.#fence.test(line)) this.#fenced();
      else if (RichMarkdownReader.#rule.test(line)) this.#take({ type: "horizontalrule", version: 1 });
      else if (RichMarkdownReader.#heading.test(line)) this.#headingBlock();
      else if (RichMarkdownReader.#emptyParagraph.test(line)) this.#take(RichMarkdownReader.#paragraph([]));
      else if (RichMarkdownReader.#image.test(line)) this.#imageBlock();
      else if (this.#tableAt(this.#at)) this.#table();
      else if (RichMarkdownReader.#quote.test(line)) this.#quoteBlock();
      else if (RichMarkdownReader.#listItemOf(line)) this.#list();
      else this.#paragraphBlock();
    }
    return this.#blocks;
  }

  #take(block: object) {
    this.#blocks.push(block);
    this.#at += 1;
  }

  #startsBlock(at: number) {
    const line = this.#lines[at];
    return (
      RichMarkdownReader.#separator.test(line) ||
      RichMarkdownReader.#fence.test(line) ||
      RichMarkdownReader.#rule.test(line) ||
      RichMarkdownReader.#heading.test(line) ||
      RichMarkdownReader.#emptyParagraph.test(line) ||
      RichMarkdownReader.#image.test(line) ||
      this.#tableAt(at) ||
      RichMarkdownReader.#quote.test(line) ||
      !!RichMarkdownReader.#listItemOf(line)
    );
  }

  // An unclosed fence runs to the end of the text rather than falling back to prose and losing the rest.
  #fenced() {
    const [, marker, info] = RichMarkdownReader.#fence.exec(this.#lines[this.#at]) ?? ["", "```", ""];
    const closing = new RegExp(`^ {0,3}\\${marker[0]}{${marker.length},}\\s*$`);
    const body: string[] = [];
    this.#at += 1;
    while (this.#at < this.#lines.length && !closing.test(this.#lines[this.#at])) {
      body.push(this.#lines[this.#at]);
      this.#at += 1;
    }
    this.#at += 1;
    const [language = "", ...attrs] = info.trim().split(/\s+/);
    const text = body.join("\n");
    if (language === RichMarkdownReader.islandFence) this.#blocks.push(RichMarkdownReader.#island(text));
    else if (language === "mermaid") this.#blocks.push(RichMarkdownReader.#mermaid(text, attrs));
    else this.#blocks.push(RichMarkdownReader.#code(text, language));
  }

  #headingBlock() {
    const [, hashes, text = ""] = RichMarkdownReader.#heading.exec(this.#lines[this.#at]) ?? [];
    this.#take(RichNode.block("heading", RichInlineReader.read(text), { tag: `h${hashes.length}` }));
  }

  #imageBlock() {
    const [, alt, src] = RichMarkdownReader.#image.exec(this.#lines[this.#at]) ?? [];
    this.#take({
      type: "akan-image",
      version: 1,
      src,
      alt: alt.replace(/\\(.)/g, "$1"),
      width: 0,
      height: 0,
      align: "center",
      fit: "contain",
    });
  }

  #quoteBlock() {
    const quoted: string[] = [];
    while (this.#at < this.#lines.length && RichMarkdownReader.#quote.test(this.#lines[this.#at])) {
      quoted.push(this.#lines[this.#at].replace(/^ {0,3}> ?/, ""));
      this.#at += 1;
    }
    this.#blocks.push(RichNode.block("quote", RichInlineReader.readLines(quoted)));
  }

  #paragraphBlock() {
    const lines = [this.#lines[this.#at]];
    this.#at += 1;
    while (this.#at < this.#lines.length && this.#lines[this.#at].trim() && !this.#startsBlock(this.#at)) {
      lines.push(this.#lines[this.#at]);
      this.#at += 1;
    }
    this.#blocks.push(RichMarkdownReader.#paragraph(RichInlineReader.readLines(lines)));
  }

  #tableAt(at: number) {
    return RichMarkdownTable.gfmAt(this.#lines, at) || RichMarkdownTable.htmlAt(this.#lines, at);
  }

  #table() {
    const { node, next } = RichMarkdownTable.gfmAt(this.#lines, this.#at)
      ? RichMarkdownTable.readGfm(this.#lines, this.#at)
      : RichMarkdownTable.readHtml(this.#lines, this.#at);
    this.#blocks.push(node);
    this.#at = next;
  }

  /**
   * Nesting follows indentation alone, so two spaces and four both work. A list that opens already indented is the
   * shape Lexical stores when the first item was tabbed in: its outer levels hold nothing but the nested list.
   */
  #list() {
    const items: ListLine[] = [];
    const opening = RichMarkdownReader.#listItemOf(this.#lines[this.#at])?.indent ?? 0;
    const indents = Array.from({ length: Math.floor(opening / 2) }, (_, level) => level * 2);
    while (this.#at < this.#lines.length) {
      const line = this.#lines[this.#at];
      const item = RichMarkdownReader.#listItemOf(line);
      if (item) {
        while (indents.length && (indents.at(-1) ?? 0) > item.indent) indents.pop();
        if (!indents.length || (indents.at(-1) ?? 0) < item.indent) indents.push(item.indent);
        items.push({ ...item, depth: indents.length - 1, lines: [item.text] });
        this.#at += 1;
      } else if (/^\s+\S/.test(line) && !this.#startsBlock(this.#at)) {
        items.at(-1)?.lines.push(line.trim());
        this.#at += 1;
      } else if (!line.trim() && RichMarkdownReader.#listItemOf(this.#lines[this.#at + 1] ?? "")) this.#at += 1;
      else break;
    }
    for (let at = 0; at < items.length; ) {
      const { node, next } = RichMarkdownReader.#listNode(items, at, 0);
      this.#blocks.push(node);
      at = next;
    }
  }

  static #listItemOf(line: string) {
    const match = RichMarkdownReader.#listItem.exec(line);
    if (!match) return null;
    const [, indent, marker, rest = ""] = match;
    if (/^\d/.test(marker))
      return {
        indent: indent.length,
        listType: "number" as ListType,
        start: Number.parseInt(marker, 10),
        checked: false,
        text: rest,
      };
    const task = /^\[([ xX])\](?:[ \t](.*))?$/.exec(rest);
    if (task)
      return {
        indent: indent.length,
        listType: "check" as ListType,
        start: 1,
        checked: task[1] !== " ",
        text: task[2] ?? "",
      };
    return { indent: indent.length, listType: "bullet" as ListType, start: 1, checked: false, text: rest };
  }

  /**
   * One list at `depth`, the way Lexical stores nesting: a deeper run becomes a list inside an item of its own, and
   * `value` counts only the items that hold text — `updateChildrenListItemValue` skips the wrapper.
   */
  static #listNode(items: ListLine[], from: number, depth: number): { node: object; next: number } {
    const first = items[from];
    const { listType } = first;
    const start = first.depth === depth ? first.start : 1;
    const children: object[] = [];
    let at = from;
    let value = start;
    while (at < items.length && items[at].depth >= depth) {
      const item = items[at];
      if (item.depth > depth) {
        const nested = RichMarkdownReader.#listNode(items, at, depth + 1);
        children.push(RichNode.block("listitem", [nested.node], { indent: depth, value }));
        at = nested.next;
        continue;
      }
      if (at !== from && item.listType !== listType) break;
      const checked = listType === "check" ? { checked: item.checked } : {};
      children.push(
        RichNode.block("listitem", RichInlineReader.readLines(item.lines), { indent: depth, value, ...checked }),
      );
      value += 1;
      at += 1;
    }
    const tag = listType === "number" ? "ol" : "ul";
    return { node: RichNode.block("list", children, { listType, start, tag }), next: at };
  }

  static #paragraph(children: object[]) {
    const first = children[0] as { type?: string; format?: unknown } | undefined;
    const textFormat = first?.type === "text" ? first.format : 0;
    return RichNode.block("paragraph", children, { textFormat, textStyle: "" });
  }

  static #code(code: string, language: string) {
    return RichNode.block("code", code ? [RichNode.text(code)] : [], language ? { language } : {});
  }

  static #mermaid(code: string, attrs: string[]) {
    const attr = Object.fromEntries(attrs.map((pair) => pair.split("=") as [string, string | undefined]));
    const width = Number.parseInt(attr.width ?? "", 10);
    const align = attr.align && RichMarkdownReader.#mediaAligns.has(attr.align) ? attr.align : "center";
    return { type: "akan-mermaid", version: 1, code, width: Number.isFinite(width) ? width : 0, align };
  }

  static #island(json: string) {
    const node = RichMarkdownReader.#json(json);
    return RichMarkdownReader.#isNode(node) ? node : RichMarkdownReader.#code(json, RichMarkdownReader.islandFence);
  }

  static #json(text: string): unknown {
    try {
      return JSON.parse(text);
    } catch {
      return undefined;
    }
  }

  static #isNode(value: unknown): value is object {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    const { type, children } = value as IslandNode;
    if (typeof type !== "string" || !RichMarkdownReader.islandTypes.has(type)) return false;
    return children === undefined || (Array.isArray(children) && children.every(RichMarkdownReader.#isNode));
  }
}
