import { cn } from "akanjs/client";

import { ContentHtml } from "./contentHtml.util";
import { RichContent } from "./index_";
import { toSerializedEditorState } from "./Lexical/softGuard";

interface StaticContentProps {
  className?: string;
  content: unknown;
  disableHref?: boolean;
}

/**
 * A stored document rendered on the server, falling back to the client editor for anything
 * `ContentHtml` cannot draw. Every read-only render used to go through `RichContent`, which is a
 * `lazy()` behind a `"use client"` boundary — so a page a reader never edits still shipped the whole
 * editor and built its markup in the browser.
 */
export const StaticContent = ({ className, content, disableHref }: StaticContentProps) => {
  const state = toSerializedEditorState(content);
  const html = state ? ContentHtml.render(state) : "";
  if (html === null) return <RichContent className={className} content={state} disableHref={disableHref} />;
  return (
    <div
      className={cn("akan-editor akan-editor-readonly relative w-full", className)}
      // biome-ignore lint/security/noDangerouslySetInnerHtml: ContentHtml builds this string itself from a fixed node whitelist, escaping every text and checking every url scheme, and returns null for anything else — no stored markup reaches the browser through here
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
};
