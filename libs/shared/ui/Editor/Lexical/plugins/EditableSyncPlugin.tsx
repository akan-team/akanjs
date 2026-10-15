"use client";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { useEffect } from "react";

/** Keeps Lexical's `editable` flag in step with the `disabled` prop after mount — `initialConfig` is read once. */
export const EditableSyncPlugin = ({ editable }: { editable: boolean }) => {
  const [editor] = useLexicalComposerContext();
  useEffect(() => {
    editor.setEditable(editable);
  }, [editor, editable]);
  return null;
};
