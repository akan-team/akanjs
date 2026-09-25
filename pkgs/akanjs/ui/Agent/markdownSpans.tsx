"use client";
import type { ReactNode } from "react";

// The href alternation carries one level of nested parens, so a url that ends in one — a wiki title, a
// `javascript:alert(1)` this then refuses — is captured whole instead of cut at its first `)`.
const inline =
  /(!?)\[([^\]]*)\]\(((?:[^\s()]|\([^\s()]*\))+)\)|`([^`]+)`|\*\*([\s\S]+?)\*\*|\*([^*\n]+?)\*|~~([\s\S]+?)~~/g;

// React writes a `javascript:` href out as given, and this text comes from a model and from tool results that
// carry stored user input — so anything but a known scheme renders as its label instead of as a link.
const isSafeHref = (href: string) => !/^[a-z][a-z0-9+.-]*:/i.test(href) || /^(?:https?|mailto|tel):/i.test(href);

// Underscore emphasis is deliberately unmatched: snake_case is everywhere in this content, and `some_var_name`
// italicising mid-word reads worse than a literal `_emphasis_` does.
export const spans = (text: string): ReactNode[] => {
  const nodes: ReactNode[] = [];
  let cut = 0;
  for (const match of text.matchAll(inline)) {
    const at = match.index;
    const [, image, label, href, code, strong, em, del] = match;
    if (at > cut) nodes.push(text.slice(cut, at));
    cut = at + match[0].length;
    if (href)
      nodes.push(
        image || !isSafeHref(href) ? (
          label
        ) : (
          <a className="underline" href={href} key={at} rel="noreferrer" target="_blank">
            {spans(label)}
          </a>
        ),
      );
    else if (code)
      nodes.push(
        <code className="rounded-field bg-muted px-1 font-mono text-[11px]" key={at}>
          {code}
        </code>,
      );
    else if (strong)
      nodes.push(
        <strong className="font-semibold" key={at}>
          {spans(strong)}
        </strong>,
      );
    else if (em) nodes.push(<em key={at}>{spans(em)}</em>);
    else if (del)
      nodes.push(
        <del className="opacity-60" key={at}>
          {spans(del)}
        </del>,
      );
  }
  if (cut < text.length) nodes.push(text.slice(cut));
  return nodes;
};
