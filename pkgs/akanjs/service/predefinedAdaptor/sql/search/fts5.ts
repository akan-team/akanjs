import { type ConstantModel, textFieldRoles } from "akanjs/constant";
import { type DatabaseModel, type SearchColumn, searchColumns } from "akanjs/document";
import type { SqlFrag } from "../types";
import { descriptorHash, jsonPath, quoteIdent } from "../values";
import { type MirrorSegment, SearchMirror } from "./mirror";
import {
  DOC_TABLE,
  FTS_TABLE,
  type ModelTriggers,
  type SearchColumns,
  type SearchEngine,
  type SearchIndexOwner,
  type SearchQuery,
} from "./types";

const MIRROR_META_KEY = "search:mirror";
// fts5 appends a segment per write and never merges on its own; `merge` does bounded work per call, so it is safe on a
// timer, where `optimize` rewrites the whole index.
const MERGE_PAGES = 64;

/** The SQLite index: an fts5 table with `search_doc` as its external content. */
export class Fts5SearchEngine implements SearchEngine {
  readonly backfillLock = "";
  readonly merges = true;
  readonly #owner: SearchIndexOwner;
  readonly #tokenizer: string;

  constructor(owner: SearchIndexOwner, tokenizer: string) {
    this.#owner = owner;
    this.#tokenizer = tokenizer;
  }

  /** Quotes every term: a raw `-`, `:`, `*`, `"` or trailing `AND` is fts5 syntax that raises instead of matching. */
  static matchExpression(
    text: string,
    { prefix = false, columns }: { prefix?: boolean; columns?: readonly SearchColumn[] } = {},
  ) {
    const terms = text
      .split(/\s+/)
      .filter(Boolean)
      .map((term) => `"${term.replaceAll('"', '""')}"`);
    if (!terms.length) return null;
    if (prefix) terms[terms.length - 1] = `${terms[terms.length - 1]}*`;
    const expression = terms.join(" ");
    // A column filter binds tighter than the implicit AND; unparenthesised it would scope only the first term.
    return columns?.length ? `{${columns.join(" ")}} : (${expression})` : expression;
  }

