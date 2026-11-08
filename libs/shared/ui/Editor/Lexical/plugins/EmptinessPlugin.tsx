"use client";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { $getRoot } from "lexical";
import { useEffect, useRef } from "react";

export interface EmptinessPluginProps {
  /** Called once as the editor mounts, then each time the document turns empty or stops being empty. */
  onEmptyChange: (isEmpty: boolean) => void;
}

export const EmptinessPlugin = ({ onEmptyChange }: EmptinessPluginProps) => {
  const [editor] = useLexicalComposerContext();
  const callbackRef = useRef(onEmptyChange);
  callbackRef.current = onEmptyChange;

  useEffect(() => {
    let reported: boolean | null = null;
    const report = () => {
      const isEmpty = editor.getEditorState().read(() => !$getRoot().getTextContent().trim());
      if (isEmpty === reported) return;
      reported = isEmpty;
      callbackRef.current(isEmpty);
    };
    report();
    return editor.registerUpdateListener(report);
  }, [editor]);
  return null;
};
