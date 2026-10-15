import { MentionGrammar } from "./mentionGrammar";
import { RichMarkdownReader } from "./richMarkdownReader";
import { RichMarkdownWriter } from "./richMarkdownWriter";
import { RichNode, type RichNodeLike } from "./richNode";

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

interface ContentNode extends RichNodeLike {
  refName?: unknown;
  refId?: unknown;
}

export class RichEditor {
  // Everything else is a block, and a block ends its line in the extracted text.
  static readonly #inlineTypes: ReadonlySet<string> = new Set([
    "text",
    "linebreak",
    "tab",
    "link",
    "autolink",
    "akan-mention",
    "code-highlight",
  ]);

  static collectMentions(content: unknown): MentionRef[] {
    if (!content || typeof content !== "object" || Array.isArray(content)) return [];
    const refs = new Map<string, MentionRef>();
    RichEditor.#walkMentions((content as { root?: unknown }).root, refs, 0);
    return [...refs.values()];
  }

  static contentFromText(text: string) {
    return RichNode.root(
      text
        .split("\n")
        .map((line) =>
          RichNode.block("paragraph", line ? [RichNode.text(line)] : [], { textFormat: 0, textStyle: "" }),
        ),
    );
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
    if (!content || typeof content !== "object") return "";
    if (Array.isArray(content)) return content.map((node) => RichEditor.#nodeText(node, 0)).join("");
    return RichEditor.#nodeText((content as { root?: unknown }).root, 0);
  }

  static #walkMentions(value: unknown, refs: Map<string, MentionRef>, depth: number) {
    if (!RichNode.isNode(value) || depth > RichNode.maxDepth) return;
    const node = value as ContentNode;
    if (node.type === RichNode.mentionType && typeof node.refName === "string" && typeof node.refId === "string") {
      refs.set(`${node.refName}:${node.refId}`, { refName: node.refName, refId: node.refId });
    }
    if (!Array.isArray(node.children)) return;
    for (const child of node.children) RichEditor.#walkMentions(child, refs, depth + 1);
  }

  static #nodeText(value: unknown, depth: number): string {
    if (!RichNode.isNode(value) || depth > RichNode.maxDepth) return "";
    const node = value as ContentNode;
    if (node.type === "linebreak") return "\n";
    if (node.type === "tab") return "\t";
    if (typeof node.text === "string") return node.text;
    const children = Array.isArray(node.children) ? (node.children as unknown[]) : [];
    const childText = children.map((child) => RichEditor.#nodeText(child, depth + 1)).join("");
    switch (node.type) {
      case "quote":
      case "blockquote":
        return `> ${childText}\n`;
      case "listitem":
      case "li":
        return `- ${childText}\n`;
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
        if (!node.type || RichEditor.#inlineTypes.has(node.type) || !childText || childText.endsWith("\n"))
          return childText;
        return `${childText}\n`;
    }
  }
}
