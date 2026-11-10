import { Logger } from "akanjs/common";
import type { ConstantModel } from "akanjs/constant";
import { Err } from "akanjs/dictionary";
import type { DatabaseModel } from "akanjs/document";
import { DocumentStoreError } from "../documentStoreError";
import { Fts5SearchEngine } from "./sql/search/fts5";
import { SearchMirror } from "./sql/search/mirror";
import {
  DOC_TABLE,
  type SearchColumns,
  type SearchEngine,
  type SearchIndexOwner,
  type SearchQuery,
} from "./sql/search/types";
import { descriptorHash, quoteIdent } from "./sql/values";

export { Fts5SearchEngine } from "./sql/search/fts5";
export { PostgresSearchEngine } from "./sql/search/postgres";
export type { SearchEngine, SearchIndexOwner, SearchQuery } from "./sql/search/types";
export { DOC_TABLE, FTS_TABLE } from "./sql/search/types";
export const DEFAULT_TOKENIZER = "unicode61 remove_diacritics 2";

const SCHEMA_META_KEY = "search:schema";
const DISABLED_META_KEY = "search:disabled";
const REF_META_PREFIX = "search:ref:";
const LOCK_META_PREFIX = "search:lock:";
// A crashed process's claim is reclaimed after this; a live backfill renews its own.
const LOCK_TTL_MS = 10 * 60 * 1000;
const BACKFILL_CHUNK = 5000;
const OPTIMIZE_LOCK_REF = "__optimize";
export const OPTIMIZE_CRON_KEY = "searchIndexOptimize";
// Off-peak and not on the hour, so it does not pile onto every other cron in the fleet.
export const OPTIMIZE_CRON = "17 4 * * *";
export const RETRY_INTERVAL_KEY = "searchIndexRetry";
// Inside `LOCK_TTL_MS`, so a ref another process rebuilt returns within minutes, not at the next boot.
export const RETRY_INTERVAL_MS = 60_000;
// Positional over `searchColumns`; `filter` weighs 0 — matchable, but never outranking a real title hit.
export const DEFAULT_SEARCH_WEIGHTS = [10, 1, 3, 0];
// Each term is bound once per searched column (twice under a Postgres trigram), so the typed text sizes the statement.
export const DEFAULT_SEARCH_MAX_TERMS = 32;
export const DEFAULT_SEARCH_MAX_LENGTH = 1000;

export interface SearchIndexOptions {
  enabled: boolean;
  tokenizer: string;
  maxTerms?: number;
  maxLength?: number;
}

/** Unset means enabled; an unrecognised value fails the boot, since a typo like `ture` would look like the default. */
export const parseSearchEnabled = (value: string | undefined) => {
  if (value === undefined || value.trim() === "") return true;
  const normalized = value.trim().toLowerCase();
  if (normalized === "1" || normalized === "true") return true;
  if (normalized === "0" || normalized === "false") return false;
  throw new DocumentStoreError(
    "searchMisconfigured",
    `Invalid AKAN_SEARCH_ENABLED value: "${value}". Use 1/true or 0/false.`,
  );
};

/** The `search_doc` mirror is trigger-maintained, not hook-maintained: `updateOneByQuery` and friends fire no hooks. */
export class SearchIndex {
  readonly #owner: SearchIndexOwner;
  readonly #engine: SearchEngine;
  readonly #enabled: boolean;
  readonly #maxTerms: number;
  readonly #maxLength: number;
  readonly #logger = new Logger("SearchIndex");
  readonly #claims = new Map<string, string>();
  // Refs another process held at boot: not waited on, but retried, since nothing else would return to them.
  readonly #pending = new Map<string, [ConstantModel, DatabaseModel]>();

  constructor(
    owner: SearchIndexOwner,
    {
      enabled,
      tokenizer,
      maxTerms = DEFAULT_SEARCH_MAX_TERMS,
      maxLength = DEFAULT_SEARCH_MAX_LENGTH,
    }: SearchIndexOptions,
    engine: SearchEngine = new Fts5SearchEngine(owner, tokenizer),
  ) {
    this.#owner = owner;
    this.#enabled = enabled;
    this.#maxTerms = maxTerms;
    this.#maxLength = maxLength;
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
    // One locked turn reads and writes the hash (SQLite's write transaction spans processes): only the first rebuilds.
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
    // Hashing the trigger SQL, not just the columns, lets a changed trigger template invalidate it.
    const hash = await descriptorHash(triggers);
    if ((await this.#owner.getMeta(`${REF_META_PREFIX}${ref}`)) === hash) {
      // No replace: swapping a live trigger opens a window of missed writes that a matching hash never reconciles.
      await this.#engine.createModelTriggers(ref, triggers, false);
      this.#pending.delete(ref);
      return true;
    }
    if (!(await this.#claimLock(ref))) {
      // The claim holder rebuilds the whole table, so the triggers stay; `retryPending` returns once it clears.
      this.#pending.set(ref, [constant, database]);
      this.#logger.warn(`Search index for ${ref} is held by another process; will retry`);
      return false;
    }
    try {
      // Safe to replace now: the backfill re-reads the model table, catching a write that slips through the window.
      await this.#engine.createModelTriggers(ref, triggers, true);
      const reconciled = await this.reconcileRef(ref, columns, () => this.#renewLock(ref));
      // Only a completed pass writes the hash, or a half-written mirror stays wrong until the descriptor changes.
      if (reconciled) await this.#owner.setMeta(`${REF_META_PREFIX}${ref}`, hash);
      if (reconciled) this.#pending.delete(ref);
      else this.#pending.set(ref, [constant, database]);
      return reconciled;
    } finally {
      await this.#releaseLock(ref);
    }
  }

  /** Returns how many held refs are still outstanding. */
  async retryPending() {
    for (const [ref, [constant, database]] of [...this.#pending]) {
      if (await this.ensureRef(constant, database)) this.#logger.info(`Search index for ${ref} is current again`);
    }
    return this.#pending.size;
  }

  /**
   * `onChunk` reports whether this process still holds the claim, or an outlived backfill writes under the new holder's
   * `DELETE`. Returns whether the whole table was covered.
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

  /** Returns whether this process was the one that merged. */
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

  /** Pair with `resume`. The hash is cleared here too: a process dying mid-import must not skip the backfill. */
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
    if (query.text.length > this.#maxLength || query.text.split(/\s+/).filter(Boolean).length > this.#maxTerms)
      throw new Err.BadRequest("base.error.invalidArgument", {
        name: "search",
        expected: `at most ${this.#maxTerms} words and ${this.#maxLength} characters`,
      });
    return this.#engine.join(query);
  }

  async #clearRefHashes() {
    await this.#owner.getConnection().execute(`DELETE FROM "_akan_meta" WHERE "key" LIKE '${REF_META_PREFIX}%'`);
  }

  /**
   * One conditional upsert, not read-then-write in `transaction()`: its AsyncLocalStorage nesting check would open a
   * second `BEGIN IMMEDIATE` from an unrelated context. The token is epoch ms, past a 32-bit integer.
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

  /** Renew and release match the stored token, or a process stalled past the TTL would steal back a replaced claim. */
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
