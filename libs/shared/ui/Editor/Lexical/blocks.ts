import { $createCodeNode } from "@lexical/code";
import { INSERT_CHECK_LIST_COMMAND, INSERT_ORDERED_LIST_COMMAND, INSERT_UNORDERED_LIST_COMMAND } from "@lexical/list";
import { INSERT_HORIZONTAL_RULE_COMMAND } from "@lexical/react/LexicalHorizontalRuleNode";
import { $createHeadingNode, $createQuoteNode, type HeadingTagType } from "@lexical/rich-text";
import { $setBlocksType } from "@lexical/selection";
import { INSERT_TABLE_COMMAND } from "@lexical/table";
import { $createParagraphNode, $getSelection, $isRangeSelection, type LexicalEditor } from "lexical";

import { $createCalloutNode, type CalloutVariant } from "./nodes/calloutNode.util";
import { INSERT_COLLAPSIBLE_COMMAND } from "./plugins/collapsiblePlugin.util";

/**
 * Block-conversion / insertion helpers shared by the slash menu (and, later,
 * block-type controls). Each takes the live editor and dispatches the right
 * command, converting the current selection's block(s) in place.
 *
 * Conversions (paragraph/heading/quote/code) use `$setBlocksType` so the block's
 * text content is preserved. Lists and the divider go through their dedicated
 * Lexical commands, which the `ListPlugin` / `HorizontalRulePlugin` handle.
 */

/** Runs `transform` inside a single history-batched update against the current range selection. */
const withRangeSelection = (editor: LexicalEditor, transform: () => void) => {
  editor.update(() => {
    const selection = $getSelection();
    if ($isRangeSelection(selection)) transform();
  });
};

export const formatParagraph = (editor: LexicalEditor) => {
  withRangeSelection(editor, () => {
    const selection = $getSelection();
    if ($isRangeSelection(selection)) $setBlocksType(selection, () => $createParagraphNode());
  });
};

export const formatHeading = (editor: LexicalEditor, tag: HeadingTagType) => {
  withRangeSelection(editor, () => {
    const selection = $getSelection();
    if ($isRangeSelection(selection)) $setBlocksType(selection, () => $createHeadingNode(tag));
  });
};

export const formatQuote = (editor: LexicalEditor) => {
  withRangeSelection(editor, () => {
    const selection = $getSelection();
    if ($isRangeSelection(selection)) $setBlocksType(selection, () => $createQuoteNode());
  });
};

export const formatCode = (editor: LexicalEditor) => {
  withRangeSelection(editor, () => {
    const selection = $getSelection();
    if ($isRangeSelection(selection)) $setBlocksType(selection, () => $createCodeNode());
  });
};

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

/** Converts the selected block(s) into a callout, preserving their text (like a quote). */
export const formatCallout = (editor: LexicalEditor, variant: CalloutVariant = "info") => {
  withRangeSelection(editor, () => {
    const selection = $getSelection();
    if ($isRangeSelection(selection)) $setBlocksType(selection, () => $createCalloutNode(variant));
  });
};

/** Inserts a table (defaults to a 3×3 grid with a header row) via `@lexical/table`. */
export const insertTable = (editor: LexicalEditor, rows = 3, columns = 3) => {
  editor.dispatchCommand(INSERT_TABLE_COMMAND, {
    rows: String(rows),
    columns: String(columns),
    includeHeaders: { rows: true, columns: false },
  });
};

/** Inserts an accordion/toggle block (`CollapsiblePlugin` owns the command). */
export const insertCollapsible = (editor: LexicalEditor) => {
  editor.dispatchCommand(INSERT_COLLAPSIBLE_COMMAND, undefined);
};
