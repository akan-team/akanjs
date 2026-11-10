import { InsightQueryError } from "../insightQueryError";
import type { DatabaseAdaptor } from "./database.adaptor";
import { PostgresAkanClient } from "./sql/driver/postgres";

export interface InsightQueryOptions {
  /** Clamped to `InsightQuery.maxRows`, which no caller can raise. */
  limit?: number;
  /** In ms. Only Postgres stops the query (`statement_timeout`); a synchronous `bun:sqlite` read runs to the end. */
  timeoutMs?: number;
}

export interface InsightQueryResult {
  columns: string[];
  rows: Record<string, unknown>[];
  truncated: boolean;
}

/**
 * One read-only statement that bypasses guards, soft delete and `hidden`/`secret` masking, so no endpoint is wired
 * here: an app fronts it with its own `SuperAdmin`. `_doc` is withheld by the engine — `openInsight()` opens a
 * read-only connection lacking the column, since no text check catches `*`, whole-row values or quoted names.
 */
export class InsightQuery {
  static readonly maxRows = 1000;
  static readonly #allowedFirstKeywords = new Set(["select", "with"]);
  //* Postgres lets a CTE write, so read-only cannot rest on the derived-table rule; a column `update` is refused.
  static readonly #forbidden =
    /\b(insert|update|delete|drop|alter|create|truncate|replace|grant|revoke|attach|detach|vacuum|reindex|pragma)\b/i;
  static readonly #documentColumn = "_doc";
  static readonly #identifierChar = /[\p{L}\p{N}_$]/u;
  static readonly #dollarQuote = /^\$(?:[\p{L}_][\p{L}\p{N}_]*)?\$/u;

  readonly #database: DatabaseAdaptor;

  constructor(database: DatabaseAdaptor) {
    this.#database = database;
  }

