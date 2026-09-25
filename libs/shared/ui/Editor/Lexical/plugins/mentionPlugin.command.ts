import { $getSelection, $isRangeSelection, createCommand, type LexicalEditor } from "lexical";

import type { MentionSource } from "../mention.type";
import { MENTION_TRIGGER } from "./mentionPlugin.util";

/** Narrows the `@` menu to a single model, dispatched by that model's slash entry. */
export const SET_MENTION_SOURCE_COMMAND = createCommand<string>("SET_MENTION_SOURCE");
/** Opens a source's own `Picker` dialog instead of the inline menu. */
export const OPEN_MENTION_PICKER_COMMAND = createCommand<string>("OPEN_MENTION_PICKER");

/**
 * What a `/<model>` slash entry runs. A source with a `Picker` opens it; otherwise
 * the `@` menu is scoped to that source and its trigger typed for the user, so both
 * entry points converge on the same menu.
 *
 * Ordering is guaranteed: command listeners run synchronously, while the trigger
 * insertion commits on a microtask — so the menu is already scoped by the time the
 * typeahead sees the `@`.
 */
export const openMentionSource = (editor: LexicalEditor, source: MentionSource) => {
  if (source.Picker) {
    editor.dispatchCommand(OPEN_MENTION_PICKER_COMMAND, source.refName);
    return;
  }
  editor.dispatchCommand(SET_MENTION_SOURCE_COMMAND, source.refName);
  editor.update(() => {
    const selection = $getSelection();
    if ($isRangeSelection(selection)) selection.insertText(MENTION_TRIGGER);
  });
};
