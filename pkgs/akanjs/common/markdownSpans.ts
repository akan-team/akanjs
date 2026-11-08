export type MarkdownSpan =
  | { kind: "text"; text: string }
  | { kind: "code"; text: string }
  | { kind: "strong"; text: string }
  | { kind: "em"; text: string }
  | { kind: "del"; text: string }
  | { kind: "link"; text: string; href: string }
  /** A link whose href was refused, or an image: rendered as its label, by every host. */
  | { kind: "plain"; text: string };

// One level of nested parens in the href, so a url ending in one (a wiki title) is captured whole, not cut at `)`.
// A label holds no `[`, as in CommonMark: `[a [b](u)` links `b`, and a run of `[` is not rescanned from each one.
const inline =
  /(!?)\[([^[\]]*)\]\(((?:[^\s()]|\([^\s()]*\))+)\)|`([^`]+)`|\*\*([\s\S]+?)\*\*|\*([^*\n]+?)\*|~~([\s\S]+?)~~/g;

// A link's scheme is refused here for every host: the text is model output, and a host may render it through a sink
// that does not block `javascript:` as React does. Underscore emphasis is deliberately unmatched, because snake_case is
// everywhere in this content.
export class MarkdownSpans {
  static of(text: string): MarkdownSpan[] {
    const spans: MarkdownSpan[] = [];
    let cut = 0;
    for (const match of text.matchAll(inline)) {
      const at = match.index;
      const [, image, label, href, code, strong, em, del] = match;
      if (at > cut) spans.push({ kind: "text", text: text.slice(cut, at) });
      cut = at + match[0].length;
      if (href !== undefined)
        spans.push(
          image || !MarkdownSpans.isSafeHref(href)
            ? { kind: "plain", text: label ?? "" }
            : { kind: "link", text: label ?? "", href },
        );
      else if (code !== undefined) spans.push({ kind: "code", text: code });
      else if (strong !== undefined) spans.push({ kind: "strong", text: strong });
      else if (em !== undefined) spans.push({ kind: "em", text: em });
      else if (del !== undefined) spans.push({ kind: "del", text: del });
    }
    if (cut < text.length) spans.push({ kind: "text", text: text.slice(cut) });
    return spans;
  }

  static isSafeHref(href: string) {
    // biome-ignore lint/suspicious/noControlCharactersInRegex: mirrors the URL parser, which drops tab and newline anywhere and trims leading C0 controls and spaces before it reads the scheme
    const parsed = href.replace(/[\t\n\r]/g, "").replace(/^[\u0000-\u0020]+/, "");
    return !/^[a-z][a-z0-9+.-]*:/i.test(parsed) || /^(?:https?|mailto|tel):/i.test(parsed);
  }

  static plain(text: string): string {
    return MarkdownSpans.of(text)
      .map((span) => span.text)
      .join("");
  }
}
