import { $isElementNode, type LexicalNode, type SerializedElementNode, type SerializedLexicalNode } from "lexical";

/** Marks the draggable handle so the plugin's `isOnMenu` hit-test can find it. */
export const draggableMenuClass = "akan-draggable-block-menu";

export const isOnMenu = (element: HTMLElement): boolean => !!element.closest(`.${draggableMenuClass}`);

// `exportJSON()` on an element writes `children: []` — the editor state fills them in itself — so a copy
// taken from it alone is an empty shell of the block.
export const $exportDeep = (node: LexicalNode): SerializedLexicalNode => {
  const json = node.exportJSON();
  if ($isElementNode(node)) (json as SerializedElementNode).children = node.getChildren().map($exportDeep);
  return json;
};
