import type { AkanSqlClient } from "./database.adaptor";

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
 * Three things enforce read-only, and only the third is ours:
 *
 * 1. The statement is wrapped as a derived table — `SELECT * FROM (<sql>) AS "akanInsight" LIMIT ?`. Nothing but a
 *    query is legal in that position, in either dialect, so a write is a syntax error from the engine rather than a
 *    pattern this code had to recognise. A second statement smuggled behind `;` is a syntax error for the same
 *    reason, and the row ceiling rides along on the same wrapper.
 * 2. A rejection before execution, so the caller reads why rather than a syntax error. It runs on the statement with
 *    comments and string literals removed, because that is what makes `-- ` and `'…'` unable to hide anything.
 * 3. **`_doc` never crosses the boundary.** Every non-base field lives in that one JSON column, which is where the
 *    plan's "re-apply schema-based masking" runs into the fact that an arbitrary SELECT has no model to mask by. So
 *    the enforceable rule is the column itself: unnameable in the statement, dropped from the rows, and any cell
 *    that still arrives holding a JSON object or array is refused. An insight is made of scalars; a value that is
 *    not one is either a document or indistinguishable from it.
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

  readonly #client: AkanSqlClient;

  constructor(client: AkanSqlClient) {
    this.#client = client;
  }

  async run(sql: string, { limit = InsightQuery.maxRows, timeoutMs = 10_000 }: InsightQueryOptions = {}) {
    const statement = InsightQuery.#assertReadable(sql);
    const rows = Math.max(1, Math.min(limit, InsightQuery.maxRows));
    // One more than asked for, which is how truncation is detected without a second count query.
    const wrapped = `SELECT * FROM (${statement}) AS "akanInsight" LIMIT ${rows + 1}`;
    const found = await InsightQuery.#raced(this.#client.prepare(wrapped).all(), timeoutMs);
    const truncated = found.length > rows;
    const kept = truncated ? found.slice(0, rows) : found;
    return {
      columns: InsightQuery.#columnsOf(kept),
      rows: kept.map((row) => InsightQuery.#readable(row)),
      truncated,
    } satisfies InsightQueryResult;
  }

  /**
   * Stops waiting; does not stop the query.
   *
   * With libsql or Postgres the driver call is genuinely asynchronous, so the caller is freed and the connection
   * finishes on its own. With `bun:sqlite` it is synchronous and holds the event loop, so this timer cannot fire
   * until the query is already done — the ceiling is what limits that case, not the clock. Do not read the timeout
   * as protection against an expensive statement.
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
  static #assertReadable(sql: string) {
    const statement = sql.trim().replace(/;\s*$/, "");
    if (!statement) throw new Error("An insight query needs a statement.");
    const bare = InsightQuery.#stripLiterals(statement);
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
   * Replaced with spaces rather than deleted, so nothing that was two tokens becomes one — `a/**\/b` must not read
   * as the identifier `ab`. Dollar-quoting is not handled: it is Postgres function-body syntax, and a statement
   * that begins with SELECT or WITH has nowhere legal to put one.
   *
   * A double-quoted span is **unquoted, not blanked**. It is an identifier in both dialects, not a literal, so
   * blanking it was what let `SELECT "_doc"` through the column check while `SELECT _doc` was refused. Keeping the
   * contents means SQLite's fallback — a double-quoted string, where no such column exists — is read as an
   * identifier too, which errs toward refusing a statement rather than toward reading the column.
   */
  static #stripLiterals(sql: string) {
    return sql
      .replace(/\/\*[\s\S]*?(\*\/|$)/g, (match) => " ".repeat(match.length))
      .replace(/--[^\n]*/g, (match) => " ".repeat(match.length))
      .replace(/'(?:''|[^'])*'/g, (match) => " ".repeat(match.length))
      .replace(/"(?:""|[^"])*"/g, (match) => ` ${match.slice(1, -1)} `);
  }

  static #columnsOf(rows: Record<string, unknown>[]) {
    const columns = new Set<string>();
    for (const row of rows) for (const key of Object.keys(row)) columns.add(key);
    columns.delete(InsightQuery.#documentColumn);
    return [...columns];
  }

  /**
   * Drops the document column and refuses anything else shaped like one.
   *
   * The column has to be dropped here as well as rejected in the statement, because `SELECT * FROM "user"` returns
   * it without ever naming it. The JSON check is for the ways a dialect can hand back a whole row under another
   * name — `row_to_json(u)` — which no list of forbidden function names would keep up with.
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
