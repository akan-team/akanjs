//? Security: what may ride beside a user's words as the app's own data. An id or an enum member is one short token;
//? any other string is free text that whoever wrote the record or the link chose, and a model reads that as data,
//? fenced or through a tool.
export class InlineToken {
  static readonly #shape = /^[A-Za-z0-9._-]{0,40}$/;
  static readonly #boundary = /[._-]|(?<=[a-z])(?=[A-Z])/;
  static readonly #uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  static readonly #hex = /^[0-9a-fA-F]+$/;
  static readonly #digit = /[0-9]/;
  static readonly #longestWord = 16;

  static is(value: unknown): value is string {
    return InlineToken.wordsOf(value) !== null;
  }

  //? A word ends at a separator or a lower-to-upper case change, so `createdAtDesc` is three words as
  //? `created-at-desc` is. Three pass, as an enum member or a date has. More pass only as an id's parts: each hex,
  //? with a digit or eight characters long, which words spelled with a to f are not. A run of letters longer than a
  //? word is words written together.
  static wordsOf(value: unknown): number | null {
    if (typeof value !== "string" || !InlineToken.#shape.test(value)) return null;
    if (InlineToken.#uuid.test(value)) return 1;
    const words = value.split(InlineToken.#boundary).filter(Boolean);
    if (words.some((word) => word.length > InlineToken.#longestWord && !InlineToken.#digit.test(word))) return null;
    if (words.length <= 3) return words.length;
    const idParts = words.every(
      (word) => InlineToken.#hex.test(word) && (InlineToken.#digit.test(word) || word.length >= 8),
    );
    return idParts ? 1 : null;
  }
}
