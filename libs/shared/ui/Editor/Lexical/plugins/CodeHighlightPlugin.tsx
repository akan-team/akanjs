"use client";
import * as lexicalCode from "@lexical/code";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import type { LexicalEditor } from "lexical";
import { useEffect } from "react";

//? @lexical/code 0.51 moved this to @lexical/code-prism, not installed here: a named import failed the editor's load.
const { registerCodeHighlighting } = lexicalCode as unknown as {
  registerCodeHighlighting?: (editor: LexicalEditor) => () => void;
};

/**
 * Registers Prism-based syntax highlighting for `CodeNode` blocks. Used in both
 * the editable and read-only trees so code looks identical in each.
 */
export const CodeHighlightPlugin = () => {
  const [editor] = useLexicalComposerContext();
  useEffect(() => registerCodeHighlighting?.(editor), [editor]);
  return null;
};
