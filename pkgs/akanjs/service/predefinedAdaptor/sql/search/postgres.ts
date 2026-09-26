import { Logger } from "akanjs/common";
import { type ConstantModel, textFieldRoles } from "akanjs/constant";
import { type DatabaseModel, type SearchColumn, searchColumns } from "akanjs/document";
import { quoteIdent } from "../../sqlDescriptor";
import { PostgresDialect } from "../dialect/postgres";
import type { SqlFrag } from "../types";
import { likePattern } from "../values";
import { type MirrorSegment, SearchMirror } from "./mirror";
import {
  DOC_TABLE,
  type ModelTriggers,
  type SearchColumns,
  type SearchEngine,
  type SearchIndexOwner,
  type SearchQuery,
} from "./types";

type PostgresSearchMode = { kind: "word"; unaccent: boolean } | { kind: "trigram"; caseSensitive: boolean };

export interface PostgresSearchOwner extends SearchIndexOwner {
  lockSchema<T>(fn: () => Promise<T>): Promise<T>;
}

/**
 * The Postgres index: a weighted `tsvector` generated from `search_doc` under a GIN index, or — for the `trigram`
 * tokenizer — pg_trgm GIN over the mirror columns. SQLite's fts5 is the contract; the two match the same rows for the
 * same text, and only the ranking differs, since `ts_rank` has no document-frequency term.
 */
