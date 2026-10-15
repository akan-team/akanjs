import { RichNode, type RichNodeLike, RichUrl } from "@libs/shared/common";

import { akanEditorTheme, type CalloutVariant, calloutVariants, mentionChip, mentionChipLink } from "./Lexical/theme";

interface ContentNode extends RichNodeLike {
  children?: ContentNode[];
  format?: number | string;
  indent?: number;
  direction?: string | null;
  tag?: string;
  url?: string;
  target?: string | null;
  rel?: string | null;
  isUnlinked?: boolean;
  listType?: string;
  start?: number;
  checked?: boolean;
  value?: number;
  variant?: string;
  headerState?: number;
  colSpan?: number;
  rowSpan?: number;
  href?: string | null;
  label?: string;
  highlightType?: string;
}

/** Per plugin node type, the built-in nodes it reads as where no plugin is mounted — null leaves it out. */
export interface ContentStandIns {
  [type: string]: (node: RichNodeLike) => object | null;
}

export interface ContentHtmlOptions {
  /** Draws links and mention chips without a target, for a page whose readers cannot open the app's routes. */
  disableHref?: boolean;
}

/**
 * Lexical JSON to HTML, for rendering a stored document from a server component.
 *
 * Returns `null` — never partial HTML — as soon as it meets a node it does not know how to draw, so a
 * document holding an Excalidraw board falls back to the client editor whole rather than rendering with
 * pieces missing. The class names come from `akanEditorTheme`, which is what keeps the server render and
 * the editor's own render looking the same.
 */
