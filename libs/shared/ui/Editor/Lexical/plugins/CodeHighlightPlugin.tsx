"use client";
import { registerCodeHighlighting } from "@lexical/code";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { useEffect } from "react";

/**
 * Registers Prism-based syntax highlighting for `CodeNode` blocks. Used in both
 * the editable and read-only trees so code looks identical in each.
 */
export const CodeHighlightPlugin = () => {
  const [editor] = useLexicalComposerContext();
  useEffect(() => registerCodeHighlighting(editor), [editor]);
  return null;
};