export class PostgresSearchEngine implements SearchEngine {
  readonly merges = false;
  // Without the row lock a write that commits between the backfill's snapshot and its upsert is overwritten by the
  // older value, since the trigger's own upsert landed first; with it the backfill reads the row the writer left.
  readonly backfillLock = "FOR SHARE OF NEW";
  static readonly #config = "akan_search";
  static readonly #purge = "akan_search_purge";
  static readonly #vectorIndex = `${DOC_TABLE}_tsv`;
  static readonly #trigramIndex = `${DOC_TABLE}_trgm`;
  // ASCII punctuation joins a word in the default parser — `hello@naver.com`, `3.14` and `/usr/local` each come out
  // as one lexeme — where unicode61 splits all of them. Spaced out first, the parser sees what fts5 sees.
  static readonly #punctuation = `!"#$%&'()*+,-./:;<=>?@[\\]^_\`{|}~`;
  static readonly #asciiSeparators = /[^A-Za-z0-9\u0080-\u{10FFFF}]/gu;
  // A tsvector refuses more than 1MB of lexemes and positions, and the refusal would fail the model write the trigger
  // runs in. Unique two-syllable Hangul words — the densest input — reach it near 314,000 characters, so the four
  // columns stay under that together; `desc`, the one that holds prose, goes last and keeps most of the room.
  static readonly #indexedChars: { [column in SearchColumn]: number } = {
    title: 20_000,
    tag: 20_000,
    filter: 20_000,
    desc: 200_000,
  };
  // Four columns, four tsvector weights. `ts_rank` takes them as {D, C, B, A}.
  static readonly #weightOf: { [column in SearchColumn]: "A" | "B" | "C" | "D" } = {
    title: "A",
    tag: "B",
    desc: "C",
    filter: "D",
  };
  static readonly #parserTokenTypes = [
    "asciiword",
    "word",
    "numword",
    "asciihword",
    "hword",
    "numhword",
    "hword_asciipart",
    "hword_part",
    "hword_numpart",
    "email",
    "url",
    "host",
    "url_path",
    "file",
    "sfloat",
    "float",
    "int",
    "uint",
    "version",
  ];
  static readonly #dialect = new PostgresDialect();

  readonly #owner: PostgresSearchOwner;
  readonly #tokenizer: string;
  readonly #schema: string;
  readonly #logger = new Logger("SearchIndex");
  #parsedMode: PostgresSearchMode | null = null;

  constructor(owner: PostgresSearchOwner, { tokenizer, schema }: { tokenizer: string; schema: string }) {
    this.#owner = owner;
    this.#tokenizer = tokenizer;
    this.#schema = schema;
  }

  /** Maps the fts5 tokenizer spelling onto what Postgres can build; anything else would silently match differently. */
  static mode(tokenizer: string): PostgresSearchMode {
    const [name = "", ...rest] = tokenizer
      .trim()
      .split(/\s+/)
      .map((word) => word.replace(/^(['"])(.*)\1$/, "$2"));
    const options = new Map<string, string>();
    for (let idx = 0; idx < rest.length; idx += 2) options.set(rest[idx], rest[idx + 1] ?? "");
    const only = (key: string, values: string[], fallback: string) => {
      if ([...options.keys()].some((option) => option !== key)) return null;
      const value = options.get(key) ?? fallback;
      return values.includes(value) ? value : null;
    };
    const diacritics = name === "unicode61" ? only("remove_diacritics", ["0", "1", "2"], "1") : null;
    if (diacritics) return { kind: "word", unaccent: diacritics !== "0" };
    const caseSensitive = name === "trigram" ? only("case_sensitive", ["0", "1"], "0") : null;
    if (caseSensitive) return { kind: "trigram", caseSensitive: caseSensitive === "1" };
    throw new Error(
      `Postgres text search reads AKAN_SEARCH_TOKENIZER as "unicode61 [remove_diacritics 0|1|2]" or "trigram [case_sensitive 0|1]", and "${tokenizer}" is neither. Fix AKAN_SEARCH_TOKENIZER, or set AKAN_SEARCH_ENABLED=0 to run without text search.`,
    );
  }

  /**
   * One quoted operand per word piece, `<->` inside a term and `&` between terms — what fts5 makes of a quoted term.
   * Removing ASCII punctuation also removes every character tsquery syntax is made of, so a piece needs no escaping.
   */
  static tsquery(text: string, { prefix = false, columns }: { prefix?: boolean; columns?: readonly SearchColumn[] }) {
    const weights = columns?.map((column) => PostgresSearchEngine.#weightOf[column]).join("") ?? "";
    const terms = text
      .split(/\s+/)
      .map((term) => term.replace(PostgresSearchEngine.#asciiSeparators, " ").split(" ").filter(Boolean))
      .filter((pieces) => pieces.length);
    if (!terms.length) return null;
    return terms
      .map((pieces, termIdx) =>
        pieces
          .map((piece, pieceIdx) => {
            const last = prefix && termIdx === terms.length - 1 && pieceIdx === pieces.length - 1;
            const flags = `${last ? "*" : ""}${weights}`;
            return `'${piece}'${flags ? `:${flags}` : ""}`;
          })
          .join(" <-> "),
      )
      .join(" & ");
  }

  get #mode() {
    this.#parsedMode ??= PostgresSearchEngine.mode(this.#tokenizer);
    return this.#parsedMode;
  }

  get #schemaIdent() {
    return quoteIdent(this.#schema);
  }

  get #doc() {
    return `${this.#schemaIdent}.${quoteIdent(DOC_TABLE)}`;
  }

  get #configName() {
    return `${this.#schemaIdent}.${quoteIdent(PostgresSearchEngine.#config)}`;
  }

  #qualified(name: string) {
    return `${this.#schemaIdent}.${quoteIdent(PostgresSearchEngine.#dialect.indexName(name))}`;
  }

  schemaDescriptor() {
    return {
      engine: "postgres",
      mode: this.#mode,
      doc: textFieldRoles,
      columns: searchColumns,
      vector: this.#vector(),
      purge: this.#purgeFunction(),
    };
  }

  async ensureSchema(current: boolean) {
    const mode = this.#mode;
    const conn = this.#owner.getConnection();
    const extension = await this.#extension(mode);
    await this.#warnOnAsciiOnlyCase();
    await conn.execute(
      `CREATE TABLE IF NOT EXISTS ${this.#doc} ("ref" TEXT NOT NULL, "refId" TEXT NOT NULL, ${textFieldRoles
        .map((role) => `${quoteIdent(role)} TEXT NOT NULL DEFAULT ''`)
        .join(", ")}, PRIMARY KEY ("ref", "refId"))`,
    );
    if (current && (await this.#indexExists(mode))) return [];
    const added = await this.#addMissingDocColumns();
    // Dropped whole and rebuilt from `search_doc`, as fts5's `rebuild` does: the model tables are not re-read.
    await conn.execute(`DROP INDEX IF EXISTS ${this.#qualified(PostgresSearchEngine.#vectorIndex)}`);
    await conn.execute(`DROP INDEX IF EXISTS ${this.#qualified(PostgresSearchEngine.#trigramIndex)}`);
    await conn.execute(`ALTER TABLE ${this.#doc} DROP COLUMN IF EXISTS "tsv"`);
    await conn.execute(`DROP TEXT SEARCH CONFIGURATION IF EXISTS ${this.#configName}`);
    if (mode.kind === "word") {
      await conn.execute(`CREATE TEXT SEARCH CONFIGURATION ${this.#configName} (COPY = pg_catalog.simple)`);
      if (extension)
        await conn.execute(
          `ALTER TEXT SEARCH CONFIGURATION ${this.#configName} ALTER MAPPING FOR ${PostgresSearchEngine.#parserTokenTypes.join(", ")} WITH ${quoteIdent(extension)}."unaccent", pg_catalog.simple`,
        );
      await conn.execute(
        `ALTER TABLE ${this.#doc} ADD COLUMN "tsv" tsvector GENERATED ALWAYS AS (${this.#vector()}) STORED`,
      );
      await conn.execute(
        `CREATE INDEX ${quoteIdent(PostgresSearchEngine.#dialect.indexName(PostgresSearchEngine.#vectorIndex))} ON ${this.#doc} USING GIN ("tsv")`,
      );
    } else {
      const opclass = `${quoteIdent(extension ?? "public")}.gin_trgm_ops`;
      await conn.execute(
        `CREATE INDEX ${quoteIdent(PostgresSearchEngine.#dialect.indexName(PostgresSearchEngine.#trigramIndex))} ON ${this.#doc} USING GIN (${searchColumns
          .map((column) => `${quoteIdent(column)} ${opclass}`)
          .join(", ")})`,
      );
    }
    await conn.execute(this.#purgeFunction());
    return added;
  }

  columns(constant: ConstantModel, database: DatabaseModel, alias: "NEW" | "OLD") {
    return SearchMirror.columns(constant, database, (segments, path, role) =>
      this.#roleExpression(segments, path, role, alias),
    );
  }

  modelTriggers(ref: string, next: SearchColumns, prev: SearchColumns | null): ModelTriggers {
    const table = `${this.#schemaIdent}.${quoteIdent(ref)}`;
    const upsert = this.#qualified(`akan_search_${ref}`);
    const purge = `${this.#schemaIdent}.${quoteIdent(PostgresSearchEngine.#purge)}('${ref}')`;
    const values = (columns: SearchColumns) => `ARRAY[${SearchMirror.columnList(columns)}]`;
    // A trigger's WHEN cannot hold a subquery, which an array role needs, so the function compares the mirrored values
    // itself; the WHEN still skips a write that left `_doc` alone — an `updatedAt` bump.
    const unchanged = prev
      ? `IF TG_OP = 'UPDATE' AND OLD."removedAt" IS NULL THEN
    IF next_values IS NOT DISTINCT FROM ${values(prev)} THEN
      RETURN NULL;
    END IF;
  END IF;
  `
      : "";
    const trigger = (suffix: string, event: string, when: string | null, call: string): [string, string] => {
      const name = PostgresSearchEngine.#dialect.indexName(`${ref}_search_${suffix}`);
      return [
        name,
        `CREATE OR REPLACE TRIGGER ${quoteIdent(name)} ${event} ON ${table} FOR EACH ROW ${when ? `WHEN (${when}) ` : ""}EXECUTE FUNCTION ${call}`,
      ];
    };
    return [
      [
        upsert,
        `CREATE OR REPLACE FUNCTION ${upsert}() RETURNS trigger LANGUAGE plpgsql AS $akan$
DECLARE
  next_values text[] := ${values(next)};
BEGIN
  ${unchanged}INSERT INTO ${this.#doc} ("ref", "refId", ${SearchMirror.docColumns})
    VALUES ('${ref}', NEW."id", ${textFieldRoles.map((_, idx) => `next_values[${idx + 1}]`).join(", ")})
    ${SearchMirror.upsertTail};
  RETURN NULL;
END
$akan$`,
      ],
      trigger("ai", "AFTER INSERT", `NEW."removedAt" IS NULL`, `${upsert}()`),
      trigger(
        "au",
        "AFTER UPDATE",
        `NEW."removedAt" IS NULL AND (OLD."removedAt" IS NOT NULL OR OLD."_doc" IS DISTINCT FROM NEW."_doc")`,
        `${upsert}()`,
      ),
      trigger("soft", "AFTER UPDATE", `NEW."removedAt" IS NOT NULL AND OLD."removedAt" IS NULL`, purge),
      trigger("ad", "AFTER DELETE", null, purge),
    ];
  }

  // `CREATE OR REPLACE TRIGGER` waits for every write in flight on its table, so a boot that finds them in place does
  // not issue it.
  async createModelTriggers(ref: string, triggers: ModelTriggers, replace: boolean) {
    if (!replace && (await this.#hasTriggers(ref, triggers))) return;
    await this.#owner.lockSchema(async () => {
      for (const [, sql] of triggers) await this.#owner.getConnection().execute(sql);
    });
  }

  // Every boot drops the triggers of every model without a text role; reading the catalog first spares each of them a
  // schema-lock turn.
  async dropModelTriggers(ref: string) {
    const table = `${this.#schemaIdent}.${quoteIdent(ref)}`;
    const upsert = this.#qualified(`akan_search_${ref}`);
    const names = ["ai", "au", "soft", "ad"].map((suffix) =>
      PostgresSearchEngine.#dialect.indexName(`${ref}_search_${suffix}`),
    );
    const existing = async () => {
      const row = await this.#owner
        .getConnection()
        .prepare(
          `SELECT ARRAY(SELECT tgname::text FROM pg_trigger WHERE tgrelid = to_regclass(?) AND tgname = ANY(?::text[])) AS "triggers", to_regprocedure(?) IS NOT NULL AS "upsert"`,
        )
        .get<{ triggers: string[]; upsert: boolean }>(table, names, `${upsert}()`);
      return { triggers: row?.triggers ?? [], upsert: !!row?.upsert };
    };
    const found = await existing();
    if (!found.triggers.length && !found.upsert) return;
    await this.#owner.lockSchema(async () => {
      const conn = this.#owner.getConnection();
      const { triggers, upsert: hasUpsert } = await existing();
      for (const name of triggers) await conn.execute(`DROP TRIGGER IF EXISTS ${quoteIdent(name)} ON ${table}`);
      if (hasUpsert) await conn.execute(`DROP FUNCTION IF EXISTS ${upsert}()`);
    });
  }

  // GIN keeps a pending list that autovacuum folds in; there is nothing to merge on a timer.
  async merge() {}

  join({ ref, text, prefix, columns, weights }: SearchQuery): SqlFrag | null {
    const mode = this.#mode;
    return mode.kind === "word"
      ? this.#wordJoin(ref, text, prefix, columns, weights)
      : this.#trigramJoin(ref, text, columns, weights, mode.caseSensitive);
  }

  #wordJoin(
    ref: string,
    text: string,
    prefix: boolean,
    columns: readonly SearchColumn[] | undefined,
    weights: readonly number[],
  ): SqlFrag | null {
    const query = PostgresSearchEngine.tsquery(text, { prefix, columns });
    if (!query) return null;
    // `ts_rank` refuses a weight above 1, and scaling every weight by one factor leaves its order alone.
    const top = Math.max(...weights);
    const byWeight = Object.fromEntries(
      searchColumns.map((column, idx) => [PostgresSearchEngine.#weightOf[column], top > 0 ? weights[idx] / top : 0]),
    );
    const rankWeights = `{${["D", "C", "B", "A"].map((weight) => byWeight[weight]).join(",")}}`;
    return {
      sql:
        `(SELECT d."refId" AS rid, -ts_rank('${rankWeights}'::float4[], d."tsv", q."query") AS score ` +
        `FROM ${quoteIdent(DOC_TABLE)} d, to_tsquery(?::regconfig, ?) AS q("query") ` +
        `WHERE d."ref" = ? AND d."tsv" @@ q."query")`,
      params: [this.#configName, query, ref],
    };
  }

  // fts5's trigram tokenizer matches a term as a substring, and a term under three characters matches nothing: it is
  // dropped from a query that has a longer one, and the query matches no row without one.
  #trigramJoin(
    ref: string,
    text: string,
    columns: readonly SearchColumn[] | undefined,
    weights: readonly number[],
    caseSensitive: boolean,
  ): SqlFrag | null {
    const terms = text.split(/\s+/).filter((term) => [...term].length >= 3);
    if (!terms.length) return null;
    const scoped = columns?.length ? columns : searchColumns;
    const operator = caseSensitive ? "LIKE" : "ILIKE";
    const hit = (column: SearchColumn) => `d.${quoteIdent(column)} ${operator} ? ESCAPE '\\'`;
    const score = scoped
      .flatMap((column) => terms.map(() => `${weights[searchColumns.indexOf(column)]} * (${hit(column)})::int`))
      .join(" + ");
    const where = terms.map(() => `(${scoped.map(hit).join(" OR ")})`).join(" AND ");
    return {
      sql: `(SELECT d."refId" AS rid, -(${score}) AS score FROM ${quoteIdent(DOC_TABLE)} d WHERE d."ref" = ? AND ${where})`,
      params: [
        ...scoped.flatMap(() => terms.map(likePattern)),
        ref,
        ...terms.flatMap((term) => scoped.map(() => likePattern(term))),
      ],
    };
  }

  #vector() {
    const config = `'${SearchMirror.sqlString(this.#configName)}'::regconfig`;
    const spaces = " ".repeat(PostgresSearchEngine.#punctuation.length);
    const part = (column: SearchColumn) =>
      `setweight(to_tsvector(${config}, translate(left(${quoteIdent(column)}, ${PostgresSearchEngine.#indexedChars[column]}), '${SearchMirror.sqlString(PostgresSearchEngine.#punctuation)}', '${spaces}')), '${PostgresSearchEngine.#weightOf[column]}')`;
    // `||` starts the right vector one position after the left one ends, so a phrase would match across two columns.
    // A lexeme no query can hold — every ASCII punctuation mark is spaced out of a query — keeps a position between.
    return (["title", "tag", "filter", "desc"] as const).map(part).join(` || '''|'':1'::tsvector || `);
  }

  #purgeFunction() {
    return `CREATE OR REPLACE FUNCTION ${this.#schemaIdent}.${quoteIdent(PostgresSearchEngine.#purge)}() RETURNS trigger LANGUAGE plpgsql AS $akan$
BEGIN
  DELETE FROM ${this.#doc} WHERE "ref" = TG_ARGV[0] AND "refId" = OLD."id";
  RETURN NULL;
END
$akan$`;
  }

  async #extension(mode: PostgresSearchMode) {
    const name = mode.kind === "trigram" ? "pg_trgm" : mode.unaccent ? "unaccent" : null;
    if (!name) return null;
    const conn = this.#owner.getConnection();
    const schemaOf = async () =>
      (
        await conn
          .prepare(
            `SELECT n.nspname AS "schema" FROM pg_extension e JOIN pg_namespace n ON n.oid = e.extnamespace WHERE e.extname = ?`,
          )
          .get<{ schema: string }>(name)
      )?.schema ?? null;
    const found = await schemaOf();
    if (found) return found;
    try {
      await conn.execute(`CREATE EXTENSION IF NOT EXISTS ${name}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(
        `Text search with tokenizer "${this.#tokenizer}" needs the Postgres extension ${name}, which this role could not create: ${message}. Run CREATE EXTENSION ${name} as a role that may, or set AKAN_SEARCH_ENABLED=0 to run without text search.`,
      );
    }
    return await schemaOf();
  }

  async #warnOnAsciiOnlyCase() {
    const row = await this.#owner
      .getConnection()
      .prepare(`SELECT lower('É') = 'é' AS "folds"`)
      .get<{ folds: boolean }>();
    if (row?.folds) return;
    this.#logger.warn(
      "This database's LC_CTYPE folds ASCII case only, so Postgres text search keeps Unicode case and non-ASCII punctuation inside words where SQLite does not. Create the database with a UTF-8 LC_CTYPE such as en_US.UTF-8 or C.UTF-8.",
    );
  }

  async #indexExists(mode: PostgresSearchMode) {
    const index = mode.kind === "word" ? PostgresSearchEngine.#vectorIndex : PostgresSearchEngine.#trigramIndex;
    const row = await this.#owner
      .getConnection()
      .prepare(`SELECT to_regclass(?) IS NOT NULL AS "exists"`)
      .get<{ exists: boolean }>(this.#qualified(index));
    return !!row?.exists;
  }

  async #addMissingDocColumns() {
    const conn = this.#owner.getConnection();
    const rows = await conn
      .prepare(`SELECT column_name AS "name" FROM information_schema.columns WHERE table_schema = ? AND table_name = ?`)
      .all<{ name: string }>(this.#schema, DOC_TABLE);
    const existing = new Set(rows.map((row) => row.name));
    const missing = textFieldRoles.filter((role) => !existing.has(role));
    for (const role of missing)
      await conn.execute(`ALTER TABLE ${this.#doc} ADD COLUMN ${quoteIdent(role)} TEXT NOT NULL DEFAULT ''`);
    return missing;
  }

  async #hasTriggers(ref: string, triggers: ModelTriggers) {
    const [[upsert], ...rest] = triggers;
    const row = await this.#owner
      .getConnection()
      .prepare(
        `SELECT (SELECT count(*) FROM pg_trigger WHERE tgrelid = to_regclass(?) AND tgname = ANY(?::text[])) AS "count", to_regprocedure(?) IS NOT NULL AS "upsert"`,
      )
      .get<{ count: number; upsert: boolean }>(
        `${this.#schemaIdent}.${quoteIdent(ref)}`,
        rest.map(([name]) => name),
        `${upsert}()`,
      );
    return !!row?.upsert && row.count === rest.length;
  }

  #roleExpression(segments: MirrorSegment[], path: string, role: string, alias: "NEW" | "OLD") {
    const doc = `${alias}.${quoteIdent("_doc")}`;
    const wrap = (value: string) => (role === "filter" ? SearchMirror.filterToken(path, value) : value);
    if (segments.every((segment) => !segment.arrDepth)) {
      const textPath = `{${segments.map((segment) => segment.name).join(",")}}`;
      return `COALESCE(${wrap(`(${doc} #>> '${SearchMirror.sqlString(textPath)}')`)}, '')`;
    }
    // SQLite walks an array of objects with json_tree, which also matches the leaf key deeper down; the path here is
    // the declared one exactly.
    const jsonPath = `$${segments
      .map(({ name, arrDepth }) => `."${name.replace(/["\\]/g, (char) => `\\${char}`)}"${"[*]".repeat(arrDepth)}`)
      .join("")}`;
    return `COALESCE((SELECT string_agg(${wrap(`(v #>> '{}')`)}, ' ') FROM jsonb_path_query(${doc}, '${SearchMirror.sqlString(jsonPath)}') AS v), '')`;
  }
}
