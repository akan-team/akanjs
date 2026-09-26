import { Logger } from "akanjs/common";
import type { ConstantModel } from "akanjs/constant";
import type { DatabaseModel } from "akanjs/document";
import { Fts5SearchEngine } from "./sql/search/fts5";
import { SearchMirror } from "./sql/search/mirror";
import {
  DOC_TABLE,
  type SearchColumns,
  type SearchEngine,
  type SearchIndexOwner,
  type SearchQuery,
} from "./sql/search/types";
import { descriptorHash, quoteIdent } from "./sqlDescriptor";

export { Fts5SearchEngine } from "./sql/search/fts5";
export { PostgresSearchEngine } from "./sql/search/postgres";
export type { SearchEngine, SearchIndexOwner, SearchQuery } from "./sql/search/types";
export { DOC_TABLE, FTS_TABLE } from "./sql/search/types";
export const DEFAULT_TOKENIZER = "unicode61 remove_diacritics 2";

const SCHEMA_META_KEY = "search:schema";
const DISABLED_META_KEY = "search:disabled";
const REF_META_PREFIX = "search:ref:";
const LOCK_META_PREFIX = "search:lock:";
// A crashed process must not wedge a ref forever; a stale claim is reclaimed after this long. A backfill that runs
// longer than this renews its own claim, so the window only ever expires on a process that stopped working.
const LOCK_TTL_MS = 10 * 60 * 1000;
const BACKFILL_CHUNK = 5000;
const OPTIMIZE_LOCK_REF = "__optimize";
export const OPTIMIZE_CRON_KEY = "searchIndexOptimize";
// Off-peak and not on the hour, so it does not pile onto every other cron in the fleet.
export const OPTIMIZE_CRON = "17 4 * * *";
export const RETRY_INTERVAL_KEY = "searchIndexRetry";
// Comfortably inside `LOCK_TTL_MS`, so a ref another process was rebuilding comes back within a few minutes of
// that finishing rather than waiting for the next boot. A tick with nothing pending costs nothing.
export const RETRY_INTERVAL_MS = 60_000;
// Positional over `searchColumns`. `filter` is weighted 0 so a scoping token never outranks a real title hit — it is
// indexed to be matchable, not to be relevant.
export const DEFAULT_SEARCH_WEIGHTS = [10, 1, 3, 0];

export interface SearchIndexOptions {
  enabled: boolean;
  tokenizer: string;
}

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
 * Owns the `search_doc` mirror and the index an engine builds over it.
 *
 * The mirror is maintained by SQL triggers rather than document hooks because `updateOneByQuery` and friends
 * deliberately fire no hooks — most searchable-field mutations go through exactly that path, so an app-level
 * hook would miss them silently.
 */
export class SearchIndex {
  readonly #owner: SearchIndexOwner;
  readonly #engine: SearchEngine;
  readonly #enabled: boolean;
  readonly #logger = new Logger("SearchIndex");
  // The token this process last wrote for each held claim, so renew and release can match on it.
  readonly #claims = new Map<string, string>();
  // Refs whose rebuild another process was holding. A boot must not block on someone else's 10-minute claim, but
  // it must not forget the ref either: nothing else would ever come back to it.
  readonly #pending = new Map<string, [ConstantModel, DatabaseModel]>();

