import { MentionGrammar } from "./mentionGrammar";
import { RichMarkdownReader } from "./richMarkdownReader";
import { RichMarkdownWriter } from "./richMarkdownWriter";
import { RichNode } from "./richNode";

export interface MentionRef {
  refName: string;
  refId: string;
}

export interface MentionTarget {
  refName: string;
  id: string;
  name: string;
}

/** A mention as the editor's markdown writes it: `@[label](mention:refName/refId)`. */
export interface MentionToken extends MentionRef {
  label: string;
}

export interface EditorNode {
  type: string;
  version: number;
}

export interface EditorContent {
  root: EditorNode;
}

interface ContentNode {
  type?: string;
  text?: string;
  label?: unknown;
  refName?: unknown;
  refId?: unknown;
  children?: unknown;
}

type MentionMode = "keep" | "skip" | "token";

export class RichEditor {
  static collectMentions(content: unknown): MentionRef[] {
    if (!content || typeof content !== "object" || Array.isArray(content)) return [];
    const root = (content as { root?: ContentNode }).root;
    if (!root) return [];
    const refs = new Map<string, MentionRef>();
    RichEditor.#walkMentions(root, refs);
    return [...refs.values()];
  }

  // Field for field the shape parseEditorState expects — a node missing `version` is rejected.
  static contentFromText(text: string) {
    return {
      root: {
        children: text.split("\n").map((line) => ({
          children: line
            ? [{ detail: 0, format: 0, mode: "normal", style: "", text: line, type: "text", version: 1 }]
            : [],
          direction: null,
          format: "",
          indent: 0,
          type: "paragraph",
          version: 1,
          textFormat: 0,
          textStyle: "",
        })),
        direction: null,
        format: "",
        indent: 0,
        type: "root",
        version: 1,
      },
    };
  }

  /**
   * The same lines as `contentFromText`, with `@[label](mention:refName/refId)` tokens turned into chips.
   *
   * A write an agent makes has no live editor behind it, so this is the read half of the token grammar
   * `mentionToken` writes — the editor's other markdown (emphasis, lists, …) is not this field's
   * vocabulary and stays literal text.
   */
  static contentFromMentionText(text: string) {
    return RichNode.root(text.split("\n").map((line) => RichEditor.#lineParagraph(line)));
  }

  static contentFromMarkdown(markdown: string) {
    return RichMarkdownReader.read(markdown);
  }

  static markdownFromContent(content: unknown) {
    return RichMarkdownWriter.write(content);
  }

  static mentionToken(mention: MentionToken) {
    return MentionGrammar.token(mention);
  }

  /** The pattern `markdownMention` builds its transformer from, so both directions read one grammar. */
  static readonly mentionPattern = MentionGrammar.pattern;

  static unescapeMentionLabel(label: string) {
    return MentionGrammar.unescape(label);
  }

  static extractTextFromContent(content: unknown): string {
    return RichEditor.#extract(content, "keep");
  }

  static extractTextWithoutMentions(content: unknown): string {
    return RichEditor.#extract(content, "skip");
  }

  /** The inverse of `contentFromMentionText`: chips come back as tokens, so the text round-trips through both. */
  static extractMentionText(content: unknown): string {
    return RichEditor.#extract(content, "token");
  }

  static #extract(content: unknown, mode: MentionMode): string {
    if (!content || typeof content !== "object") return "";
    if (Array.isArray(content)) return content.map((node) => RichEditor.#nodeText(node as ContentNode, mode)).join("");
    const root = (content as { root?: ContentNode }).root;
    return root ? RichEditor.#nodeText(root, mode) : "";
  }

  static richText(text: string) {
    const emptyText = { type: "text", text, format: 0, detail: 0, mode: "normal", style: "", version: 1 };
    const paragraph = { type: "paragraph", format: "", indent: 0, version: 1, direction: null, children: [emptyText] };
    return { root: { type: "root", format: "", indent: 0, version: 1, direction: null, children: [paragraph] } };
  }

  static richTextToPlain(content: unknown): string {
    const walk = (node: unknown): string => {
      if (!node || typeof node !== "object") return "";
      const { type, text, children } = node as { type?: string; text?: string; children?: unknown[] };
      if (typeof text === "string") return text;
      const inner = Array.isArray(children) ? children.map(walk).join("") : "";
      return type === "paragraph" ? `${inner}\n` : inner;
    };
    return walk((content as { root?: unknown } | null | undefined)?.root).trim();
  }

  static appendMention(content: unknown, asset: MentionTarget) {
    const doc = (content ?? {}) as { root?: { children?: unknown[] } & Record<string, unknown> } & Record<
      string,
      unknown
    >;
    const nodes = [RichNode.mention(asset), RichNode.text(" ")];
    const children = Array.isArray(doc.root?.children) ? [...doc.root.children] : [];
    const last = children.at(-1) as { type?: string; children?: unknown[] } | undefined;
    if (last?.type === "paragraph" && Array.isArray(last.children))
      children[children.length - 1] = { ...last, children: [...last.children, ...nodes] };
    else children.push(RichNode.paragraph(nodes));
    return { ...doc, root: { ...RichNode.root([]).root, ...doc.root, children } };
  }

  /** A chip whose stored `text` is `@name`; the label is that minus the trigger when the node carries none. */
  static #nodeToken(node: ContentNode): string {
    const label = typeof node.label === "string" ? node.label : (node.text ?? "").replace(/^@/, "");
    if (typeof node.refName !== "string" || typeof node.refId !== "string") return label;
    return RichEditor.mentionToken({ refName: node.refName, refId: node.refId, label });
  }

  /** One line as a paragraph of text and chips. `split` yields the text around each match plus its captures. */
  static #lineParagraph(line: string) {
    const parts = line.split(MentionGrammar.pattern);
    const children: object[] = [];
    for (let at = 0; at < parts.length; at += 4) {
      const [text, label, refName, refId] = [parts[at], parts[at + 1], parts[at + 2], parts[at + 3]];
      if (text) children.push(RichNode.text(text));
      if (refName && refId)
        children.push(RichNode.mention({ refName, id: refId, name: MentionGrammar.unescape(label) }));
    }
    return RichNode.paragraph(children);
  }

  static #walkMentions(node: ContentNode, refs: Map<string, MentionRef>) {
    if (node.type === RichNode.mentionType && typeof node.refName === "string" && typeof node.refId === "string") {
      refs.set(`${node.refName}:${node.refId}`, { refName: node.refName, refId: node.refId });
    }
    if (!Array.isArray(node.children)) return;
    for (const child of node.children) {
      if (child && typeof child === "object") RichEditor.#walkMentions(child as ContentNode, refs);
    }
  }

  static #nodeText(node: ContentNode, mode: MentionMode = "keep"): string {
    if (node.type === RichNode.mentionType && mode !== "keep")
      return mode === "skip" ? "" : RichEditor.#nodeToken(node);
    if (typeof node.text === "string") return node.text;
    const children = Array.isArray(node.children) ? (node.children as ContentNode[]) : [];
    const childText = children.map((child) => RichEditor.#nodeText(child, mode)).join("");
    switch (node.type) {
      case "quote":
      case "blockquote":
        return `> ${childText}\n`;
      case "listitem":
      case "li":
        return `- ${childText}\n`;
      // Block-level containers get a trailing newline; inline/leaf nodes don't.
      case "paragraph":
      case "p":
      case "heading":
      case "h1":
      case "h2":
      case "h3":
      case "h4":
      case "h5":
      case "h6":
        return `${childText}\n`;
      default:
        return childText;
    }
  }
}
