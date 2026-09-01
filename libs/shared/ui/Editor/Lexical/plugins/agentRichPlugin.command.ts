import { $createParagraphNode, $getRoot, type LexicalNode } from "lexical";

export const richBlockOps = ["append", "insert", "replace", "remove"] as const;
export type RichBlockOp = (typeof richBlockOps)[number];

/**
 * Splices blocks in at one index, leaving every other block exactly as it was.
 *
 * That untouched-ness is the whole reason block ops sit beside the whole-field write: a markdown round-trip
 * drops every image, table, callout and mention on the way out (see `lossyNodesOf`), so an edit to block 4
 * must not pass block 5 through the converter. `nodes` is empty for a remove.
 *
 * Takes nodes rather than markdown so this stays on `lexical` core — importing `AKAN_TRANSFORMERS` here
 * would reach MermaidComponent, `@libs/util/ui` and the util store, which no test can build.
 */
export const $spliceRichBlocks = (op: RichBlockOp, index: number, nodes: LexicalNode[]) => {
  const root = $getRoot();
  if (op === "append") root.append(...nodes);
  else {
    const anchor = root.getChildAtIndex(index);
    if (!anchor) return;
    for (const node of nodes) anchor.insertBefore(node);
    if (op !== "insert") anchor.remove();
  }
  // A remove that empties the root would leave the caret nowhere to sit.
  if (!root.getChildrenSize()) root.append($createParagraphNode());
};
