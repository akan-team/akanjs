import { InlineToken } from "../../common/inlineToken";

export interface InlineRecord {
  inline: { [key: string]: string | string[] };
  withheld: number;
}

//? Security: how much of a link a turn's context carries as the app's own data: tokens only, and few of them. The
//? rest the model reads through `readState`, where it arrives as page content.
export class AgentInline {
  static readonly maxEntries = 12;
  //? Past these a link spells a message in the count of its params or segments, however short each one is.
  static readonly maxWords = 12;
  //? A page's typed `search` declaration runs on the server, so here only a store's `search()` says a key is the
  //? app's. Four others keep `?tab=…&page=…` working on a page whose stores declare none.
  static readonly maxUndeclared = 4;
  static readonly elided = "…";

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
