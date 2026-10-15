import { $createParagraphNode, $getRoot, type LexicalNode } from "lexical";

export const richBlockOps = ["append", "insert", "replace", "remove"] as const;
export type RichBlockOp = (typeof richBlockOps)[number];

/**
 * Splices blocks in at one index, leaving every other block exactly as it was.
 *
 * That untouched-ness is the whole reason block ops sit beside the whole-field write: an edit to block 4
 * never passes block 5 through the converter, so nothing the agent did not touch can change. `nodes` is empty
 * for a remove. Takes nodes rather than markdown so it stays on `lexical` core, where a test can reach it.
 */
export const $spliceRichBlocks = (op: RichBlockOp, index: number, nodes: LexicalNode[]) => {
  const root = $getRoot();
  const anchor = op === "append" ? null : root.getChildAtIndex(index);
  // An insert at the block count names no block to go before; the guard allows it, and it means the end.
  if (op === "append" || (op === "insert" && !anchor)) root.append(...nodes);
  else if (anchor) {
    for (const node of nodes) anchor.insertBefore(node);
    if (op !== "insert") anchor.remove();
  }
  // A remove that empties the root would leave the caret nowhere to sit.
  if (!root.getChildrenSize()) root.append($createParagraphNode());
};
