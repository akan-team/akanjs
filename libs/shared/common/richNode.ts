import type { MentionTarget } from "./richEditor";

/** A stored node as its JSON holds it — every field is a claim about the shape, never a check on it. */
export interface RichNodeLike {
  type?: string;
  text?: string;
  children?: RichNodeLike[];
}

export class RichNode {
  static readonly mentionType = "akan-mention";

  // No document the editor writes nests anywhere near this; past it, a recursive walk overflows the stack.
  static readonly maxDepth = 100;

  /**
   * Every node type the editor registers without a plugin, so the read-only editor can parse any document
   * made of these alone. `parseEditorState` rejects a whole document over one type it does not know.
   */
  static readonly editorTypes: ReadonlySet<string> = new Set([
    "root",
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
  ]);

  static isDocument(value: unknown): value is { root: RichNodeLike } {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    const root = (value as { root?: unknown }).root;
    if (!root || typeof root !== "object" || Array.isArray(root)) return false;
    const { type, children } = root as RichNodeLike;
    return type === "root" && (children === undefined || Array.isArray(children));
  }

  static isNode(value: unknown): value is RichNodeLike {
    return !!value && typeof value === "object" && !Array.isArray(value);
  }

  static root<Child extends object>(children: Child[]) {
    return { root: { type: "root", format: "" as const, indent: 0, version: 1, direction: null, children } };
  }

  static text(text: string, format = 0) {
    return { type: "text", text, format, detail: 0, mode: "normal" as const, style: "", version: 1 };
  }

  // No href: the token grammar carries none, and a synthesized `/<refName>/<id>` pointed at a route per
  // model that most apps do not have. A chip built from text is a reference; only a mention source links.
  static mention({ refName, id, name }: MentionTarget) {
    return {
      type: RichNode.mentionType,
      text: `@${name}`,
      refName,
      refId: id,
      label: name,
      format: 0,
      detail: 1,
      mode: "token",
      style: "",
      version: 1,
    };
  }

  static link<Child extends object>(url: string, children: Child[]) {
    return { ...RichNode.block("link", children), rel: null, target: null, title: null, url };
  }

  static paragraph<Child extends object>(children: Child[]) {
    return { type: "paragraph", format: "" as const, indent: 0, version: 1, direction: null, children };
  }

  static block<Child extends object>(type: string, children: Child[], extra: object = {}) {
    return { children, direction: null, format: "" as const, indent: 0, type, version: 1, ...extra };
  }
}