  async run(sql: string, { limit = InsightQuery.maxRows, timeoutMs = 10_000 }: InsightQueryOptions = {}) {
    const statement = InsightQuery.#assertReadable(sql, this.#database.getConnection() instanceof PostgresAkanClient);
    const rows = Math.max(1, Math.min(limit, InsightQuery.maxRows));
    // `rows + 1` detects truncation; the newline ends a trailing `--` comment before it can swallow the `)`.
    const wrapped = `SELECT * FROM (${statement}\n) AS "akanInsight" LIMIT ${rows + 1}`;
    if (!this.#database.openInsight)
      throw new InsightQueryError(
        "insightUnavailable",
        "This database adaptor opens no insight connection, so it cannot run an insight query.",
      );
    const session = await this.#database.openInsight();
    let found: Record<string, unknown>[];
    try {
      found = await InsightQuery.#raced(session.read(wrapped, timeoutMs), timeoutMs);
    } finally {
      await session.close();
    }
    const truncated = found.length > rows;
    const kept = truncated ? found.slice(0, rows) : found;
    return {
      columns: InsightQuery.#columnsOf(kept),
      rows: kept.map((row) => InsightQuery.#readable(row)),
      truncated,
    } satisfies InsightQueryResult;
  }

  static async #raced<T>(work: Promise<T[]>, timeoutMs: number): Promise<T[]> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const expiry = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new InsightQueryError("insightTimeout", `Insight query exceeded ${timeoutMs}ms.`)),
        timeoutMs,
      );
    });
    try {
      return await Promise.race([work, expiry]);
    } finally {
      clearTimeout(timer);
    }
  }

  static #assertReadable(sql: string, postgres: boolean) {
    const statement = sql.trim().replace(/;\s*$/, "");
    if (!statement) throw new InsightQueryError("invalidInsightQuery", "An insight query needs a statement.");
    const bare = InsightQuery.#stripLiterals(statement, postgres);
    if (bare.includes(";"))
      throw new InsightQueryError("invalidInsightQuery", "An insight query is one statement. Remove the `;`.");
    const first = /[a-z]+/.exec(bare.toLowerCase())?.[0];
    if (!first || !InsightQuery.#allowedFirstKeywords.has(first))
      throw new InsightQueryError(
        "invalidInsightQuery",
        `An insight query reads: it starts with SELECT or WITH, not ${first ? first.toUpperCase() : "that"}.`,
      );
    const forbidden = InsightQuery.#forbidden.exec(bare)?.[0];
    if (forbidden)
      throw new InsightQueryError(
        "invalidInsightQuery",
        `An insight query reads: ${forbidden.toUpperCase()} has no place in one.`,
      );
    if (new RegExp(`\\b${InsightQuery.#documentColumn}\\b`).test(bare))
      throw new InsightQueryError(
        "invalidInsightQuery",
        `An insight query cannot read \`${InsightQuery.#documentColumn}\`: every field a model marks hidden or secret is inside it, and an arbitrary statement names no model to mask it by. Read base columns, or use the model's own endpoint.`,
      );
    return statement;
  }

  /**
   * One left-to-right pass, since a literal can hold a comment opener and a comment a quote; blanked with spaces so no
   * two tokens merge. A quoted identifier is unquoted, not blanked, or `"_doc"` would pass the column check. Postgres
   * `$tag$`, `E'…'` and backslash strings are refused — their end would be a guess — and a block comment ends at the
   * first `*\/` (Postgres nests), which at worst refuses a statement.
   */
  static #stripLiterals(sql: string, postgres: boolean) {
    const bare: string[] = [];
    let at = 0;
    const blankTo = (end: number) => {
      bare.push(" ".repeat(end - at));
      at = end;
    };
    const unquoteTo = (end: number) => {
      bare.push(` ${sql.slice(at + 1, end - 1)} `);
      at = end;
    };
    while (at < sql.length) {
      const char = sql[at];
      const next = sql[at + 1];
      const joined = at > 0 && InsightQuery.#identifierChar.test(sql[at - 1]);
      if (char === "-" && next === "-") {
        const end = sql.indexOf("\n", at);
        blankTo(end === -1 ? sql.length : end);
      } else if (char === "/" && next === "*") {
        const end = sql.indexOf("*/", at + 2);
        blankTo(end === -1 ? sql.length : end + 2);
      } else if (char === "'") {
        const end = InsightQuery.#closing(sql, at, "'");
        if (postgres && InsightQuery.#escapeStringPrefix(sql, at))
          throw new InsightQueryError(
            "invalidInsightQuery",
            "An insight query takes plain '…' strings: E'…' is refused.",
          );
        if (postgres && sql.slice(at, end).includes("\\"))
          throw new InsightQueryError(
            "invalidInsightQuery",
            "An insight query takes no backslash inside a string literal.",
          );
        blankTo(end);
      } else if (char === '"') {
        unquoteTo(InsightQuery.#closing(sql, at, '"'));
      } else if (!postgres && char === "`") {
        unquoteTo(InsightQuery.#closing(sql, at, "`"));
      } else if (!postgres && char === "[") {
        const end = sql.indexOf("]", at + 1);
        unquoteTo(end === -1 ? sql.length : end + 1);
      } else if (postgres && char === "$" && !joined && InsightQuery.#dollarQuote.test(sql.slice(at))) {
        throw new InsightQueryError(
          "invalidInsightQuery",
          "An insight query takes plain '…' strings: a $$-quoted string is refused.",
        );
      } else {
        bare.push(char);
        at += 1;
      }
    }
    return bare.join("");
  }

  /** A doubled quote escapes itself in both dialects; returns the index past the closing quote. */
  static #closing(sql: string, open: number, quote: string) {
    for (let at = open + 1; at < sql.length; at += 1) {
      if (sql[at] !== quote) continue;
      if (sql[at + 1] !== quote) return at + 1;
      at += 1;
    }
    return sql.length;
  }

  static #escapeStringPrefix(sql: string, quote: number) {
    const prefix = sql[quote - 1];
    if (prefix !== "E" && prefix !== "e") return false;
    return quote < 2 || !InsightQuery.#identifierChar.test(sql[quote - 2]);
  }

  static #columnsOf(rows: Record<string, unknown>[]) {
    const columns = new Set<string>();
    for (const row of rows) for (const key of Object.keys(row)) columns.add(key);
    columns.delete(InsightQuery.#documentColumn);
    return [...columns];
  }

  //* Backs the connection's withholding; a JSON column of a table made outside the model store is refused only here.
  static #readable(row: Record<string, unknown>) {
    const readable: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(row)) {
      if (key === InsightQuery.#documentColumn) continue;
      if (InsightQuery.#isDocumentShaped(value))
        throw new InsightQueryError(
          "invalidInsightQuery",
          `Column "${key}" of the insight query holds an object, which may be a document with its hidden or secret fields intact. Select the values you need instead.`,
        );
      readable[key] = value;
    }
    return readable;
  }

  static #isDocumentShaped(value: unknown): boolean {
    if (value === null || value === undefined) return false;
    if (value instanceof Date) return false;
    if (typeof value === "object") return true;
    if (typeof value !== "string") return false;
    const trimmed = value.trim();
    if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return false;
    try {
      return typeof JSON.parse(trimmed) === "object";
    } catch {
      // Not JSON after all — a string that merely opens with a brace is an ordinary value.
      return false;
    }
  }
}
