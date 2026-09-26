import type { DatabaseAdaptor } from "./database.adaptor";
import { PostgresAkanClient } from "./sql/driver/postgres";

export interface InsightQueryOptions {
  /** Rows to return at most. Clamped to `InsightQuery.maxRows`, which no caller can raise. */
  limit?: number;
  /** How long to wait for the driver, in ms. See the note on `#raced` for which dialects this can actually stop. */
  timeoutMs?: number;
}

export interface InsightQueryResult {
  columns: string[];
  rows: Record<string, unknown>[];
  /** The ceiling cut the answer short, so the caller knows not to read it as complete. */
  truncated: boolean;
}

/**
 * One read-only SQL statement, for an agent or an operator asking a question the domain endpoints cannot express.
 *
 * This is the layer-bypassing read, and every safeguard the framework has is bypassed with it — guards, soft delete,
 * cascade, `_postRemove`, and the `hidden`/`secret` masking every other response path performs. So it is read-only
 * by construction rather than by convention, and it is deliberately *not* wired to an endpoint here: the framework
 * owns no guard strong enough to sit in front of it. An app that wants it writes the endpoint with its own
 * `SuperAdmin`, the same way guards ship with the library that owns the model.
 *
 * **`_doc` never crosses the boundary.** Every non-base field lives in that one JSON column, and an arbitrary SELECT
 * names no model to mask by, so the column itself is what is withheld — and the engine withholds it, because no check
 * on a statement's text can: a `*` renamed by a column list, a whole-row value and SQLite's quoted-string names all
 * reach it without spelling it. The statement runs on a connection the database adaptor opens for it
 * (`openInsight()`), where the column does not exist as far as the engine can tell — see `SqliteInsightSession` and
 * `PostgresInsightSession` — and which cannot write.
 *
 * The rest is layered on top, for readable refusals and depth:
 *
 * 1. The statement is wrapped as a derived table — `SELECT * FROM (<sql>) AS "akanInsight" LIMIT ?`. Nothing but a
 *    query is legal in that position, in either dialect, and the row ceiling rides along on the same wrapper.
 * 2. A rejection before execution, so the caller reads why rather than an engine error. It runs on the statement with
 *    comments and string literals removed, because that is what makes `-- ` and `'…'` unable to hide anything.
 * 3. The rows: the document column is dropped, and any cell that still arrives holding a JSON object or array is
 *    refused. An insight is made of scalars; a value that is not one is either a document or indistinguishable from it.
 *
 * What that costs is real and worth saying: this answers "how many, since when, grouped how" over base columns and
 * the search mirror, and it cannot read a domain field. Field-level reads go through the domain tools, which mask.
 */