  schemaDescriptor() {
    return { doc: textFieldRoles, columns: searchColumns, tokenizer: this.#tokenizer };
  }

  async ensureSchema(current: boolean) {
    const conn = this.#owner.getConnection();
    await conn.execute(
      `CREATE TABLE IF NOT EXISTS ${quoteIdent(DOC_TABLE)} (
        "fid" INTEGER PRIMARY KEY AUTOINCREMENT,
        "ref" TEXT NOT NULL,
        "refId" TEXT NOT NULL,
        ${textFieldRoles.map((role) => `${quoteIdent(role)} TEXT NOT NULL DEFAULT ''`).join(",\n        ")},
        UNIQUE("ref", "refId")
      )`,
    );
    // A matching hash is no proof the table exists: a boot that failed on the create keeps the previous hash.
    if (current && (await this.#ftsExists())) {
      await this.#ensureMirrorTriggers();
      return [];
    }
    const added = await this.#addMissingDocColumns();
    // A tokenizer swap only rebuilds from `search_doc`; a new column reconciles every ref. Mirror triggers drop first:
    // left up, a failed create makes every indexed write raise "no such table"; down, `rebuild` still recovers it all.
    await this.#dropMirrorTriggers();
    await conn.execute(`DROP TABLE IF EXISTS ${quoteIdent(FTS_TABLE)}`);
    try {
      await conn.execute(
        `CREATE VIRTUAL TABLE ${quoteIdent(FTS_TABLE)} USING fts5(
          ${searchColumns.map(quoteIdent).join(", ")},
          content='${DOC_TABLE}', content_rowid='fid', tokenize='${SearchMirror.sqlString(this.#tokenizer)}')`,
      );
    } catch (error) {
      // An unknown tokenizer or a SQLite without fts5 stays fatal: `q.search()` would otherwise raise per request.
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(
        `Failed to create the search index with tokenizer "${this.#tokenizer}": ${message}. Fix AKAN_SEARCH_TOKENIZER, or set AKAN_SEARCH_ENABLED=0 to run without text search.`,
      );
    }
    await this.#ensureMirrorTriggers({ resync: false });
    await conn.execute(`INSERT INTO ${quoteIdent(FTS_TABLE)}(${quoteIdent(FTS_TABLE)}) VALUES('rebuild')`);
    return added;
  }

  columns(constant: ConstantModel, database: DatabaseModel, alias: "NEW" | "OLD") {
    return SearchMirror.columns(constant, database, (segments, path, role) =>
      this.#roleExpression(segments, path, role, alias),
    );
  }

  modelTriggers(ref: string, next: SearchColumns, prev: SearchColumns | null): ModelTriggers {
    const table = quoteIdent(ref);
    const doc = quoteIdent(DOC_TABLE);
    const upsert = `INSERT INTO ${doc}("ref", "refId", ${SearchMirror.docColumns})
      VALUES ('${ref}', NEW."id", ${SearchMirror.columnList(next)}) ${SearchMirror.upsertTail}`;
    const purge = `DELETE FROM ${doc} WHERE "ref" = '${ref}' AND "refId" = %ID%`;
    // Every write rewrites `_doc`, so only a changed indexed value re-indexes — or a revived row (`OLD."removedAt"`).
    const changed = prev ? textFieldRoles.map((role) => `${next[role]} IS NOT ${prev[role]}`).join(" OR ") : "1 = 1";
    const triggers: ModelTriggers = [
      [`${ref}_search_ai`, `AFTER INSERT ON ${table} WHEN NEW."removedAt" IS NULL BEGIN ${upsert}; END`],
      [
        `${ref}_search_au`,
        `AFTER UPDATE ON ${table} WHEN NEW."removedAt" IS NULL AND (OLD."removedAt" IS NOT NULL OR (${changed}))
         BEGIN ${upsert}; END`,
      ],
      [
        `${ref}_search_soft`,
        `AFTER UPDATE ON ${table} WHEN NEW."removedAt" IS NOT NULL AND OLD."removedAt" IS NULL
         BEGIN ${purge.replace("%ID%", 'NEW."id"')}; END`,
      ],
      [`${ref}_search_ad`, `AFTER DELETE ON ${table} BEGIN ${purge.replace("%ID%", 'OLD."id"')}; END`],
    ];
    return triggers;
  }

  async createModelTriggers(ref: string, triggers: ModelTriggers, replace: boolean) {
    if (replace) await this.dropModelTriggers(ref);
    await this.#createTriggers(triggers);
  }

  async dropModelTriggers(ref: string) {
    const conn = this.#owner.getConnection();
    for (const suffix of ["ai", "au", "soft", "ad"]) {
      await conn.execute(`DROP TRIGGER IF EXISTS ${quoteIdent(`${ref}_search_${suffix}`)}`);
    }
  }

  async merge() {
    await this.#owner
      .getConnection()
      .execute(`INSERT INTO ${quoteIdent(FTS_TABLE)}(${quoteIdent(FTS_TABLE)}, rank) VALUES('merge', ?)`, [
        MERGE_PAGES,
      ]);
  }

  join({ ref, text, prefix, columns, weights }: SearchQuery): SqlFrag | null {
    const match = Fts5SearchEngine.matchExpression(text, { prefix, columns });
    if (!match) return null;
    // bm25 takes no bind parameters, so the weights are interpolated; the compiler has proven them numeric.
    return {
      sql:
        `(SELECT d."refId" AS rid, bm25(${FTS_TABLE}, ${weights.join(", ")}) AS score ` +
        `FROM ${FTS_TABLE} JOIN ${DOC_TABLE} d ON d."fid" = ${FTS_TABLE}."rowid" ` +
        `WHERE ${FTS_TABLE} MATCH ? AND d."ref" = ?)`,
      params: [match, ref],
    };
  }

  /** Without it a release adding a role fails every boot on `rebuild`; a dropped role's column stays, empty. */
  async #addMissingDocColumns() {
    const conn = this.#owner.getConnection();
    const existing = new Set(
      (await conn.prepare(`PRAGMA table_info(${quoteIdent(DOC_TABLE)})`).all<{ name: string }>()).map(
        (column) => column.name,
      ),
    );
    const missing = textFieldRoles.filter((role) => !existing.has(role));
    for (const role of missing) {
      await conn.execute(
        `ALTER TABLE ${quoteIdent(DOC_TABLE)} ADD COLUMN ${quoteIdent(role)} TEXT NOT NULL DEFAULT ''`,
      );
    }
    return missing;
  }

  #mirrorTriggers(): ModelTriggers {
    const cols = searchColumns.map(quoteIdent).join(", ");
    const fts = quoteIdent(FTS_TABLE);
    const doc = quoteIdent(DOC_TABLE);
    const values = (alias: "new" | "old") => searchColumns.map((col) => `${alias}.${quoteIdent(col)}`).join(", ");
    const remove = `INSERT INTO ${fts}(${fts}, rowid, ${cols}) VALUES('delete', old."fid", ${values("old")})`;
    const insert = `INSERT INTO ${fts}(rowid, ${cols}) VALUES(new."fid", ${values("new")})`;
    return [
      [`${DOC_TABLE}_ai`, `AFTER INSERT ON ${doc} BEGIN ${insert}; END`],
      [`${DOC_TABLE}_ad`, `AFTER DELETE ON ${doc} BEGIN ${remove}; END`],
      [`${DOC_TABLE}_au`, `AFTER UPDATE ON ${doc} BEGIN ${remove}; ${insert}; END`],
    ];
  }

