import type { MessageReference } from "./types";

/**
 * The ceiling on what one reference may add to the transcript, and the identity two of them are the same by.
 *
 * A reference is bulkier than it looks and lasts longer than a tool result. The host hands over whatever the
 * screen was already holding — a document with an array of rows in it is tens of kilobytes — and unlike a tool
 * result, which answers one turn's question, a reference is part of a *user* message: it rides the wire on this
 * turn and on every turn after it, and it is the last thing compaction folds, because folding the thing the user
 * pointed at is folding the question.
 *
 * So the value is bounded where it is staged, before it ever enters a message. Clipped rather than dropped, and
 * the note says which: a model shown a value it cannot see the end of asks a narrower question, where one shown
 * nothing answers from the field names.
 */
export class Reference {
  /**
   * Characters. The same number as `ToolOutput.limit` and for the same reason — far below any provider's window,
   * comfortably above what one record needs — but its own constant, because the two bound different things and a
   * host that finds one too generous has no reason to have found the other so.
   */
  static readonly limit = 20_000;

  /**
   * What the token in the message text spells, so the text is the index into the values and neither can drift
   * from the other. A path is part of the identity: two fields of one document are two references.
   */
  static keyOf({ refName, refId, path }: MessageReference): string {
    return `${refName}/${refId}${path ? `#${path}` : ""}`;
  }

  static same(one: MessageReference, other: MessageReference): boolean {
    return Reference.keyOf(one) === Reference.keyOf(other);
  }

  /**
   * The token a reference reads as in the message the user is writing: `@[label](mention:refName/id#path)`.
   *
   * The text is the source of truth for which references a message carries — deleting the token is how somebody
   * takes one back — so the token has to say everything the pointer does. The value is looked up beside it by key.
   */
  static token(reference: MessageReference): string {
    return `@[${reference.label}](mention:${Reference.keyOf(reference)})`;
  }

  /**
   * Greedy on the label alone: a label may hold anything but `]` or an `@[`, where a token starts over, and every
   * other part is a name, an id or a dotted path, none of which holds a bracket.
   */
  static readonly pattern = /@\[((?:(?!@\[)[^\]])*)\]\(mention:([^/)[\]]+)\/([^#)[\]]+)(?:#([^)[\]]*))?\)/g;

  /**
   * The pointers a draft names, in the order it names them. Pointers only — the value lives in `staged` and is
   * joined on by key, so reading the text can never resurrect a value somebody deleted the token for.
   */
  static parse(text: string): MessageReference[] {
    return [...text.matchAll(Reference.pattern)].map(([, label, refName, refId, path]) => ({
      refName,
      refId,
      label,
      ...(path ? { path } : {}),
    }));
  }

  /**
   * A value past the ceiling becomes the JSON text up to it. That leaves `value` a string holding a fragment of a
   * structure, which is exactly what it is — and a reader renders a string value as itself, so the model sees the
   * fragment rather than an escaped quotation of one.
   */
  static clipped(reference: MessageReference): MessageReference {
    if (reference.value === undefined) return reference;
    const json = JSON.stringify(reference.value) ?? "";
    if (json.length <= Reference.limit) return reference;
    return { ...reference, value: `${json.slice(0, Reference.limit)}…`, note: Reference.#note(json.length) };
  }

  /**
   * The text with every token naming `key` taken out, and the gap it leaves closed up. Deleting the chip and
   * deleting the token have to be the same act, because the text is what decides which references a turn carries.
   */
  static without(text: string, key: string): string {
    return text
      .replace(new RegExp(Reference.pattern.source, "g"), (match, label, refName, refId, path) =>
        Reference.keyOf({ refName, refId, label, path }) === key ? "" : match,
      )
      .replace(/[^\S\n]{2,}/g, " ")
      .replace(/[^\S\n]+$/gm, "");
  }

  /** What a pasted token resolves to: the pointer is in the text, and no value was ever staged beside it. */
  static readonly unstagedNote =
    "the value was not captured with this reference, so read it again with a tool before answering about it";

  static #note(chars: number): string {
    return (
      `The value is ${chars} characters (~${Math.ceil(chars / 4)} tokens), past the ${Reference.limit}-character ` +
      `ceiling one reference may add to this conversation, so only the first ${Reference.limit} are shown and the ` +
      `JSON is cut mid-structure. Read a narrower part of it with a tool — one row, one field — rather than asking ` +
      `for the whole value, and tell the user if you cannot answer from what you can see.`
    );
  }
}