export class InsightQuery {
  /** Not an option. A caller asking for more gets this, because the point is that no caller sets the ceiling. */
  static readonly maxRows = 1000;
  static readonly #allowedFirstKeywords = new Set(["select", "with"]);
  /**
   * Words that cannot appear anywhere in a read, checked so read-only does not rest on a dialect's own rule.
   *
   * `WITH` has to be allowed as a first keyword — a CTE is how a real question gets asked — and Postgres lets a CTE
   * modify data. That it is illegal *inside* the derived table this wraps the statement in is true and is what would
   * stop it, but it is one sentence of another project's documentation away from not being true. This does not
   * depend on it. Word-boundary matched on the comment- and literal-stripped statement, so `deleted_at` is fine and
   * a column that is genuinely named `update` is refused — the wrong answer in the safe direction.
   */
  static readonly #forbidden =
    /\b(insert|update|delete|drop|alter|create|truncate|replace|grant|revoke|attach|detach|vacuum|reindex|pragma)\b/i;
  /** The column every document's non-base fields live in. See the class note. */
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
    // One more than asked for, which is how truncation is detected without a second count query. The newline ends a
    // trailing `--` comment before it can swallow the wrapper's own closing parenthesis.
    const wrapped = `SELECT * FROM (${statement}\n) AS "akanInsight" LIMIT ${rows + 1}`;
    if (!this.#database.openInsight)
      throw new Error("This database adaptor opens no insight connection, so it cannot run an insight query.");
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

  /**
   * Stops waiting; Postgres also stops the query, through `statement_timeout`.
   *
   * With `bun:sqlite` the read is synchronous and holds the event loop, so this timer cannot fire until the query is
   * already done — the ceiling is what limits that case, not the clock. Do not read the timeout as protection against
   * an expensive statement on SQLite.
   */
  static async #raced<T>(work: Promise<T[]>, timeoutMs: number): Promise<T[]> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const expiry = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`Insight query exceeded ${timeoutMs}ms.`)), timeoutMs);
    });
    try {
      return await Promise.race([work, expiry]);
    } finally {
      clearTimeout(timer);
    }
  }

  /** Returns the statement with a trailing `;` removed, or throws naming what is wrong with it. */
  static #assertReadable(sql: string, postgres: boolean) {
    const statement = sql.trim().replace(/;\s*$/, "");
    if (!statement) throw new Error("An insight query needs a statement.");
    const bare = InsightQuery.#stripLiterals(statement, postgres);
    if (bare.includes(";")) throw new Error("An insight query is one statement. Remove the `;`.");
    const first = /[a-z]+/.exec(bare.toLowerCase())?.[0];
    if (!first || !InsightQuery.#allowedFirstKeywords.has(first))
      throw new Error(
        `An insight query reads: it starts with SELECT or WITH, not ${first ? first.toUpperCase() : "that"}.`,
      );
    const forbidden = InsightQuery.#forbidden.exec(bare)?.[0];
    if (forbidden) throw new Error(`An insight query reads: ${forbidden.toUpperCase()} has no place in one.`);
    if (new RegExp(`\\b${InsightQuery.#documentColumn}\\b`).test(bare))
      throw new Error(
        `An insight query cannot read \`${InsightQuery.#documentColumn}\`: every field a model marks hidden or secret is inside it, and an arbitrary statement names no model to mask it by. Read base columns, or use the model's own endpoint.`,
      );
    return statement;
  }

  /**
   * Blanks out comments and string literals so the checks above read only what the engine would treat as syntax.
   *
   * One pass, left to right, because a literal can hold a comment opener and a comment can hold a quote: stripped in
   * separate passes, `SELECT '--', _doc …` read as a comment from inside the string to the end of the line, and the
   * column it hid went through. Replaced with spaces rather than deleted, so nothing that was two tokens becomes one —
   * `a/**\/b` must not read as the identifier `ab`. Where the engines disagree the scan blanks the lesser span: a block
   * comment ends at the first `*\/`, which Postgres would nest past, so the rest shows and at worst refuses a statement.
   *
   * A quoted identifier is **unquoted, not blanked** — `"…"`, and in SQLite `[…]` and backticks. It is an identifier,
   * not a literal, so blanking it was what let `SELECT "_doc"` through the column check while `SELECT _doc` was
   * refused. SQLite's fallback — a double-quoted string, where no such column exists — is read as an identifier too,
   * which errs toward refusing a statement rather than toward reading the column.
   *
   * Postgres has string forms whose end the scan would have to guess: `$tag$…$tag$`, `E'…'` with backslash escapes,
   * and a backslash in a plain literal, which ends the string elsewhere once `standard_conforming_strings` is off.
   * An insight never needs one, so each is refused rather than read. SQLite has none of them, and reading one of them
   * the Postgres way there would blank text SQLite treats as syntax, which is why the scan follows the connection.
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
          throw new Error("An insight query takes plain '…' strings: E'…' is refused.");
        if (postgres && sql.slice(at, end).includes("\\"))
          throw new Error("An insight query takes no backslash inside a string literal.");
        blankTo(end);
      } else if (char === '"') {
        unquoteTo(InsightQuery.#closing(sql, at, '"'));
      } else if (!postgres && char === "`") {
        unquoteTo(InsightQuery.#closing(sql, at, "`"));
      } else if (!postgres && char === "[") {
        const end = sql.indexOf("]", at + 1);
        unquoteTo(end === -1 ? sql.length : end + 1);
      } else if (postgres && char === "$" && !joined && InsightQuery.#dollarQuote.test(sql.slice(at))) {
        throw new Error("An insight query takes plain '…' strings: a $$-quoted string is refused.");
      } else {
        bare.push(char);
        at += 1;
      }
    }
    return bare.join("");
  }

  /** A doubled quote is the quote itself, in both dialects. Past the closing quote, or the end of an unclosed one. */
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

  /**
   * Drops the document column and refuses anything else shaped like one — behind the connection, which should already
   * have withheld both. A table the app created outside the model store is read as it is, so a JSON column of its own
   * is refused here and nowhere else.
   */
  static #readable(row: Record<string, unknown>) {
    const readable: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(row)) {
      if (key === InsightQuery.#documentColumn) continue;
      if (InsightQuery.#isDocumentShaped(value))
        throw new Error(
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
