import type { MentionToken } from "./richEditor";

/*
 * The one mention grammar, shared by the editor's markdown transformer, `contentFromMentionText` and the markdown
 * codec — a second copy of this pattern is how the directions drift apart.
 *
 * Flagless on purpose: `markdownMention` hands the object itself to Lexical as `importRegExp`, and a `g` flag
 * would leave `lastIndex` behind between matches.
 */
export class MentionGrammar {
  static readonly pattern = /@\[((?:[^\]\\]|\\.)+)\]\(mention:([^()\s/]+)\/([^()\s]+)\)/;

  static token({ label, refName, refId }: MentionToken) {
    return `@[${MentionGrammar.escape(label)}](mention:${refName}/${refId})`;
  }

  /*
   * A `]` inside a label would close the token early, and a document title may well contain one. Only `]` and
   * `\` are escaped, so only those are excluded from the label — a bare `[` is ordinary text in a document
   * title and must round-trip as one.
   */
  static escape(label: string) {
    return label.replace(/\s+/g, " ").replace(/([\\\]])/g, "\\$1");
  }

  static unescape(label: string) {
    return label.replace(/\\([\\\]])/g, "$1");
  }
}
