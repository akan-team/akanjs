import { $createCodeNode } from "@lexical/code";
import { INSERT_HORIZONTAL_RULE_COMMAND } from "@lexical/extension";
import { INSERT_CHECK_LIST_COMMAND, INSERT_ORDERED_LIST_COMMAND, INSERT_UNORDERED_LIST_COMMAND } from "@lexical/list";
import { $createHeadingNode, $createQuoteNode, type HeadingTagType } from "@lexical/rich-text";
import { $setBlocksType } from "@lexical/selection";
import { INSERT_TABLE_COMMAND } from "@lexical/table";
import { $createParagraphNode, $getSelection, $isRangeSelection, type ElementNode, type LexicalEditor } from "lexical";

import { $createCalloutNode, type CalloutVariant } from "./nodes/calloutNode.util";
import { INSERT_COLLAPSIBLE_COMMAND } from "./plugins/collapsiblePlugin.util";

// Converts the selected blocks in place, keeping their text.
const setBlocks = (editor: LexicalEditor, createBlock: () => ElementNode) => {
  editor.update(() => {
    const selection = $getSelection();
    if ($isRangeSelection(selection)) $setBlocksType(selection, createBlock);
  });
};

export const formatParagraph = (editor: LexicalEditor) => setBlocks(editor, () => $createParagraphNode());

export const formatHeading = (editor: LexicalEditor, tag: HeadingTagType) =>
  setBlocks(editor, () => $createHeadingNode(tag));

export const formatQuote = (editor: LexicalEditor) => setBlocks(editor, () => $createQuoteNode());

export const formatCode = (editor: LexicalEditor) => setBlocks(editor, () => $createCodeNode());

export const formatCallout = (editor: LexicalEditor, variant: CalloutVariant = "info") =>
  setBlocks(editor, () => $createCalloutNode(variant));

export const formatBulletList = (editor: LexicalEditor) => {
  editor.dispatchCommand(INSERT_UNORDERED_LIST_COMMAND, undefined);
};

export const formatNumberedList = (editor: LexicalEditor) => {
  editor.dispatchCommand(INSERT_ORDERED_LIST_COMMAND, undefined);
};

export const formatCheckList = (editor: LexicalEditor) => {
  editor.dispatchCommand(INSERT_CHECK_LIST_COMMAND, undefined);
};

export const insertDivider = (editor: LexicalEditor) => {
  editor.dispatchCommand(INSERT_HORIZONTAL_RULE_COMMAND, undefined);
};

/** A 3×3 grid with a header row by default. */
export const insertTable = (editor: LexicalEditor, rows = 3, columns = 3) => {
  editor.dispatchCommand(INSERT_TABLE_COMMAND, {
    rows: String(rows),
    columns: String(columns),
    includeHeaders: { rows: true, columns: false },
  });
};

export const insertCollapsible = (editor: LexicalEditor) => {
  editor.dispatchCommand(INSERT_COLLAPSIBLE_COMMAND, undefined);
};
