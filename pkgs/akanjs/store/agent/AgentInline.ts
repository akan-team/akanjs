import { InlineToken } from "../../common/inlineToken";

export interface InlineRecord {
  inline: { [key: string]: string | string[] };
  withheld: number;
}

export interface InlineValue {
  value?: unknown;
  whole: boolean;
}

//? Security: how much of a link or a published value a turn's context carries as the app's own data: tokens only,
//? and few of them. The rest the model reads through `readState`, where it arrives as page content.
export class AgentInline {
  static readonly maxEntries = 12;
  //? Past these a link spells a message in the count of its params or segments, however short each one is.
  static readonly maxWords = 12;
  //? A page's typed `search` declaration runs on the server, so here only a store's `search()` says a key is the
  //? app's. Four others keep `?tab=…&page=…` working on a page whose stores declare none.
  static readonly maxUndeclared = 4;
  static readonly elided = "…";
  //? An ISO timestamp is digits in fixed places, so it spells nothing and spends no word.
  static readonly #timestamp = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;

  static path(pathname: string): string {
    let segments = 0;
    let words = 0;
    return pathname
      .split("/")
      .map((segment) => {
        if (!segment) return segment;
        const count = InlineToken.wordsOf(segment);
        if (count === null || segments >= AgentInline.maxEntries || words + count > AgentInline.maxWords)
          return AgentInline.elided;
        segments += 1;
        words += count;
        return segment;
      })
      .join("/");
  }

  static params(record: unknown): InlineRecord {
    return AgentInline.#record(record, (key, values) => (InlineToken.is(key) ? values : null));
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

  //? A field name is the app's as a route param's is, so only values spend words; a list rides whole or not at all,
  //? since one with gaps reads as a shorter list.
  static value(value: unknown): InlineValue {
    if (value === undefined) return { whole: true };
    const fields = AgentInline.#fieldsOf(value);
    if (!fields) {
      const words = AgentInline.#valueWords(value);
      return words !== null && words <= AgentInline.maxWords ? { value, whole: true } : { whole: false };
    }
    const kept: { [key: string]: unknown } = {};
    let words = 0;
    for (const [key, field] of fields) {
      const count =
        InlineToken.is(key) && Object.keys(kept).length < AgentInline.maxEntries
          ? AgentInline.#valueWords(field)
          : null;
      if (count === null || words + count > AgentInline.maxWords) continue;
      words += count;
      kept[key] = field;
    }
    const whole = Object.keys(kept).length === fields.length;
    return { ...(whole || Object.keys(kept).length ? { value: kept } : {}), whole };
  }

  static #fieldsOf(value: unknown): [string, unknown][] | null {
    if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
    if (typeof (value as { toJSON?: unknown }).toJSON === "function") return null;
    return Object.entries(value).filter(([, field]) => field !== undefined);
  }

  static #valueWords(value: unknown, listed = false): number | null {
    const json = (value as { toJSON?: unknown } | null)?.toJSON;
    const plain: unknown = typeof json === "function" ? json.call(value) : value;
    if (plain === null || typeof plain === "number" || typeof plain === "boolean") return 0;
    if (typeof plain === "string") return AgentInline.#timestamp.test(plain) ? 0 : InlineToken.wordsOf(plain);
    if (!Array.isArray(plain) || listed) return null;
    let words = 0;
    for (const item of plain) {
      const count = AgentInline.#valueWords(item, true);
      if (count === null) return null;
      words += count;
    }
    return words;
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
      const count = InlineToken.wordsOf(value);
      if (count === null) return null;
      words += count;
    }
    return words;
  }
}
