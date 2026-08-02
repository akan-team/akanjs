import { FIELD_META } from "akanjs/base";
import { Logger } from "akanjs/common";
import { type ConstantField, type ConstantModel, type FieldObject, textFieldRoles } from "akanjs/constant";
import { type DatabaseModel, type SearchColumn, searchColumns } from "akanjs/document";
import type { AkanSqlClient } from "./database.adaptor";
import { descriptorHash, jsonPath, quoteIdent } from "./sqlDescriptor";

export const DOC_TABLE = "search_doc";
export const FTS_TABLE = "search_fts";
export const DEFAULT_TOKENIZER = "unicode61 remove_diacritics 2";

const SCHEMA_META_KEY = "search:schema";
const MIRROR_META_KEY = "search:mirror";
const DISABLED_META_KEY = "search:disabled";
const REF_META_PREFIX = "search:ref:";
const LOCK_META_PREFIX = "search:lock:";
// A crashed process must not wedge a ref forever; a stale claim is reclaimed after this long. A backfill that runs
// longer than this renews its own claim, so the window only ever expires on a process that stopped working.
const LOCK_TTL_MS = 10 * 60 * 1000;
const BACKFILL_CHUNK = 5000;
// fts5 appends a segment on every write and never merges them on its own, so a write-heavy table's search keeps
// getting slower with nothing to stop it. `merge` does a bounded amount of work per call, which is what makes it
// safe on a timer — `optimize` rewrites the whole index and would stall a large database.
const MERGE_PAGES = 64;
const OPTIMIZE_LOCK_REF = "__optimize";
export const OPTIMIZE_CRON_KEY = "searchIndexOptimize";
// Off-peak and not on the hour, so it does not pile onto every other cron in the fleet.
export const OPTIMIZE_CRON = "17 4 * * *";
export const RETRY_INTERVAL_KEY = "searchIndexRetry";
// Comfortably inside `LOCK_TTL_MS`, so a ref another process was rebuilding comes back within a few minutes of
// that finishing rather than waiting for the next boot. A tick with nothing pending costs nothing.
export const RETRY_INTERVAL_MS = 60_000;
// bm25 weights, positional over `searchColumns`. `filter` is weighted 0 so a scoping token never outranks a real
// title hit — it is indexed to be matchable, not to be relevant.
export const DEFAULT_SEARCH_WEIGHTS = [10, 1, 3, 0];

export interface SearchIndexOwner {
  getConnection(): AkanSqlClient;
  getMeta(key: string): Promise<string | undefined> | string | undefined;
  setMeta(key: string, value: string): Promise<void>;
}

export interface SearchIndexOptions {
  enabled: boolean;
  tokenizer: string;
}

type SearchColumns = Record<(typeof textFieldRoles)[number], string>;

/**
 * Reads `AKAN_SEARCH_ENABLED`. Unset means enabled; an unrecognised value fails the boot rather than
 * silently falling back, because a typo like `ture` would otherwise look identical to the default.
 */
export const parseSearchEnabled = (value: string | undefined) => {
  if (value === undefined || value.trim() === "") return true;
  const normalized = value.trim().toLowerCase();
  if (normalized === "1" || normalized === "true") return true;
  if (normalized === "0" || normalized === "false") return false;
  throw new Error(`Invalid AKAN_SEARCH_ENABLED value: "${value}". Use 1/true or 0/false.`);
};

/**
 * Turns raw user input into an fts5 MATCH expression.
 *
 * Raw text cannot be passed through: `-`, `:`, `*`, `"` and a trailing `AND` are all fts5 syntax and each
 * raises `SQLiteError` instead of returning no rows. Quoting every term makes the whole input literal.
 */
export const toMatchExpression = (
  text: string,
  { prefix = false, columns }: { prefix?: boolean; columns?: readonly SearchColumn[] } = {},
) => {
  const terms = text
    .split(/\s+/)
    .filter(Boolean)
    .map((term) => `"${term.replaceAll('"', '""')}"`);
  if (!terms.length) return null;
  if (prefix) terms[terms.length - 1] = `${terms[terms.length - 1]}*`;
  const expression = terms.join(" ");
  // A column filter binds tighter than the implicit AND between terms, so an unparenthesised list would scope
  // only the first term and search every column for the rest.
  return columns?.length ? `{${columns.join(" ")}} : (${expression})` : expression;
};

