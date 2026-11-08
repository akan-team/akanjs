// Pure by design — no runtime `lexical` import. `akan test <lib>` cannot load
// lexical's dev ESM at all (every binding lands in TDZ), so keeping the mention
// search logic free of it is what lets these units be tested under both runners.
// Editor state helpers live in `mentionPlugin.command.ts`.
import type { MenuTextMatch } from "@lexical/react/LexicalTypeaheadMenuPlugin";
import { RichUrl } from "@libs/shared/common";

import type { LinkedMention, MentionCandidate, MentionLinkReader, MentionSource } from "../mention.type";
import type { MentionPayload } from "../nodes/mentionNode.util";

export const mentionTrigger = "@";
export const mentionSearchDebounceMs = 150;
/** Per-source row cap, so one large model cannot crowd the others out of the menu. */
export const mentionRowsPerSource = 5;

export const mentionMaxLength = 75;

// lexical's `PUNCTUATION`, copied: importing it loads lexical (see the header).
const mentionPunctuation = "\\.,\\+\\*\\?\\$\\@\\|#{}\\(\\)\\^\\-\\[\\]\\\\/!%'\"~=<>_:;";
const mentionQueryChar = `[^${mentionTrigger}${mentionPunctuation}]`;
const mentionQueryRegex = new RegExp(
  `(^|\\s|\\()([${mentionTrigger}]((?:(?!\\s)${mentionQueryChar}${mentionQueryChar}{0,${mentionMaxLength - 1}})?))$`,
);

/**
 * Lexical's basic trigger with whitespace allowed inside the query, so `@Doyun Kim` keeps searching. The query may
 * not start with whitespace (`@ ` is prose) or hold two in a row (the way out of a menu that still has rows), and is
 * trimmed, so a trailing space asks the same question again instead of blanking the menu. `replaceableString` keeps
 * the untrimmed text: it is what the chip replaces.
 */
export const mentionMatchOf = (text: string): MenuTextMatch | null => {
  const match = mentionQueryRegex.exec(text);
  if (!match) return null;
  const [, lead = "", replaceableString = "", query = ""] = match;
  if (/\s\s/.test(query)) return null;
  return { leadOffset: match.index + lead.length, matchingString: query.trim(), replaceableString };
};

export const isMentionSourceAskedFor = (source: MentionSource, query: string) =>
  query.length >= (source.minQueryLength ?? 0);

interface MentionAnchor {
  key: string;
  text: string;
}

/**
 * Ends an `@` once its query has whitespace and a search for it, or for a prefix of it, found nothing: past that
 * point the user is writing prose, and every word would be another search. An ended `@` stays closed while it is
 * still in the text, so backspacing into it does not reopen it; deleting the `@` itself starts afresh.
 */
export class MentionSession {
  #emptyQuery: string | null = null;
  #ended: { key: string; leadOffset: number } | null = null;

  match(text: string, anchor: MentionAnchor): MenuTextMatch | null {
    const ended = this.#ended;
    if (ended?.key === anchor.key && anchor.text[ended.leadOffset] !== mentionTrigger) this.#ended = null;
    const match = mentionMatchOf(text);
    if (!match) return null;
    if (this.#ended?.key === anchor.key && this.#ended.leadOffset === match.leadOffset) return null;
    const hasWhitespace = /\s/.test(match.replaceableString);
    if (hasWhitespace && this.#emptyQuery !== null && match.matchingString.startsWith(this.#emptyQuery)) {
      this.#ended = { key: anchor.key, leadOffset: match.leadOffset };
      return null;
    }
    return match;
  }

  settle(query: string, sources: readonly MentionSource[], matches: readonly MentionMatch[]) {
    const isExhaustive = sources.every((source) => isMentionSourceAskedFor(source, query));
    this.#emptyQuery = !matches.length && isExhaustive ? query : null;
  }

  reset() {
    this.#emptyQuery = null;
  }
}

/** A candidate paired with the source that produced it, before it becomes a menu row. */
export interface MentionMatch {
  source: MentionSource;
  candidate: MentionCandidate;
}

/**
 * Queries every source that the current query is long enough for, in parallel.
 *
 * Returns plain matches rather than `MentionOption`s so this file never imports the
 * `MenuOption` subclass: extending a Lexical class at module scope trips a circular
 * -import TDZ under `akan test`'s bun runner (see `editor.abstract.md` testing note).
 * `MentionPlugin` wraps them for the menu.
 */
export const searchMentionSources = async (
  sources: readonly MentionSource[],
  query: string,
  signal: AbortSignal,
): Promise<MentionMatch[]> => {
  const results = await Promise.all(
    sources
      .filter((source) => isMentionSourceAskedFor(source, query))
      .map(async (source) => {
        try {
          const candidates = await source.search(query, signal);
          return candidates.slice(0, mentionRowsPerSource).map((candidate) => ({ source, candidate }));
        } catch {
          // One failing source must not blank the whole menu (editor fail-safe policy).
          return [];
        }
      }),
  );
  return results.flat();
};

export const toMentionPayload = (source: MentionSource, candidate: MentionCandidate): MentionPayload => ({
  refName: source.refName,
  refId: candidate.refId,
  label: candidate.label,
  href: candidate.href ?? source.hrefOf?.(candidate) ?? null,
  imageUrl: candidate.imageUrl ?? null,
});

export interface PastedLink {
  text: string;
  url: string;
}

/** A paste that is one http(s) link and nothing else; a link inside a sentence stays part of the sentence. */
export const pastedLinkOf = (pasted: string | null | undefined): PastedLink | null => {
  const text = pasted?.trim();
  const url = text && !/\s/.test(text) ? RichUrl.external(text) : null;
  return text && url ? { text, url } : null;
};

export const readMentionLink = (
  readers: readonly MentionLinkReader[],
  url: string,
): Promise<LinkedMention | null> | null => {
  for (const read of readers) {
    const pending = read(url);
    if (pending) return pending.then((mention) => (mention?.label.trim() ? mention : null)).catch(() => null);
  }
  return null;
};
