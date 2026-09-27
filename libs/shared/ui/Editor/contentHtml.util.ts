import {
  akanEditorTheme,
  CALLOUT_VARIANTS,
  type CalloutVariant,
  MENTION_CHIP,
  MENTION_CHIP_LINK,
} from "./Lexical/theme";

interface ContentNode {
  type?: string;
  children?: ContentNode[];
  text?: string;
  format?: number | string;
  tag?: string;
  url?: string;
  target?: string | null;
  rel?: string | null;
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

/** Lexical `TextNode` format bits, in the order they must be nested. */
const textFormats = [
  [1, "bold"],
  [2, "italic"],
  [4, "strikethrough"],
  [8, "underline"],
  [16, "code"],
  [128, "highlight"],
] as const;

const headingTags = new Set(["h1", "h2", "h3", "h4", "h5", "h6"]);

/**
 * Lexical JSON to HTML, for rendering a stored document from a server component.
 *
 * Returns `null` — never partial HTML — as soon as it meets a node it does not know how to draw, so a
 * document holding an Excalidraw board or a nested-page link falls back to the client editor whole
 * rather than rendering with pieces missing. The class names come from `akanEditorTheme`, which is what
 * keeps the server render and the editor's own render looking the same.
 */
export class ContentHtml {
  #failed = false;

  static render(content: unknown): string | null {
    try {
      return new ContentHtml().#run(content);
    } catch {
      // Stored content is an `Any` column, so a node can be anything a writer put there. Null is the
      // caller's fallback path; a throw here is a 500 on a page that is otherwise fine.
      return null;
    }
  }

  static escape(text: string) {
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
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
        return this.#tag("p", akanEditorTheme.paragraph ?? "", this.#children(node) || "<br />");
      case "heading":
        return this.#heading(node);
      case "quote":
        return this.#tag("blockquote", akanEditorTheme.quote ?? "", this.#children(node));
      case "list":
        return this.#list(node);
      case "listitem":
        return this.#listItem(node);
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
    for (const [bit, key] of textFormats) {
      if (!(format & bit)) continue;
      if (underlineStrikethrough && (key === "strikethrough" || key === "underline")) continue;
      html = this.#tag(key === "code" ? "code" : "span", theme[key] ?? "", html);
    }
    if (underlineStrikethrough) html = this.#tag("span", theme.underlineStrikethrough ?? "", html);
    return html;
  }

  #heading(node: ContentNode) {
    const tag = node.tag ?? "h1";
    if (!headingTags.has(tag)) return this.#fail();
    const heading = akanEditorTheme.heading ?? {};
    return this.#tag(tag, heading[tag as "h1"] ?? "", this.#children(node));
  }

  #list(node: ContentNode) {
    const list = akanEditorTheme.list ?? {};
    const ordered = node.listType === "number";
    const start = ordered && node.start && node.start !== 1 ? ` start="${Math.trunc(node.start)}"` : "";
    return this.#tag(ordered ? "ol" : "ul", (ordered ? list.ol : list.ul) ?? "", this.#children(node), start);
  }

  #listItem(node: ContentNode) {
    const list = akanEditorTheme.list ?? {};
    const nested = (node.children ?? []).some((child) => child.type === "list");
    const className = nested
      ? (list.nested?.listitem ?? "")
      : node.checked === true
        ? (list.listitemChecked ?? "")
        : node.checked === false
          ? (list.listitemUnchecked ?? "")
          : (list.listitem ?? "");
    return this.#tag("li", className, this.#children(node));
  }

  #link(node: ContentNode) {
    const url = node.url ?? "";
    // Only http(s) and mailto reach an href: a stored `javascript:` url would otherwise become a live one.
    if (!/^(https?:|mailto:|\/)/i.test(url)) return this.#fail();
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
    const variant = (node.variant ?? "default") as CalloutVariant;
    const className = CALLOUT_VARIANTS[variant];
    if (!className) return this.#fail();
    return this.#tag("div", className, this.#children(node));
  }

  #mention(node: ContentNode) {
    const label = ContentHtml.escape(node.label ?? node.text ?? "");
    const href = node.href ?? "";
    if (!href) return this.#tag("span", MENTION_CHIP, label);
    if (!/^(https?:|\/)/i.test(href)) return this.#fail();
    return this.#tag("a", `${MENTION_CHIP} ${MENTION_CHIP_LINK}`, label, ` href="${ContentHtml.escape(href)}"`);
  }
}