export class ContentHtml {
  /** Lexical `TextNode` format bits, in the order they must be nested. */
  static readonly #textFormats = [
    [1, "bold"],
    [2, "italic"],
    [4, "strikethrough"],
    [8, "underline"],
    [16, "code"],
    [128, "highlight"],
  ] as const;
  static readonly #headingTags: ReadonlySet<string> = new Set(["h1", "h2", "h3", "h4", "h5", "h6"]);
  static readonly #aligns: ReadonlySet<string> = new Set(["left", "start", "center", "right", "end", "justify"]);
  // Lexical indents a block by `--lexical-indent-base-value`, 40px unless a theme says otherwise.
  static readonly #indentPx = 40;
  static readonly #maxIndent = 20;

  readonly #options: ContentHtmlOptions;
  #failed = false;

  constructor(options: ContentHtmlOptions) {
    this.#options = options;
  }

  static render(content: unknown, options: ContentHtmlOptions = {}): string | null {
    try {
      return new ContentHtml(options).#run(content);
    } catch {
      // Stored content is an `Any` column, so a node can be anything a writer put there. Null is the
      // caller's fallback path; a throw here is a 500 on a page that is otherwise fine.
      return null;
    }
  }

  /**
   * The document as both renderers can take it: a plugin's node swapped for its stand-in, and any other node
   * the editor does not register left out. The client fallback parses nothing else — `parseEditorState`
   * refuses a whole document over one type it does not know — so this is what keeps it from drawing nothing.
   */
  static resolve<T>(content: T, standIns: ContentStandIns = {}): T {
    if (!RichNode.isDocument(content)) return content;
    const [root] = ContentHtml.#resolved(content.root, standIns, 0);
    return root === content.root ? content : ({ ...content, root } as T);
  }

  static escape(text: string) {
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  static #resolved(value: unknown, standIns: ContentStandIns, depth: number): unknown[] {
    if (!RichNode.isNode(value) || depth > RichNode.maxDepth) return [];
    const standIn = value.type ? standIns[value.type] : undefined;
    if (standIn) {
      const replaced = standIn(value);
      return replaced ? [replaced] : [];
    }
    if (value.type && !RichNode.editorTypes.has(value.type)) return [];
    if (!Array.isArray(value.children)) return [value];
    let changed = false;
    const children = value.children.flatMap((child) => {
      const kept = ContentHtml.#resolved(child, standIns, depth + 1);
      if (kept.length !== 1 || kept[0] !== child) changed = true;
      return kept;
    });
    return [changed ? { ...value, children } : value];
  }

  #run(content: unknown) {
    const root = (content as { root?: ContentNode } | null | undefined)?.root;
    if (!root || typeof root !== "object") return null;
    const html = this.#children(root);
    return this.#failed ? null : html;
  }

  #fail() {
    this.#failed = true;
    return "";
  }

  #children(node: ContentNode) {
    const children = Array.isArray(node.children) ? node.children : [];
    return children.map((child) => this.#node(child)).join("");
  }

  #tag(name: string, className: string, inner: string, attrs = "") {
    const classAttr = className ? ` class="${ContentHtml.escape(className)}"` : "";
    return `<${name}${classAttr}${attrs}>${inner}</${name}>`;
  }

  #node(node: ContentNode): string {
    if (this.#failed) return "";
    // The type is a claim about stored JSON, not a check on it — a null or scalar child reaches here.
    if (!node || typeof node !== "object") return this.#fail();
    switch (node.type) {
      case "text":
        return this.#text(node);
      case "linebreak":
        return "<br />";
      case "tab":
        return "\t";
      case "paragraph":
        return this.#tag(
          "p",
          akanEditorTheme.paragraph ?? "",
          this.#children(node) || "<br />",
          this.#blockAttrs(node),
        );
      case "heading":
        return this.#heading(node);
      case "quote":
        return this.#tag("blockquote", akanEditorTheme.quote ?? "", this.#children(node), this.#blockAttrs(node));
      case "list":
        return this.#list(node);
      case "listitem":
        return this.#listItem(node, false);
      case "link":
      case "autolink":
        return this.#link(node);
      case "code":
        return this.#tag("pre", akanEditorTheme.code ?? "", this.#children(node));
      case "code-highlight":
        return this.#codeHighlight(node);
      case "horizontalrule":
        return `<hr class="${ContentHtml.escape(akanEditorTheme.hr ?? "")}" />`;
      case "table":
        return this.#tag("table", akanEditorTheme.table ?? "", this.#children(node));
      case "tablerow":
        return this.#tag("tr", akanEditorTheme.tableRow ?? "", this.#children(node));
      case "tablecell":
        return this.#tableCell(node);
      case "akan-callout":
        return this.#callout(node);
      case "akan-mention":
        return this.#mention(node);
      default:
        return this.#fail();
    }
  }

  #text(node: ContentNode) {
    const format = typeof node.format === "number" ? node.format : 0;
    // Subscript and superscript need a tag this renderer does not emit; fall back rather than lose them.
    if (format & 32 || format & 64) return this.#fail();
    let html = ContentHtml.escape(node.text ?? "");
    const theme = akanEditorTheme.text ?? {};
    const underlineStrikethrough = format & 4 && format & 8;
    for (const [bit, key] of ContentHtml.#textFormats) {
      if (!(format & bit)) continue;
      if (underlineStrikethrough && (key === "strikethrough" || key === "underline")) continue;
      html = this.#tag(key === "code" ? "code" : "span", theme[key] ?? "", html);
    }
    if (underlineStrikethrough) html = this.#tag("span", theme.underlineStrikethrough ?? "", html);
    return html;
  }

  #heading(node: ContentNode) {
    const tag = node.tag ?? "h1";
    if (!ContentHtml.#headingTags.has(tag)) return this.#fail();
    const heading = akanEditorTheme.heading ?? {};
    return this.#tag(tag, heading[tag as "h1"] ?? "", this.#children(node), this.#blockAttrs(node));
  }

  // The alignment, indent and direction the editor draws a block with, from fixed vocabularies only.
  #blockAttrs(node: ContentNode) {
    const styles: string[] = [];
    if (typeof node.format === "string" && ContentHtml.#aligns.has(node.format))
      styles.push(`text-align: ${node.format}`);
    const indent = typeof node.indent === "number" ? Math.min(Math.trunc(node.indent), ContentHtml.#maxIndent) : 0;
    if (indent > 0) styles.push(`padding-inline-start: ${indent * ContentHtml.#indentPx}px`);
    const style = styles.length ? ` style="${styles.join("; ")}"` : "";
    return node.direction === "rtl" ? `${style} dir="rtl"` : style;
  }

  #list(node: ContentNode) {
    const list = akanEditorTheme.list ?? {};
    const ordered = node.listType === "number";
    const start = ordered && node.start && node.start !== 1 ? ` start="${Math.trunc(node.start)}"` : "";
    const items = (Array.isArray(node.children) ? node.children : [])
      .map((child) => (child?.type === "listitem" ? this.#listItem(child, ordered) : this.#node(child)))
      .join("");
    return this.#tag(ordered ? "ol" : "ul", (ordered ? list.ol : list.ul) ?? "", items, start);
  }

  // An ordered item carries its own number, as the editor's does: the wrapper of a nested list is an item too, and
  // the browser's own count would number every item after one off by its wrappers.
  #listItem(node: ContentNode, ordered: boolean) {
    const list = akanEditorTheme.list ?? {};
    const nested = (node.children ?? []).some((child) => child.type === "list");
    const className = nested
      ? (list.nested?.listitem ?? "")
      : node.checked === true
        ? (list.listitemChecked ?? "")
        : node.checked === false
          ? (list.listitemUnchecked ?? "")
          : (list.listitem ?? "");
    const value = ordered && typeof node.value === "number" ? ` value="${Math.trunc(node.value)}"` : "";
    return this.#tag("li", className, this.#children(node), value);
  }

  #link(node: ContentNode) {
    // An autolink the person unlinked stays text, which is how the editor draws it.
    if (node.type === "autolink" && node.isUnlinked) return this.#children(node);
    const url = RichUrl.link(node.url);
    if (!url) return this.#fail();
    if (this.#options.disableHref) return this.#tag("a", akanEditorTheme.link ?? "", this.#children(node));
    const target = node.target === "_blank" ? ' target="_blank" rel="noreferrer noopener"' : "";
    return this.#tag(
      "a",
      akanEditorTheme.link ?? "",
      this.#children(node),
      ` href="${ContentHtml.escape(url)}"${target}`,
    );
  }

  #codeHighlight(node: ContentNode) {
    const highlight = akanEditorTheme.codeHighlight ?? {};
    const className = node.highlightType ? (highlight[node.highlightType] ?? "") : "";
    const text = ContentHtml.escape(node.text ?? "");
    return className ? this.#tag("span", className, text) : text;
  }

  #tableCell(node: ContentNode) {
    const header = node.headerState ? (akanEditorTheme.tableCellHeader ?? "") : "";
    const className = `${akanEditorTheme.tableCell ?? ""}${header ? ` ${header}` : ""}`;
    const span = `${node.colSpan && node.colSpan > 1 ? ` colspan="${Math.trunc(node.colSpan)}"` : ""}${
      node.rowSpan && node.rowSpan > 1 ? ` rowspan="${Math.trunc(node.rowSpan)}"` : ""
    }`;
    return this.#tag(node.headerState ? "th" : "td", className, this.#children(node), span);
  }

  #callout(node: ContentNode) {
    // `CalloutNode` reads a callout stored without one as `info`, so this has to as well.
    const variant = (node.variant ?? "info") as CalloutVariant;
    const className = calloutVariants[variant];
    if (!className) return this.#fail();
    return this.#tag("div", className, this.#children(node));
  }

  #mention(node: ContentNode) {
    const label = ContentHtml.escape(node.label ?? node.text ?? "");
    const href = this.#options.disableHref ? null : RichUrl.internalPath(node.href);
    if (!href) return this.#tag("span", mentionChip, label);
    return this.#tag("a", `${mentionChip} ${mentionChipLink}`, label, ` href="${ContentHtml.escape(href)}"`);
  }
}
