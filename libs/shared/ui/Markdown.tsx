"use client";
import { clsx } from "akanjs/client";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

// daisyui `prose` gives theme-aware typography (headings, bold, lists, code, tables) in a single robustly
// scanned class — the repo convention (see `libs/util/ui/HtmlContent`). `prose-sm` for chat density,
// `max-w-none` so it fills the bubble, and it inherits daisyui base-content colors in light AND dark
// (no `prose-invert` needed).
const markdownClass = "prose prose-sm max-w-none break-words";

interface MarkdownProps {
  className?: string;
  children: string;
}
/** Read-only GitHub-flavored markdown renderer for assistant chat output. No `rehype-raw`, so embedded raw
 *  HTML is not rendered — no XSS surface. Use `Editor.RichContent` for stored rich-text documents instead. */
export const Markdown = ({ className, children }: MarkdownProps) => {
  return (
    <div className={clsx(markdownClass, className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{children}</ReactMarkdown>
    </div>
  );
};
