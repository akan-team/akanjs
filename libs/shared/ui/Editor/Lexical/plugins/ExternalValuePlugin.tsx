"use client";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { RichContentShape } from "@libs/shared/common";
import { CLEAR_HISTORY_COMMAND, type EditorState, HISTORY_MERGE_TAG } from "lexical";
import { useEffect, useRef } from "react";

import { toSerializedEditorState } from "../softGuard";

interface ExternalValuePluginProps {
  value: unknown;
  /** Hands over the state it applied, so a debounced commit pending from before cannot write the old one back. */
  onApply?: (state: EditorState) => void;
}

/**
 * Re-applies an externally-changed `value`. It skips while the editor is focused, so active typing is never
 * clobbered, and when the value already says what the document says — compared by shape, because a `jsonb`
 * column hands the keys back in another order and every mount would otherwise rewrite the document.
 *
 * The value is normalized, not just guarded: a form that loads after mount is the usual way a field whose
 * stored value is plain text reaches the editor, and dropping it here would open the form empty and let the
 * first save overwrite what was written.
 *
 * Applied with the history-merge tag, which `OnChangePlugin` does not report, so the value is not echoed back
 * as an edit; the history is then cleared, since an undo past it would quietly revert someone else's save.
 */
export const ExternalValuePlugin = ({ value, onApply }: ExternalValuePluginProps) => {
  const [editor] = useLexicalComposerContext();
  const onApplyRef = useRef(onApply);
  onApplyRef.current = onApply;
  useEffect(() => {
    const state = toSerializedEditorState(value);
    if (!state) return;
    const root = editor.getRootElement();
    if (root && root.ownerDocument.activeElement === root) return;
    if (RichContentShape.same(editor.getEditorState().toJSON(), state)) return;
    try {
      const next = editor.parseEditorState(state);
      editor.setEditorState(next, { tag: HISTORY_MERGE_TAG });
      editor.dispatchCommand(CLEAR_HISTORY_COMMAND, undefined);
      onApplyRef.current?.(next);
    } catch {
      // Corrupt but root-shaped JSON — keep the current document.
    }
  }, [editor, value]);
  return null;
};
