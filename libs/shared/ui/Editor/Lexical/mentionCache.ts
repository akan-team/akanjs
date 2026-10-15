/**
 * Every mention payload this page has held, keyed by `refName/refId`.
 *
 * A mention's `href` and `imageUrl` are snapshots the inserting source resolved once, and the markdown
 * token carries neither — `@[label](mention:ticket/6f2a1c "…" )` would be unreadable, and an agent has no
 * way to know either value. Without this cache a markdown round-trip would hand back a chip with a dead
 * link and no avatar, which is a silent loss of exactly the thing a mention exists for.
 *
 * Filled only where a mention source resolved the payload — a pick from the `@` menu or a picker, and
 * `searchMentions` — never from a document that was merely read: its chips are anyone's to write, and a
 * cached one would lend its link to every later token naming the same document. Deliberately import-free:
 * it sits between `mentionNode.util.ts` and `markdownMention.ts`, which already reference each other's
 * module graph, and one more edge there would be a TDZ hazard.
 */
export interface RememberedMention {
  refName: string;
  refId: string;
  label: string;
  href?: string | null;
  imageUrl?: string | null;
}

/** Bounded because a long editing session searches far more mentions than it inserts. */
const cacheLimit = 500;

const remembered = new Map<string, RememberedMention>();

export const rememberMention = <Mention extends RememberedMention>(mention: Mention): Mention => {
  const key = `${mention.refName}/${mention.refId}`;
  remembered.delete(key);
  remembered.set(key, mention);
  if (remembered.size > cacheLimit) {
    const oldest = remembered.keys().next();
    if (!oldest.done) remembered.delete(oldest.value);
  }
  return mention;
};

export const recallMention = (refName: string, refId: string): RememberedMention | undefined =>
  remembered.get(`${refName}/${refId}`);
