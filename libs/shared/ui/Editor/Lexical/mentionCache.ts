/**
 * Every mention payload this page has held, keyed by `refName/refId`.
 *
 * A mention's `href` and `imageUrl` are snapshots the inserting source resolved once, and the markdown
 * token carries neither — `@[label](mention:ticket/6f2a1c "…" )` would be unreadable, and an agent has no
 * way to know either value. Without this cache a markdown round-trip would hand back a chip with a dead
 * link and no avatar, which is a silent loss of exactly the thing a mention exists for.
 *
 * `$createMentionNode` fills it, so every mention the editor has built — parsed from stored content,
 * picked from the `@` menu, or restored from a token — is recallable. Deliberately import-free: it sits
 * between `mentionNode.util.ts` and `markdownMention.ts`, which already reference each other's module
 * graph, and one more edge there would be a TDZ hazard.
 */
export interface RememberedMention {
  refName: string;
  refId: string;
  label: string;
  href?: string | null;
  imageUrl?: string | null;
}

/** Bounded because a long editing session searches far more mentions than it inserts. */
const CACHE_LIMIT = 500;

const remembered = new Map<string, RememberedMention>();

export const rememberMention = (mention: RememberedMention) => {
  const key = `${mention.refName}/${mention.refId}`;
  remembered.delete(key);
  remembered.set(key, mention);
  if (remembered.size > CACHE_LIMIT) {
    const oldest = remembered.keys().next();
    if (!oldest.done) remembered.delete(oldest.value);
  }
};

export const recallMention = (refName: string, refId: string): RememberedMention | undefined =>
  remembered.get(`${refName}/${refId}`);
