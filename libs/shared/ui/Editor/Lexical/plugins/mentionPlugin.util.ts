// Pure by design — no runtime `lexical` import. `akan test <lib>` cannot load
// lexical's dev ESM at all (every binding lands in TDZ), so keeping the mention
// search logic free of it is what lets these units be tested under both runners.
// Editor state helpers live in `mentionPlugin.command.ts`.
import type { MentionCandidate, MentionSource } from "../mention.type";
import type { MentionPayload } from "../nodes/mentionNode.util";

export const MENTION_TRIGGER = "@";
export const MENTION_SEARCH_DEBOUNCE_MS = 150;
/** Per-source row cap, so one large model cannot crowd the others out of the menu. */
export const MENTION_ROWS_PER_SOURCE = 5;

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
      .filter((source) => query.length >= (source.minQueryLength ?? 0))
      .map(async (source) => {
        try {
          const candidates = await source.search(query, signal);
          return candidates.slice(0, MENTION_ROWS_PER_SOURCE).map((candidate) => ({ source, candidate }));
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
