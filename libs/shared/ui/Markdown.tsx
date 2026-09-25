"use client";
import { cn } from "akanjs/client";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

// `prose` gives typography (headings, bold, lists, code, tables) in a single robustly scanned class —
// the repo convention (see `libs/util/ui/HtmlContent`). `prose-sm` for chat density, `max-w-none` so it
// fills the bubble.
//
// XXX: the class only resolves where the host app loads `@plugin "@tailwindcss/typography"`, which today
// is akasys alone; akasys also re-maps `--tw-prose-*` onto the semantic tokens, since the plugin's own
// palette is a fixed gray. Rendering this component from another app produces unstyled markdown.
const markdownClass = "prose prose-sm max-w-none break-words";

interface MarkdownProps {
  className?: string;
  children: string;
}
/** Read-only GitHub-flavored markdown renderer for assistant chat output. No `rehype-raw`, so embedded raw
 *  HTML is not rendered — no XSS surface. Use `Editor.RichContent` for stored rich-text documents instead. */
export const Markdown = ({ className, children }: MarkdownProps) => {
  return (
    <div className={cn(markdownClass, className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{children}</ReactMarkdown>
    </div>
  );
};
