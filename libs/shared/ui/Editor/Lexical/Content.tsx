"use client";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import { clsx } from "akanjs/client";
import { useState } from "react";

import { createEditorConfig } from "./config";
import { CodeHighlightPlugin } from "./plugins/CodeHighlightPlugin";

/**
 * Read-only render of Akan editor content (`editable: false`). Mounts no
 * interaction/history/change plugins — just the rich-text render tree, so the
 * marks/blocks look identical to the editable view (shared theme).
 *
 * Non-Lexical `content` (legacy Yoopta/Slate) fails safe to an empty render via
 * the soft guard in `createEditorConfig` — matching the data-wipe policy.
 */
export default function Content({ content, className = "" }: { content: unknown; className?: string }) {
  const [initialConfig] = useState(() => createEditorConfig({ editable: false, initialJson: content }));

  return (
    <LexicalComposer initialConfig={initialConfig}>
      <div className={clsx("akan-editor akan-editor-readonly relative w-full", className)}>
        <RichTextPlugin
          contentEditable={<ContentEditable className="leading-7 outline-none" />}
          ErrorBoundary={LexicalErrorBoundary}
        />
        <CodeHighlightPlugin />
      </div>
    </LexicalComposer>
  );
}
