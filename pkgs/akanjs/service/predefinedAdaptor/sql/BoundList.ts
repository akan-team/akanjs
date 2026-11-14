import { BASE_COLUMNS, type PathKind, type SqlDialect, type SqlFrag } from "./types";
import { encodeSqlValue, jsonStr, quoteIdent } from "./values";

export interface BoundListOptions {
  kind?: PathKind;
  negated?: boolean;
}

export class BoundList {
  readonly #dialect: SqlDialect;

  constructor(dialect: SqlDialect) {
    this.#dialect = dialect;
  }

  //? Null where a placeholder per value stays. On SQLite: with no statistics its planner takes `json_each(?)` for 25
  //? rows whatever it holds, so a list of one id stops reading through the primary key and reads every live row. For
  //? one value: Postgres plans an array of unknown length for 10 items, and so replans a shorter one on every run.
  compare(path: string, values: unknown[], { kind = "json", negated = false }: BoundListOptions = {}): SqlFrag | null {
    if (this.#dialect.name !== "postgres" || values.length < 2) return null;
    if (BASE_COLUMNS.has(path)) {
      const items = values.map(encodeSqlValue).map((value) => (value == null ? null : String(value)));
      return BoundList.#array(quoteIdent(path), path === "id" ? "text" : "bigint", items, negated);
    }
    //? As the dialect compares one value: against an operand that is not a string, a declared string compares as jsonb.
    if (kind === "text" && values.every((value) => typeof value === "string"))
      return BoundList.#array(this.#dialect.extract(path, "text"), "text", values.map(String), negated);
    return BoundList.#array(this.#dialect.extract(path, "json"), "jsonb", values.map(jsonStr), negated);
  }

  //? Bound as the array's text, each item quoted: an item then holds a comma, a brace or the word NULL as itself.
  static #array(expr: string, type: "text" | "jsonb" | "bigint", items: (string | null)[], negated: boolean): SqlFrag {
    const literal = items.map((item) =>
      item === null ? "NULL" : `"${item.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`,
    );
    return { sql: `${expr} ${negated ? "<> ALL" : "= ANY"}(?::${type}[])`, params: [`{${literal.join(",")}}`] };
  }
}
