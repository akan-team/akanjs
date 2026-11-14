//? Security: what a turn's context may carry as the app's own data. An id or an enum member is one short token; any
//? other string is free text that whoever wrote the record or the link chose, and the model reads that through a tool,
//? where it arrives as page content.
export class AgentInline {
  //? Past these a link spells a message in the count of its params or segments, however short each one is.
  static readonly maxEntries = 12;
  static readonly elided = "…";
  static readonly #shape = /^[A-Za-z0-9._-]{0,40}$/;
  static readonly #separator = /[._-]/;
  static readonly #hex = /^[0-9a-fA-F]*$/;

  //? Two separators cover `in-progress`, a date and `v1.2.3`; past that only hex or digit parts pass, as in a UUID,
  //? since four words joined by dashes are a sentence.
  static isToken(value: unknown): value is string {
    if (typeof value !== "string" || !AgentInline.#shape.test(value)) return false;
    const parts = value.split(AgentInline.#separator);
    return parts.length <= 3 || parts.every((part) => AgentInline.#hex.test(part));
  }

  static path(pathname: string): string {
    let kept = 0;
    return pathname
      .split("/")
      .map((segment) => {
        if (!segment) return segment;
        kept += 1;
        return kept <= AgentInline.maxEntries && AgentInline.isToken(segment) ? segment : AgentInline.elided;
      })
      .join("/");
  }

  /** `whole` is false when an entry was left out: a key or a value that is no token, or one past `maxEntries` values. */
  static record(record: unknown): { inline: { [key: string]: string | string[] }; whole: boolean } {
    const entries = record && typeof record === "object" ? Object.entries(record) : [];
    const inline: { [key: string]: string | string[] } = {};
    let values = 0;
    for (const [key, value] of entries) {
      const items: unknown[] = Array.isArray(value) ? value : [value];
      if (!AgentInline.isToken(key) || !items.every(AgentInline.isToken)) continue;
      if (values + items.length > AgentInline.maxEntries) continue;
      values += items.length;
      inline[key] = value as string | string[];
    }
    return { inline, whole: Object.keys(inline).length === entries.length };
  }
}
