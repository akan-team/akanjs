export interface InlineRecord {
  inline: { [key: string]: string | string[] };
  withheld: number;
}

//? Security: what a turn's context may carry as the app's own data. An id or an enum member is one short token; any
//? other string is free text that whoever wrote the record or the link chose, and the model reads that through a tool,
//? where it arrives as page content.
export class AgentInline {
  static readonly maxEntries = 12;
  //? Past these a link spells a message in the count of its params or segments, however short each one is.
  static readonly maxWords = 12;
  //? A page's typed `search` declaration runs on the server, so here only a store's `search()` says a key is the
  //? app's. Four others keep `?tab=…&page=…` working on a page whose stores declare none.
  static readonly maxUndeclared = 4;
  static readonly elided = "…";
  static readonly #shape = /^[A-Za-z0-9._-]{0,40}$/;
  static readonly #boundary = /[._-]|(?<=[a-z])(?=[A-Z])/;
  static readonly #uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  static readonly #hex = /^[0-9a-fA-F]+$/;
  static readonly #digit = /[0-9]/;
  static readonly #longestWord = 16;

  static isToken(value: unknown): value is string {
    return AgentInline.wordsOf(value) !== null;
  }

  //? A word ends at a separator or a lower-to-upper case change, so `createdAtDesc` is three words as
  //? `created-at-desc` is. Three pass, as an enum member or a date has. More pass only as an id's parts: each hex,
  //? with a digit or eight characters long, which words spelled with a to f are not. A run of letters longer than a
  //? word is words written together.
  static wordsOf(value: unknown): number | null {
    if (typeof value !== "string" || !AgentInline.#shape.test(value)) return null;
    if (AgentInline.#uuid.test(value)) return 1;
    const words = value.split(AgentInline.#boundary).filter(Boolean);
    if (words.some((word) => word.length > AgentInline.#longestWord && !AgentInline.#digit.test(word))) return null;
    if (words.length <= 3) return words.length;
    const idParts = words.every(
      (word) => AgentInline.#hex.test(word) && (AgentInline.#digit.test(word) || word.length >= 8),
    );
    return idParts ? 1 : null;
  }

  static path(pathname: string): string {
    let segments = 0;
    let words = 0;
    return pathname
      .split("/")
      .map((segment) => {
        if (!segment) return segment;
        const count = AgentInline.wordsOf(segment);
        if (count === null || segments >= AgentInline.maxEntries || words + count > AgentInline.maxWords)
          return AgentInline.elided;
        segments += 1;
        words += count;
        return segment;
      })
      .join("/");
  }

  static params(record: unknown): InlineRecord {
    return AgentInline.#record(record, (key, values) => (AgentInline.isToken(key) ? values : null));
  }

  static search(record: unknown, declared: ReadonlySet<string>): InlineRecord {
    let undeclared = 0;
    return AgentInline.#record(record, (key, values) => {
      if (declared.has(key)) return AgentInline.#wordsIn(values) === null ? null : [];
      if (undeclared >= AgentInline.maxUndeclared || AgentInline.#wordsIn([key, ...values]) === null) return null;
      undeclared += 1;
      return [key, ...values];
    });
  }

  static #record(record: unknown, counted: (key: string, values: unknown[]) => unknown[] | null): InlineRecord {
    const entries = record && typeof record === "object" ? Object.entries(record) : [];
    const inline: InlineRecord["inline"] = {};
    let words = 0;
    for (const [key, value] of entries) {
      if (Object.keys(inline).length >= AgentInline.maxEntries) break;
      const values: unknown[] = Array.isArray(value) ? value : [value];
      const count = AgentInline.#wordsIn(values) === null ? null : AgentInline.#wordsIn(counted(key, values));
      if (count === null || words + count > AgentInline.maxWords) continue;
      words += count;
      inline[key] = value as string | string[];
    }
    return { inline, withheld: entries.length - Object.keys(inline).length };
  }

  static #wordsIn(values: unknown[] | null): number | null {
    if (!values) return null;
    let words = 0;
    for (const value of values) {
      const count = AgentInline.wordsOf(value);
      if (count === null) return null;
      words += count;
    }
    return words;
  }
}
