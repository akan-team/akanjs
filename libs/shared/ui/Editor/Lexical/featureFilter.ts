import { RichNode, type RichNodeLike } from "@libs/shared/common";

import type { EditorFeature, EditorFeatureKey } from "./feature";

/** What a field may hold: the node types and the text-format bits its features add up to. */
export interface FeatureAllowance {
  types: ReadonlySet<string>;
  formats: number;
}

/** A mention's link and avatar, from wherever the caller keeps the ones a mention source resolved. */
export type MentionRecall = (
  refName: string,
  refId: string,
) => { href?: string | null; imageUrl?: string | null } | undefined;

interface FilterNode extends RichNodeLike {
  format?: unknown;
  label?: unknown;
  code?: unknown;
  refName?: unknown;
  refId?: unknown;
  href?: unknown;
  imageUrl?: unknown;
}

/**
 * Brings nodes from outside the editor — an agent's markdown, a paste — down to what a field offers, the way a
 * person typing there could have made them: a heading the field has no heading for becomes its paragraph, a list
 * its items' paragraphs, a link its text, a mention its label, and a format with no feature is dropped. A node
 * with nothing left to keep — an image, a divider, a node no plugin here registers — is left out.
 */
export class FeatureFilter {
  static readonly #inlineTypes: ReadonlySet<string> = new Set([
    "text",
    "linebreak",
    "tab",
    "link",
    "autolink",
    "akan-mention",
    "code-highlight",
  ]);
  static readonly #typesOf: { readonly [key in EditorFeatureKey]?: readonly string[] } = {
    heading: ["heading"],
    quote: ["quote"],
    list: ["list", "listitem"],
    code: ["code", "code-highlight"],
    divider: ["horizontalrule"],
    table: ["table", "tablerow", "tablecell"],
    callout: ["akan-callout"],
    collapsible: ["akan-collapsible", "akan-collapsible-title", "akan-collapsible-content"],
    image: ["akan-image"],
    video: ["akan-video"],
    file: ["akan-file"],
    embed: ["akan-embed"],
    mermaid: ["akan-mermaid"],
    excalidraw: ["akan-excalidraw"],
    link: ["link", "autolink"],
    mention: ["akan-mention"],
  } as const;
  static readonly #formatsOf: { readonly [key in EditorFeatureKey]?: number } = {
    emphasis: 1 | 2,
    strikethrough: 4,
    underline: 8,
    inlineCode: 16,
    highlight: 128,
  } as const;
  // Subscript and superscript belong to no feature, so no field can switch them off.
  static readonly #unownedFormats = 32 | 64;

  static allowanceOf(features: readonly EditorFeature[]): FeatureAllowance {
    const types = new Set(["root", "paragraph", "text", "linebreak", "tab"]);
    let formats = FeatureFilter.#unownedFormats;
    for (const { key, nodeType } of features) {
      if (!key) {
        if (nodeType) types.add(nodeType);
        continue;
      }
      for (const type of FeatureFilter.#typesOf[key] ?? []) types.add(type);
      formats |= FeatureFilter.#formatsOf[key] ?? 0;
    }
    return { types, formats };
  }

  /** Root-level blocks, filtered; `recall` fills a kept mention's link and avatar when the node carries neither. */
  static blocks(nodes: readonly unknown[], allowance: FeatureAllowance, recall?: MentionRecall): RichNodeLike[] {
    return new FeatureFilter(allowance, recall).#blocks(nodes, 0);
  }

  /** Nodes headed for a spot inside the document — a paste — filtered where they stand: inline stays inline. */
  static nodes(nodes: readonly unknown[], allowance: FeatureAllowance): RichNodeLike[] {
    return new FeatureFilter(allowance).#children(nodes, 0);
  }

  readonly #allowance: FeatureAllowance;
  readonly #recall: MentionRecall | undefined;

  constructor(allowance: FeatureAllowance, recall?: MentionRecall) {
    this.#allowance = allowance;
    this.#recall = recall;
  }

  #blocks(nodes: readonly unknown[], depth: number): RichNodeLike[] {
    return nodes.flatMap((node) => this.#block(node, depth));
  }

  #block(value: unknown, depth: number): RichNodeLike[] {
    if (!RichNode.isNode(value) || depth > RichNode.maxDepth) return [];
    const node = value as FilterNode;
    const type = node.type ?? "";
    if (FeatureFilter.#inlineTypes.has(type)) return this.#paragraphOf(this.#inline([node], depth));
    if (type === "akan-mermaid" && !this.#allowance.types.has(type)) {
      const code = typeof node.code === "string" && node.code ? [RichNode.text(node.code)] : [];
      return this.#block(RichNode.block("code", code, { language: "mermaid" }), depth);
    }
    const children = Array.isArray(node.children) ? node.children : null;
    if (this.#allowance.types.has(type))
      return [children ? { ...node, children: this.#children(children, depth + 1) } : node];
    if (!children) return [];
    return children.every((child) => FeatureFilter.#inlineTypes.has((child as RichNodeLike | null)?.type ?? ""))
      ? this.#paragraphOf(this.#inline(children, depth + 1))
      : this.#blocks(children, depth + 1);
  }

  #children(children: readonly unknown[], depth: number) {
    return children.flatMap((child) =>
      FeatureFilter.#inlineTypes.has((child as RichNodeLike | null)?.type ?? "")
        ? this.#inline([child], depth)
        : this.#block(child, depth),
    );
  }

  #inline(nodes: readonly unknown[], depth: number): RichNodeLike[] {
    if (depth > RichNode.maxDepth) return [];
    return nodes.flatMap((value): RichNodeLike[] => {
      if (!RichNode.isNode(value)) return [];
      const node = value as FilterNode;
      const children = Array.isArray(node.children) ? node.children : [];
      switch (node.type) {
        case "text":
          return this.#text(node);
        case "linebreak":
        case "tab":
          return [node];
        case "link":
        case "autolink":
          return this.#allowance.types.has(node.type)
            ? [{ ...node, children: this.#inline(children, depth + 1) }]
            : this.#inline(children, depth + 1);
        case "akan-mention":
          return this.#allowance.types.has(node.type)
            ? [this.#mention(node)]
            : this.#text({ text: String(node.label ?? "") });
        case "code-highlight":
          return this.#allowance.types.has(node.type) ? [node] : this.#text({ text: node.text ?? "" });
        default:
          return this.#inline(children, depth + 1);
      }
    });
  }

  // A soft line break inside a paragraph is a `linebreak` node in Lexical, never a newline in the text.
  #text(node: FilterNode): RichNodeLike[] {
    const format = typeof node.format === "number" ? node.format & this.#allowance.formats : 0;
    const lines = (node.text ?? "").split("\n");
    if (lines.length === 1 && format === node.format) return lines[0] ? [node] : [];
    return lines.flatMap((line, idx) => [
      ...(idx ? [{ type: "linebreak", version: 1 }] : []),
      ...(line ? [{ ...RichNode.text(line), ...node, text: line, format }] : []),
    ]);
  }

  #mention(node: FilterNode): FilterNode {
    if (node.href || node.imageUrl || typeof node.refName !== "string" || typeof node.refId !== "string") return node;
    const recalled = this.#recall?.(node.refName, node.refId);
    return recalled ? { ...node, href: recalled.href ?? null, imageUrl: recalled.imageUrl ?? null } : node;
  }

  #paragraphOf(inline: RichNodeLike[]) {
    return inline.length ? [RichNode.paragraph(inline)] : [];
  }
}
