import { RichEditor, RichNode } from "@libs/shared/common";
import type { LexicalEditor } from "lexical";

import type { EditorNodeLabels, EditorNodeLike } from "../feature";

export interface RichNodeCount {
  label: string;
  count: number;
}

const tally = (value: unknown, labels: EditorNodeLabels, counts: Map<string, number>, depth: number) => {
  if (!RichNode.isNode(value) || depth > RichNode.maxDepth) return;
  const node = value as EditorNodeLike;
  const label = node.type ? labels[node.type] : undefined;
  if (label) counts.set(label, (counts.get(label) ?? 0) + 1);
  for (const child of Array.isArray(node.children) ? node.children : []) tally(child, labels, counts, depth + 1);
};

/** The labelled nodes this content holds, most numerous first — what an overwrite would take with it. */
export const labelledNodesOf = (content: unknown, labels: EditorNodeLabels): RichNodeCount[] => {
  if (!content || typeof content !== "object") return [];
  const counts = new Map<string, number>();
  const roots = Array.isArray(content) ? content : [(content as { root?: unknown }).root];
  for (const root of roots) tally(root, labels, counts, 0);
  return [...counts].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count);
};

/** Nothing a person would miss: no text, and none of the nodes that carry meaning without text. */
export const isEmptyRichContent = (content: unknown, labels: EditorNodeLabels) =>
  !RichEditor.extractTextFromContent(content).trim() && !labelledNodesOf(content, labels).length;

export const countSentence = (counts: RichNodeCount[]) =>
  counts.map(({ label, count }) => `${count} ${label}${count > 1 ? "s" : ""}`).join(", ");

export interface RichBlock {
  index: number;
  type: string;
  text: string;
}

const listingBudget = 6000;
const blockTextLimit = 160;

const blockText = (value: unknown): string => {
  if (!RichNode.isNode(value)) return "";
  if (typeof value.text === "string") return value.text;
  return (Array.isArray(value.children) ? value.children : []).map(blockText).join("");
};

const rootChildrenOf = (content: unknown): EditorNodeLike[] => {
  if (!content || typeof content !== "object") return [];
  if (Array.isArray(content)) return content.filter(RichNode.isNode);
  const children = (content as { root?: EditorNodeLike }).root?.children;
  return Array.isArray(children) ? children.filter(RichNode.isNode) : [];
};

/**
 * The top-level blocks of stored content, in the order an index addresses them.
 *
 * The index is the only address there is: `SerializedLexicalNode` carries no `NodeKey`, so a key is
 * invisible to anyone reading the content and cannot be quoted back. It shifts under insert and remove,
 * which is why every block op returns a fresh listing rather than leaving the caller to re-derive one.
 */
export const richBlocksOf = (content: unknown): RichBlock[] =>
  rootChildrenOf(content).map((node, index) => ({
    index,
    type: node.type ?? "unknown",
    text: blockText(node).replace(/\s+/g, " ").trim(),
  }));

export const richBlockListing = (content: unknown): string => {
  const blocks = richBlocksOf(content);
  if (!blocks.length) return "0 blocks. The field is empty.";
  const lines = [`${blocks.length} block${blocks.length > 1 ? "s" : ""}:`];
  let listed = 0;
  for (const { index, type, text } of blocks) {
    const line = `${index} ${type} ${text.slice(0, blockTextLimit) || "(no text)"}`;
    if (lines.join("\n").length + line.length > listingBudget) break;
    lines.push(line);
    listed += 1;
  }
  if (listed < blocks.length)
    lines.push(`… ${blocks.length - listed} more, at indices ${listed}-${blocks.length - 1}.`);
  return lines.join("\n");
};

const revealMs = 320;
const revealBudgetMs = 1_500;

export const revealBlocks = async (editor: LexicalEditor, keys: string[]) => {
  if (!keys.length || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const step = Math.min(70, revealBudgetMs / keys.length);
  keys.forEach((key, idx) => {
    editor.getElementByKey(key)?.animate(
      [
        { opacity: 0, transform: "translateY(6px)" },
        { opacity: 1, transform: "none" },
      ],
      {
        duration: revealMs,
        delay: idx * step,
        easing: "ease-out",
        fill: "backwards",
      },
    );
  });
  await new Promise((resolve) => setTimeout(resolve, keys.length * step + revealMs));
};
