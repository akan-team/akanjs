"use client";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { BLUR_COMMAND, COMMAND_PRIORITY_LOW } from "lexical";
import { useEffect } from "react";

/**
 * Commits the pending debounced change the moment the editor loses focus.
 *
 * Without this, clicking away inside the debounce window leaves the just-typed text uncommitted while
 * `ExternalValuePlugin`'s focus guard has already dropped — a follow-up render with the still-stale `value`
 * prop then overwrites the editor with the pre-edit content, and the pending timer commits that stale state
 * a moment later. Flushing on blur closes the window: the store is caught up by the time focus leaves.
 */
export const FlushOnBlurPlugin = ({ onBlur }: { onBlur: () => void }) => {
  const [editor] = useLexicalComposerContext();
  useEffect(
    () =>
      editor.registerCommand(
        BLUR_COMMAND,
        () => {
          onBlur();
          return false;
        },
        COMMAND_PRIORITY_LOW,
      ),
    [editor, onBlur],
  );
  return null;
};
