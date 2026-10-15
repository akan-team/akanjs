import { cn } from "akanjs/client";

import { ContentHtml, type ContentStandIns } from "./contentHtml.util";
import { RichContent } from "./index_";
import { toSerializedEditorState } from "./Lexical/softGuard";

interface StaticContentProps {
  className?: string;
  content: unknown;
  disableHref?: boolean;
  /** What a plugin's node reads as here, where no plugin is mounted — see `ContentHtml.resolve`. */
  standIns?: ContentStandIns;
}

/**
 * A stored document rendered on the server, falling back to the client editor for anything
 * `ContentHtml` cannot draw. Every read-only render used to go through `RichContent`, which is a
 * `lazy()` behind a `"use client"` boundary — so a page a reader never edits still shipped the whole
 * editor and built its markup in the browser.
 */
export const StaticContent = ({ className, content, disableHref, standIns }: StaticContentProps) => {
  const state = ContentHtml.resolve(toSerializedEditorState(content), standIns);
  const html = state ? ContentHtml.render(state, { disableHref }) : "";
  if (html === null) return <RichContent className={className} content={state} disableHref={disableHref} />;
  return (
    <div
      // Lexical's own root keeps runs of spaces and breaks long words; the server render has to match it.
      className={cn("akan-editor akan-editor-readonly relative w-full whitespace-pre-wrap break-words", className)}
      // biome-ignore lint/security/noDangerouslySetInnerHtml: ContentHtml builds this string itself from a fixed node whitelist, escaping every text and checking every url scheme, and returns null for anything else — no stored markup reaches the browser through here
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
};