  constructor(
    owner: SearchIndexOwner,
    { enabled, tokenizer }: SearchIndexOptions,
    engine: SearchEngine = new Fts5SearchEngine(owner, tokenizer),
  ) {
    this.#owner = owner;
    this.#enabled = enabled;
    this.#engine = engine;
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
    const hash = await descriptorHash(this.#engine.schemaDescriptor());
    const ensure = async () => {
      if (await this.#owner.getMeta(DISABLED_META_KEY)) {
        await this.#clearRefHashes();
        await this.#owner.getConnection().execute(`DELETE FROM "_akan_meta" WHERE "key" = ?`, [DISABLED_META_KEY]);
        this.#logger.info("Search index re-enabled; every ref will be reconciled");
      }
      const current = (await this.#owner.getMeta(SCHEMA_META_KEY)) === hash;
      const added = await this.#engine.ensureSchema(current);
      if (added.length) {
        await this.#clearRefHashes();
        this.#logger.info(`Search mirror gained ${added.join(", ")}; every ref will be reconciled`);
      }
      if (!current) await this.#owner.setMeta(SCHEMA_META_KEY, hash);
    };
    // One turn reads the hash and writes it, so of a fleet booting at once only the first rebuilds, and no two processes
    // drop and create the index over each other. SQLite's write transaction is that turn across processes.
    const owner = this.#owner;
    if (owner.lockSchema) await owner.lockSchema(ensure);
    else if (owner.transaction) await owner.transaction(ensure);
    else await ensure();
  }

  /** Returns whether this ref's mirror is now current. `false` means another process is rebuilding it. */
  async ensureRef(constant: ConstantModel, database: DatabaseModel) {
    const ref = database.refName;
    const columns = this.#enabled ? this.#engine.columns(constant, database, "NEW") : null;
    if (!columns) {
      await this.#engine.dropModelTriggers(ref);
      return true;
    }
    const triggers = this.#engine.modelTriggers(ref, columns, this.#engine.columns(constant, database, "OLD"));
    // The hash covers the generated trigger SQL, not just the columns, so a framework upgrade that changes the
    // trigger template invalidates it on its own. Hashing the columns alone would leave old triggers in place.
    const hash = await descriptorHash(triggers);
    if ((await this.#owner.getMeta(`${REF_META_PREFIX}${ref}`)) === hash) {
      // Deliberately no replace here. Replacing a live trigger opens a window where another process's write misses
      // the mirror, and a matching hash means nothing would ever reconcile it back.
      await this.#engine.createModelTriggers(ref, triggers, false);
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
      await this.#engine.createModelTriggers(ref, triggers, true);
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
        `INSERT INTO ${quoteIdent(DOC_TABLE)}("ref", "refId", ${SearchMirror.docColumns})
         SELECT '${ref}', NEW."id", ${SearchMirror.columnList(columns)}
         FROM ${quoteIdent(ref)} AS NEW
         WHERE NEW."removedAt" IS NULL AND NEW."id" > ? AND NEW."id" <= ? ${this.#engine.backfillLock}
         ${SearchMirror.upsertTail}`,
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

  /** Merges accumulated index segments. Returns whether this process was the one that did the work. */
  async optimize() {
    if (!this.#enabled || !this.#engine.merges) return false;
    // The scheduler's lock is per-process, so without a shared claim every process on one database merges at once.
    if (!(await this.#claimLock(OPTIMIZE_LOCK_REF))) return false;
    try {
      await this.#engine.merge();
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
    await this.#engine.dropModelTriggers(database.refName);
  }

  /** Returns whether the mirror is current again; `false` means another process holds the rebuild. */
  async resume(constant: ConstantModel, database: DatabaseModel) {
    await this.#owner.setMeta(`${REF_META_PREFIX}${database.refName}`, "");
    return await this.ensureRef(constant, database);
  }

  /** The subquery `q.search()` joins; null when the text holds nothing to match, which matches no row. */
  join(query: SearchQuery) {
    return this.#engine.join(query);
  }

  async #clearRefHashes() {
    await this.#owner.getConnection().execute(`DELETE FROM "_akan_meta" WHERE "key" LIKE '${REF_META_PREFIX}%'`);
  }

  /**
   * One conditional upsert rather than read-then-write inside `transaction()`: that helper detects nesting through
   * AsyncLocalStorage, so a claim raised from an unrelated async context opens a second `BEGIN IMMEDIATE` on the
   * same connection and one of the two dies. A single statement is atomic in SQLite and in Postgres, which is all a
   * claim needs. The token is epoch milliseconds, past what a 32-bit integer holds.
   */
  async #claimLock(ref: string) {
    const now = Date.now();
    const token = String(now);
    const claimed = await this.#owner
      .getConnection()
      .prepare(
        `INSERT INTO "_akan_meta" ("key", "value", "updatedAt") VALUES (?, ?, ?)
         ON CONFLICT("key") DO UPDATE SET "value" = ?, "updatedAt" = ?
         WHERE CAST("_akan_meta"."value" AS BIGINT) < ?
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
}