/**
 * Owns the `search_doc` mirror and its fts5 index.
 *
 * The mirror is maintained by SQL triggers rather than document hooks because `updateOneByQuery` and friends
 * deliberately fire no hooks — most searchable-field mutations go through exactly that path, so an app-level
 * hook would miss them silently.
 */
export class SearchIndex {
  static readonly #docColumns = textFieldRoles.map(quoteIdent).join(", ");
  static readonly #upsertTail = `ON CONFLICT("ref", "refId") DO UPDATE SET ${textFieldRoles
    .map((role) => `${quoteIdent(role)} = excluded.${quoteIdent(role)}`)
    .join(", ")}`;
  // unicode61 breaks a token on every non-alphanumeric character, so a `key_value` pair carrying an email, a path
  // or a dotted id would split into fragments and stop matching as a pair. Only these are folded: the set covers
  // what ids and enum values actually contain, and each one costs another nested `replace`.
  static readonly #slugSeparators = [" ", "-", ".", "/", ":", "@", ",", "+", "#", "(", ")", "'"];

  static #sqlString(value: string) {
    return value.replaceAll("'", "''");
  }

  static #slug(value: string) {
    return SearchIndex.#slugSeparators.reduce(
      (expression, separator) => `replace(${expression}, '${SearchIndex.#sqlString(separator)}', '_')`,
      `lower(COALESCE(${value}, ''))`,
    );
  }

  // `NULLIF` drops the pair when the value is empty, so an unset field contributes no bare `key_` token.
  static #filterToken(path: string, value: string) {
    const key = SearchIndex.#sqlString(path.split(".").join("_"));
    return `NULLIF('${key}_' || ${SearchIndex.#slug(value)}, '${key}_')`;
  }

  readonly #owner: SearchIndexOwner;
  readonly #enabled: boolean;
  readonly #tokenizer: string;
  readonly #logger = new Logger("SearchIndex");
  // The token this process last wrote for each held claim, so renew and release can match on it.
  readonly #claims = new Map<string, string>();
  // Refs whose rebuild another process was holding. A boot must not block on someone else's 10-minute claim, but
  // it must not forget the ref either: nothing else would ever come back to it.
  readonly #pending = new Map<string, [ConstantModel, DatabaseModel]>();

  constructor(owner: SearchIndexOwner, { enabled, tokenizer }: SearchIndexOptions) {
    this.#owner = owner;
    this.#enabled = enabled;
    this.#tokenizer = tokenizer;
  }

  get enabled() {
    return this.#enabled;
  }

  async ensureSchema() {
    if (!this.#enabled) {
      // The marker makes re-enabling rebuild every ref: writes made while search was off never reached the mirror.
      await this.#owner.setMeta(DISABLED_META_KEY, "1");
      this.#logger.info("Search index disabled by AKAN_SEARCH_ENABLED; model triggers will be dropped");
      return;
    }
    const conn = this.#owner.getConnection();
    if (await this.#owner.getMeta(DISABLED_META_KEY)) {
      await this.#clearRefHashes();
      await conn.execute(`DELETE FROM "_akan_meta" WHERE "key" = ?`, [DISABLED_META_KEY]);
      this.#logger.info("Search index re-enabled; every ref will be reconciled");
    }
    await conn.execute(
      `CREATE TABLE IF NOT EXISTS ${quoteIdent(DOC_TABLE)} (
        "fid" INTEGER PRIMARY KEY AUTOINCREMENT,
        "ref" TEXT NOT NULL,
        "refId" TEXT NOT NULL,
        ${textFieldRoles.map((role) => `${quoteIdent(role)} TEXT NOT NULL DEFAULT ''`).join(",\n        ")},
        UNIQUE("ref", "refId")
      )`,
    );
    const hash = await descriptorHash({ doc: textFieldRoles, columns: searchColumns, tokenizer: this.#tokenizer });
    // A matching hash is not proof the table is there. Nothing writes the hash until the create below succeeds, so
    // a boot that failed on the create leaves the previous hash naming a table that no longer exists; taking the
    // fast path then recreates the mirror triggers over the hole and every write on this database fails again.
    if ((await this.#ftsExists()) && (await this.#owner.getMeta(SCHEMA_META_KEY)) === hash) {
      await this.#ensureMirrorTriggers();
      return;
    }
    const added = await this.#addMissingDocColumns();
    // Swapping the tokenizer only rebuilds the index from `search_doc`; the mirror itself is never re-read from
    // the model tables. A new column is different — nothing ever wrote it — so that case reconciles every ref.
    //
    // Every process on this database rebuilds, not just the first: the hash lands after the work, so a fleet
    // restarted at once has each process read the old value and repeat the pass. SQLite serialises them.
    //
    // The mirror triggers come down before the table they write to. Left up, they turn a failed create into a
    // database where every write to an indexed model raises "no such table" — for every process on it, not just
    // this one. Down, a write only misses the index, and the model triggers keep filling `search_doc`, so the
    // `rebuild` below still recovers it in full.
    await this.#dropMirrorTriggers();
    await conn.execute(`DROP TABLE IF EXISTS ${quoteIdent(FTS_TABLE)}`);
    try {
      await conn.execute(
        `CREATE VIRTUAL TABLE ${quoteIdent(FTS_TABLE)} USING fts5(
          ${searchColumns.map(quoteIdent).join(", ")},
          content='${DOC_TABLE}', content_rowid='fid', tokenize='${SearchIndex.#sqlString(this.#tokenizer)}')`,
      );
    } catch (error) {
      // The two ways this fails are a tokenizer this build does not have and a SQLite without fts5. Both stay
      // fatal on purpose: carrying on would leave `q.search()` raising on every request instead of once at boot,
      // and turning the feature off is a decision for the operator to make explicitly.
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(
        `Failed to create the search index with tokenizer "${this.#tokenizer}": ${message}. Fix AKAN_SEARCH_TOKENIZER, or set AKAN_SEARCH_ENABLED=0 to run without text search.`,
      );
    }
    await this.#ensureMirrorTriggers({ resync: false });
    if (added.length) {
      await this.#clearRefHashes();
      this.#logger.info(`Search mirror gained ${added.join(", ")}; every ref will be reconciled`);
    }
    await conn.execute(`INSERT INTO ${quoteIdent(FTS_TABLE)}(${quoteIdent(FTS_TABLE)}) VALUES('rebuild')`);
    await this.#owner.setMeta(SCHEMA_META_KEY, hash);
  }

  /** Returns whether this ref's mirror is now current. `false` means another process is rebuilding it. */
  async ensureRef(constant: ConstantModel, database: DatabaseModel) {
    const ref = database.refName;
    const columns = this.#enabled ? this.#buildColumns(constant, database, "NEW") : null;
    if (!columns) {
      await this.#dropModelTriggers(ref);
      return true;
    }
    const triggers = this.#modelTriggers(ref, columns, this.#buildColumns(constant, database, "OLD"));
    // The hash covers the generated trigger SQL, not just the columns, so a framework upgrade that changes the
    // trigger template invalidates it on its own. Hashing the columns alone would leave old triggers in place.
    const hash = await descriptorHash(triggers);
    if ((await this.#owner.getMeta(`${REF_META_PREFIX}${ref}`)) === hash) {
      // Deliberately no drop here. Replacing a live trigger opens a window where another process's write misses
      // the mirror, and a matching hash means nothing would ever reconcile it back.
      await this.#createTriggers(triggers);
      this.#pending.delete(ref);
      return true;
    }
    if (!(await this.#claimLock(ref))) {
      // Whoever holds the claim rebuilds the whole table, so leaving the existing triggers alone is safer than
      // replacing them here. `retryPending` picks this up once the claim clears.
      this.#pending.set(ref, [constant, database]);
      this.#logger.warn(`Search index for ${ref} is held by another process; will retry`);
      return false;
    }
    try {
      // Safe to replace them now: the backfill below re-reads the model table, so a write that slips through the
      // window is picked up anyway.
      await this.#dropModelTriggers(ref);
      await this.#createTriggers(triggers);
      const reconciled = await this.reconcileRef(ref, columns, () => this.#renewLock(ref));
      // Only a completed pass may write the hash. A half-written mirror that claims to be current would stay
      // wrong until the descriptor changes again.
      if (reconciled) await this.#owner.setMeta(`${REF_META_PREFIX}${ref}`, hash);
      if (reconciled) this.#pending.delete(ref);
      else this.#pending.set(ref, [constant, database]);
      return reconciled;
    } finally {
      await this.#releaseLock(ref);
    }
  }

  /** Re-runs the refs another process was holding. Returns how many are still outstanding. */
  async retryPending() {
    for (const [ref, [constant, database]] of [...this.#pending]) {
      if (await this.ensureRef(constant, database)) this.#logger.info(`Search index for ${ref} is current again`);
    }
    return this.#pending.size;
  }

  /**
   * Rebuilds one ref's mirror rows in id-ordered chunks so a large table does not block the boot. `onChunk` runs
   * between chunks and reports whether this process still holds the claim: a backfill that outlives the lock TTL
   * would otherwise keep writing rows underneath the `DELETE` of the process that took over. Returns whether the
   * whole table was covered.
   */
  async reconcileRef(ref: string, columns: SearchColumns, onChunk?: () => Promise<boolean>) {
    const conn = this.#owner.getConnection();
    await conn.execute(`DELETE FROM ${quoteIdent(DOC_TABLE)} WHERE "ref" = ?`, [ref]);
    let cursor = "";
    for (;;) {
      const rows = await conn
        .prepare(
          `SELECT "id" FROM ${quoteIdent(ref)} WHERE "removedAt" IS NULL AND "id" > ? ORDER BY "id" LIMIT ${BACKFILL_CHUNK}`,
        )
        .all<{ id: string }>(cursor);
      const last = rows.at(-1)?.id;
      if (!last) return true;
      await conn.execute(
        `INSERT INTO ${quoteIdent(DOC_TABLE)}("ref", "refId", ${SearchIndex.#docColumns})
         SELECT '${ref}', NEW."id", ${this.#columnList(columns)}
         FROM ${quoteIdent(ref)} AS NEW
         WHERE NEW."removedAt" IS NULL AND NEW."id" > ? AND NEW."id" <= ?
         ${SearchIndex.#upsertTail}`,
        [cursor, last],
      );
      if (rows.length < BACKFILL_CHUNK) return true;
      cursor = last;
      if (onChunk && !(await onChunk())) {
        this.#logger.warn(`Search backfill for ${ref} stopped: another process took the claim over`);
        return false;
      }
    }
  }

  /** Merges accumulated fts5 segments. Returns whether this process was the one that did the work. */
  async optimize() {
    if (!this.#enabled) return false;
    // The scheduler's lock is per-process, so without a shared claim every process on one database merges at once.
    if (!(await this.#claimLock(OPTIMIZE_LOCK_REF))) return false;
    try {
      await this.#owner
        .getConnection()
        .execute(`INSERT INTO ${quoteIdent(FTS_TABLE)}(${quoteIdent(FTS_TABLE)}, rank) VALUES('merge', ?)`, [
          MERGE_PAGES,
        ]);
      return true;
    } catch (error) {
      // Maintenance only: losing a run costs nothing, and throwing would kill the cron for the process lifetime.
      this.#logger.warn(`Search index merge failed: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    } finally {
      await this.#releaseLock(OPTIMIZE_LOCK_REF);
    }
  }

  /**
   * Drops a ref's triggers so a bulk import skips the per-row mirror write. Pair with `resume`.
   *
   * The hash is cleared here rather than in `resume` alone: a process that dies mid-import never reaches `resume`,
   * and a boot that finds the hash intact recreates the triggers and skips the backfill, leaving everything
   * written in between missing from the mirror for good.
   */
  async suspend(database: DatabaseModel) {
    await this.#owner.setMeta(`${REF_META_PREFIX}${database.refName}`, "");
    await this.#dropModelTriggers(database.refName);
  }

  /** Returns whether the mirror is current again; `false` means another process holds the rebuild. */
  async resume(constant: ConstantModel, database: DatabaseModel) {
    await this.#owner.setMeta(`${REF_META_PREFIX}${database.refName}`, "");
    return await this.ensureRef(constant, database);
  }

  #columnList(columns: SearchColumns) {
    return textFieldRoles.map((role) => columns[role]).join(", ");
  }

  async #clearRefHashes() {
    await this.#owner.getConnection().execute(`DELETE FROM "_akan_meta" WHERE "key" LIKE '${REF_META_PREFIX}%'`);
  }

  /**
   * Widens an existing mirror to a column this build knows about but the database predates. Without it a release
   * that adds a role fails every boot on `rebuild`, which is the migration step the descriptor hash exists to
   * avoid. A column dropped from a later build is left in place; it defaults to empty and costs nothing.
   */
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

  #mirrorTriggers(): [string, string][] {
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
   * Only replaces these when their definition actually changed. A mirror row written while `search_doc_au` is
   * missing leaves fts5 holding the previous text: the current value stops matching, the old one returns a ghost
   * hit, and `integrity-check` still passes — so the damage is both silent and invisible to the usual check.
   * The replacing path resyncs the index afterwards, unless the caller is about to rebuild it anyway.
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

  async #createTriggers(triggers: [string, string][]) {
    const conn = this.#owner.getConnection();
    for (const [name, sql] of triggers) {
      // `IF NOT EXISTS` rather than a bare create: every store calls `ensure()` on its own, so two runs for one
      // ref overlap on boot and the second would otherwise abort the whole `ensure` on "trigger already exists".
      await conn.execute(`CREATE TRIGGER IF NOT EXISTS ${quoteIdent(name)} ${sql}`);
    }
  }

  async #dropModelTriggers(ref: string) {
    const conn = this.#owner.getConnection();
    for (const suffix of ["ai", "au", "soft", "ad"]) {
      await conn.execute(`DROP TRIGGER IF EXISTS ${quoteIdent(`${ref}_search_${suffix}`)}`);
    }
  }

  #modelTriggers(ref: string, next: SearchColumns, prev: SearchColumns | null): [string, string][] {
    const table = quoteIdent(ref);
    const doc = quoteIdent(DOC_TABLE);
    const upsert = `INSERT INTO ${doc}("ref", "refId", ${SearchIndex.#docColumns})
      VALUES ('${ref}', NEW."id", ${this.#columnList(next)}) ${SearchIndex.#upsertTail}`;
    const purge = `DELETE FROM ${doc} WHERE "ref" = '${ref}' AND "refId" = %ID%`;
    // Every write rewrites `_doc`, so an unconditional AFTER UPDATE would re-index on an `updatedAt` bump alone.
    // A revived row (`OLD."removedAt"` set) must re-index even when no indexed value changed.
    const changed = prev ? textFieldRoles.map((role) => `${next[role]} IS NOT ${prev[role]}`).join(" OR ") : "1 = 1";
    const triggers: [string, string][] = [
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

  /**
   * One conditional upsert rather than read-then-write inside `transaction()`: that helper detects nesting through
   * AsyncLocalStorage, so a claim raised from an unrelated async context opens a second `BEGIN IMMEDIATE` on the
   * same connection and one of the two dies. A single statement is atomic in SQLite, which is all a claim needs.
   */
  async #claimLock(ref: string) {
    const now = Date.now();
    const token = String(now);
    const claimed = await this.#owner
      .getConnection()
      .prepare(
        `INSERT INTO "_akan_meta" ("key", "value", "updatedAt") VALUES (?, ?, ?)
         ON CONFLICT("key") DO UPDATE SET "value" = ?, "updatedAt" = ?
         WHERE CAST("_akan_meta"."value" AS INTEGER) < ?
         RETURNING "value"`,
      )
      .get<{ value: string }>(`${LOCK_META_PREFIX}${ref}`, token, now, token, now, now - LOCK_TTL_MS);
    if (!claimed) return false;
    this.#claims.set(ref, token);
    return true;
  }

  /**
   * Extends this process's claim, and reports `false` once someone else holds it. Renew and release both match on
   * the stored token: an unconditional write would let a process that stalled past the TTL take the claim back
   * from whoever legitimately replaced it, and then both would reconcile the same ref over each other.
   */
  async #renewLock(ref: string) {
    const held = this.#claims.get(ref);
    if (!held) return false;
    const now = Date.now();
    const token = String(now);
    const renewed = await this.#owner
      .getConnection()
      .prepare(`UPDATE "_akan_meta" SET "value" = ?, "updatedAt" = ? WHERE "key" = ? AND "value" = ? RETURNING "value"`)
      .get<{ value: string }>(token, now, `${LOCK_META_PREFIX}${ref}`, held);
    if (!renewed) {
      this.#claims.delete(ref);
      return false;
    }
    this.#claims.set(ref, token);
    return true;
  }

  async #releaseLock(ref: string) {
    const held = this.#claims.get(ref);
    if (!held) return;
    this.#claims.delete(ref);
    await this.#owner
      .getConnection()
      .execute(`DELETE FROM "_akan_meta" WHERE "key" = ? AND "value" = ?`, [`${LOCK_META_PREFIX}${ref}`, held]);
  }

  #buildColumns(constant: ConstantModel, database: DatabaseModel, alias: "NEW" | "OLD"): SearchColumns | null {
    const paths = constant.full.text;
    const fields = database.doc[FIELD_META] as unknown as FieldObject;
    if (!paths || !fields) return null;
    const columns = {} as SearchColumns;
    let declared = false;
    for (const role of textFieldRoles) {
      const rolePaths = [...paths[role], ...paths.children[role]];
      const parts = rolePaths
        .map((path) => this.#roleExpression(fields, path, role, alias))
        .filter((part): part is string => !!part);
      if (parts.length) declared = true;
      columns[role] = parts.length ? `TRIM(${parts.join(` || ' ' || `)})` : `''`;
    }
    return declared ? columns : null;
  }

  #roleExpression(fields: FieldObject, path: string, role: string, alias: "NEW" | "OLD") {
    const doc = `${alias}.${quoteIdent("_doc")}`;
    const segments = path.split(".");
    let current: FieldObject | undefined = fields;
    let arrayAt = -1;
    for (const [idx, segment] of segments.entries()) {
      const field: ConstantField | undefined = current?.[segment];
      if (!field) return null;
      if (field.arrDepth > 0 && arrayAt < 0) arrayAt = idx;
      current = field.modelRef[FIELD_META] as unknown as FieldObject | undefined;
    }
    // `filter` stores `key_value` pairs so a search can be scoped to one owner; the value is slugified because
    // unicode61 treats punctuation as a separator, which would split the pair into two useless tokens.
    const wrap = (value: string) => (role === "filter" ? SearchIndex.#filterToken(path, value) : value);
    const rows = (column: string, from: string, where = "") =>
      `COALESCE((SELECT group_concat(${wrap(column)}, ' ') FROM ${from}${where}), '')`;
    if (arrayAt < 0)
      return `COALESCE(${wrap(`json_extract(${doc}, '${SearchIndex.#sqlString(jsonPath(path))}')`)}, '')`;
    const array = `'${SearchIndex.#sqlString(jsonPath(segments.slice(0, arrayAt + 1).join(".")))}'`;
    if (arrayAt === segments.length - 1) return rows("value", `json_each(${doc}, ${array})`);
    const leaf = SearchIndex.#sqlString(segments[segments.length - 1]);
    const tree = `json_tree(${doc}, ${array})`;
    // An object inside an array (`works[*].name`): json_tree walks the whole subtree, so the leaf key selects it.
    // An array leaf (`works[*].tags`) holds no atom of its own — its values hang off it under numeric keys, so
    // they are reached by parent link instead. Without that second branch such a field indexes as empty, silently.
    return rows(
      `t."atom"`,
      `${tree} AS t`,
      ` WHERE t."atom" IS NOT NULL AND (t."key" = '${leaf}'
         OR t."parent" IN (SELECT p."id" FROM ${tree} AS p WHERE p."key" = '${leaf}'))`,
    );
  }
}
