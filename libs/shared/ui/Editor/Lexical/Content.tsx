"use client";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import { cn } from "akanjs/client";
import { useState } from "react";

import { createEditorConfig } from "./config";
import { CodeHighlightPlugin } from "./plugins/CodeHighlightPlugin";
import { HrefGuardPlugin } from "./plugins/HrefGuardPlugin";
import { MentionLinkPlugin } from "./plugins/MentionLinkPlugin";

interface ContentProps {
  content: unknown;
  className?: string;
  disableHref?: boolean;
}

export default function Content({ content, className = "", disableHref = false }: ContentProps) {
  const [initialConfig] = useState(() => createEditorConfig({ editable: false, initialJson: content }));

  return (
    <LexicalComposer initialConfig={initialConfig}>
      <div className={cn("akan-editor akan-editor-readonly relative w-full", className)}>
        <RichTextPlugin
          contentEditable={<ContentEditable className="leading-7 outline-none" />}
          ErrorBoundary={LexicalErrorBoundary}
        />
        <CodeHighlightPlugin />
        {disableHref ? <HrefGuardPlugin /> : <MentionLinkPlugin />}
      </div>
    </LexicalComposer>
  );
}