  /**
   * Replaced only when changed: a write while `search_doc_au` is missing leaves ghost hits `integrity-check` passes.
   * Replacing resyncs the index, unless the caller is about to rebuild it.
   */
  async #ensureMirrorTriggers({ resync = true } = {}) {
    const conn = this.#owner.getConnection();
    const triggers = this.#mirrorTriggers();
    const hash = await descriptorHash(triggers);
    if ((await this.#owner.getMeta(MIRROR_META_KEY)) === hash) {
      await this.#createTriggers(triggers);
      return;
    }
    await this.#dropMirrorTriggers();
    await this.#createTriggers(triggers);
    if (resync) await conn.execute(`INSERT INTO ${quoteIdent(FTS_TABLE)}(${quoteIdent(FTS_TABLE)}) VALUES('rebuild')`);
    await this.#owner.setMeta(MIRROR_META_KEY, hash);
  }

  async #dropMirrorTriggers() {
    const conn = this.#owner.getConnection();
    for (const [name] of this.#mirrorTriggers()) await conn.execute(`DROP TRIGGER IF EXISTS ${quoteIdent(name)}`);
  }

  async #ftsExists() {
    const table = await this.#owner
      .getConnection()
      .prepare(`SELECT "name" FROM "sqlite_master" WHERE "type" = 'table' AND "name" = ?`)
      .get<{ name: string }>(FTS_TABLE);
    return !!table;
  }

  async #createTriggers(triggers: ModelTriggers) {
    const conn = this.#owner.getConnection();
    for (const [name, sql] of triggers) {
      // Two stores' `ensure()` overlap on boot, and a bare create would abort on "trigger already exists".
      await conn.execute(`CREATE TRIGGER IF NOT EXISTS ${quoteIdent(name)} ${sql}`);
    }
  }

  #roleExpression(segments: MirrorSegment[], path: string, role: string, alias: "NEW" | "OLD") {
    const doc = `${alias}.${quoteIdent("_doc")}`;
    const arrayAt = segments.findIndex((segment) => segment.arrDepth > 0);
    // `filter` stores slugified `key_value` pairs: unicode61 splits on punctuation, which would break the pair.
    const wrap = (value: string) => (role === "filter" ? SearchMirror.filterToken(path, value) : value);
    const rows = (column: string, from: string, where = "") =>
      `COALESCE((SELECT group_concat(${wrap(column)}, ' ') FROM ${from}${where}), '')`;
    if (arrayAt < 0)
      return `COALESCE(${wrap(`json_extract(${doc}, '${SearchMirror.sqlString(jsonPath(path))}')`)}, '')`;
    const arrayPath = segments
      .slice(0, arrayAt + 1)
      .map((segment) => segment.name)
      .join(".");
    const array = `'${SearchMirror.sqlString(jsonPath(arrayPath))}'`;
    if (arrayAt === segments.length - 1) return rows("value", `json_each(${doc}, ${array})`);
    const leaf = SearchMirror.sqlString(segments[segments.length - 1].name);
    const tree = `json_tree(${doc}, ${array})`;
    // json_tree walks the subtree, so the leaf key selects `works[*].name`; an array leaf (`works[*].tags`) has no atom
    // of its own and is reached by parent link, or it would index as empty.
    return rows(
      `t."atom"`,
      `${tree} AS t`,
      ` WHERE t."atom" IS NOT NULL AND (t."key" = '${leaf}'
         OR t."parent" IN (SELECT p."id" FROM ${tree} AS p WHERE p."key" = '${leaf}'))`,
    );
  }
}
