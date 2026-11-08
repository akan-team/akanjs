"use client";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { $getSelection, $isRangeSelection, COMMAND_PRIORITY_HIGH, PASTE_COMMAND, type PasteCommandType } from "lexical";
import { useEffect } from "react";

/**
 * Keeps the words and drops the markup when pasting into a field that has no rich capability at all.
 *
 * Lexical's rich-text paste reads `text/html`, so copying off a web page into what the person sees as a
 * textarea drops in headings, tables and colours the field offers no control for — content its own
 * markdown cannot round-trip, and which the agent's whole-field write would then refuse to overwrite.
 * Registered above `RichTextPlugin`'s handler and below `MentionPastePlugin`'s, which turns a lone link into a
 * chip first, and mounted only where `isPlainOnly` holds.
 */
export const PlainPastePlugin = () => {
  const [editor] = useLexicalComposerContext();
  useEffect(
    () =>
      editor.registerCommand(
        PASTE_COMMAND,
        (event: PasteCommandType) => {
          // An image or file paste carries no text; leave it to whoever else is listening.
          const text = event instanceof ClipboardEvent ? event.clipboardData?.getData("text/plain") : null;
          if (!text) return false;
          event.preventDefault();
          editor.update(() => {
            const selection = $getSelection();
            if ($isRangeSelection(selection)) selection.insertRawText(text);
          });
          return true;
        },
        COMMAND_PRIORITY_HIGH,
      ),
    [editor],
  );
  return null;
};
