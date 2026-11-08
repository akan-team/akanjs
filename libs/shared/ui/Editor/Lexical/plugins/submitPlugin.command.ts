import { RichFence } from "@libs/shared/common";
import {
  $createParagraphNode,
  $createRangeSelection,
  $getSelection,
  $isElementNode,
  $isLineBreakNode,
  $isParagraphNode,
  $isRangeSelection,
  type ElementNode,
  type LexicalNode,
  type RangeSelection,
} from "lexical";

// Matched by type rather than `$isCodeNode`, which would pull `@lexical/code` into a module the tests load.
const $codeOf = (node: LexicalNode): ElementNode | null => {
  for (let current: LexicalNode | null = node; current; current = current.getParent())
    if ($isElementNode(current) && current.getType() === "code") return current;
  return null;
};

const $textUpToCaret = (element: ElementNode, selection: RangeSelection) => {
  const head = $createRangeSelection();
  head.anchor.set(element.getKey(), 0, "element");
  head.focus.set(selection.anchor.key, selection.anchor.offset, selection.anchor.type);
  return head.getTextContent();
};

/** Whether ↩ at the caret belongs to a code block or to an unclosed ``` fence, and so breaks the line instead of sending. */
export const $entersNewline = (): boolean => {
  const selection = $getSelection();
  if (!$isRangeSelection(selection)) return false;
  const anchorNode = selection.anchor.getNode();
  if ($codeOf(anchorNode)) return true;
  const block = anchorNode.getTopLevelElement();
  if (!$isParagraphNode(block)) return false;
  const lines: string[] = [];
  for (let sibling = block.getPreviousSibling(); $isParagraphNode(sibling); sibling = sibling.getPreviousSibling())
    lines.unshift(...sibling.getTextContent().split("\n"));
  lines.push(...$textUpToCaret(block, selection).split("\n"));
  return RichFence.isOpen(lines);
};

/**
 * ↩ right after a closing ``` typed as the last line of a code block takes the fence out and moves the caret below
 * the block, the way that fence ends the block in markdown. True when it did.
 */
export const $closeCodeFence = (): boolean => {
  const selection = $getSelection();
  if (!$isRangeSelection(selection) || !selection.isCollapsed()) return false;
  const code = $codeOf(selection.anchor.getNode());
  if (!code) return false;
  const text = code.getTextContent();
  if (!RichFence.isCloser(text.slice(text.lastIndexOf("\n") + 1)) || $textUpToCaret(code, selection) !== text)
    return false;
  for (let child = code.getLastChild(); child; child = code.getLastChild()) {
    child.remove();
    if ($isLineBreakNode(child)) break;
  }
  const paragraph = $createParagraphNode();
  if (code.isEmpty()) code.replace(paragraph);
  else code.insertAfter(paragraph);
  paragraph.select();
  return true;
};
