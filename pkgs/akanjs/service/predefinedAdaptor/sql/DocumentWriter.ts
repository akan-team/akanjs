import { dayjs, FIELD_META } from "akanjs/base";
import { Err } from "akanjs/dictionary";
import {
  createDocumentId,
  type DocumentQuery,
  type DocumentScopeOptions,
  isDocumentId,
  NoDocumentError,
} from "akanjs/document";
import { DocumentStoreError } from "../../documentStoreError";
import type { DocumentRowCodec } from "./DocumentRowCodec";
import type { QueryScope } from "./QueryScope";
import type { SqlDocumentStore } from "./SqlDocumentStore";
import { type StoredRead, type StoredRow, StoredRows } from "./StoredRows";
import {
  type AkanSqlStatement,
  BASE_COLUMNS,
  type DocumentDatabaseOwner,
  type DocumentRecord,
  type FieldMap,
  type FindManyOptions,
  type FindOneOptions,
  type SqlDialect,
  type SqliteDocumentRow,
  type UpsertByIdOptions,
  type WriteHookOptions,
} from "./types";
import { jsonStr, quoteIdent } from "./values";

export interface DocumentWriterOptions {
  owner: DocumentDatabaseOwner;
  store: SqlDocumentStore;
  dialect: SqlDialect;
  codec: DocumentRowCodec;
  rows: StoredRows;
  scope: QueryScope;
  prepare: (sql: string) => AkanSqlStatement;
}

export class DocumentWriter {
  //? Five parameters a row keeps a statement far under SQLite's 32766 and Postgres's 65535 bound parameters.
  static readonly #insertBatchRows = 500;
  readonly #owner: DocumentDatabaseOwner;
  readonly #store: SqlDocumentStore;
  readonly #dialect: SqlDialect;
  readonly #codec: DocumentRowCodec;
  readonly #rows: StoredRows;
  readonly #scope: QueryScope;
  readonly #prepare: (sql: string) => AkanSqlStatement;
  #immutableKeys: string[] | null = null;

  constructor({ owner, store, dialect, codec, rows, scope, prepare }: DocumentWriterOptions) {
    this.#owner = owner;
    this.#store = store;
    this.#dialect = dialect;
    this.#codec = codec;
    this.#rows = rows;
    this.#scope = scope;
    this.#prepare = prepare;
  }

  async create(data: DocumentRecord, { runSaveHooks = true }: WriteHookOptions = {}) {
    const doc = this.#newDocument(data, Date.now());
    if (runSaveHooks) await this.#runHooks("save", "create", doc, "pre");
    await this.#runHooks("create", "create", doc, "pre");
    const row = this.#codec.toRow(doc);
    await this.#insertStmt().run(row.id, row.createdAt, row.updatedAt, row.removedAt, row._doc);
    await this.#runHooks("create", "create", doc, "post");
    if (runSaveHooks) await this.#runHooks("save", "create", doc, "post");
    return this.#rows.withStoredRow(doc, row);
  }

  async createMany(data: DocumentRecord[]) {
    if (!data.length) return [];
    const now = Date.now();
    const docs = data.map((record) => this.#newDocument(record, now));
    for (const doc of docs) {
      await this.#runHooks("save", "create", doc, "pre");
      await this.#runHooks("create", "create", doc, "pre");
    }
    const written = docs.map((doc) => ({ doc, row: this.#codec.toRow(doc) }));
    const write = async () => {
      for (let start = 0; start < written.length; start += DocumentWriter.#insertBatchRows) {
        const batch = written.slice(start, start + DocumentWriter.#insertBatchRows);
        await this.#prepare(this.#insertManySql(batch.length)).run(
          ...batch.flatMap(({ row }) => [row.id, row.createdAt, row.updatedAt, row.removedAt, row._doc]),
        );
      }
      for (const doc of docs) {
        await this.#runHooks("create", "create", doc, "post");
        await this.#runHooks("save", "create", doc, "post");
      }
    };
    if (this.#owner.transaction) await this.#owner.transaction(write);
    else await write();
    return written.map(({ doc, row }) => this.#rows.withStoredRow(doc, row));
  }

  #newDocument(data: DocumentRecord, now: number) {
    const id = data.id ?? createDocumentId(now);
    if (!isDocumentId(id)) throw new DocumentStoreError("invalidDocument", `Invalid ID value: ${id}`);
    return this.#store.hydrate(
      this.#codec.prepareDocument({
        ...data,
        id,
        createdAt: data.createdAt ?? dayjs(now),
        updatedAt: data.updatedAt ?? dayjs(now),
      }),
    );
  }

  async upsertById(
    data: DocumentRecord & { id: string },
    { preserveTimestamps = false, where, withRemoved }: UpsertByIdOptions = {},
  ) {
    if (!isDocumentId(data.id)) throw new DocumentStoreError("invalidDocument", `Invalid ID value: ${data.id}`);
    const now = dayjs();
    const keepsCreatedAt = preserveTimestamps && data.createdAt != null;
    const prepared = this.#codec.prepareDocument({
      ...data,
      createdAt: keepsCreatedAt ? data.createdAt : now,
      updatedAt: preserveTimestamps ? (data.updatedAt ?? now) : now,
    });
    const row = this.#codec.toRow(prepared);
    const kept = keepsCreatedAt ? `"createdAt" = excluded."createdAt", ` : "";
    const update = `DO UPDATE SET ${kept}"updatedAt" = excluded."updatedAt", "removedAt" = excluded."removedAt", "_doc" = excluded."_doc"`;
    if (where) return await this.#upsertWhere(data.id, row, update, where, { withRemoved });
    const stored = await this.#owner
      .getConnection()
      .prepare(
        `INSERT INTO ${quoteIdent(this.#store.table)} ("id", "createdAt", "updatedAt", "removedAt", "_doc") VALUES (?, ?, ?, ?, ${this.#dialect.docValuePlaceholder()})
           ON CONFLICT("id") ${update} RETURNING "createdAt"`,
      )
      .get<{ createdAt: number | string }>(row.id, row.createdAt, row.updatedAt, row.removedAt, row._doc);
    const createdAt = Number(stored?.createdAt ?? row.createdAt);
    return this.#rows.withStoredRow(this.#store.hydrate({ ...prepared, createdAt: dayjs(createdAt) }), {
      ...row,
      createdAt,
    });
  }

  // Postgres reads a bare column in ON CONFLICT's WHERE as ambiguous between the stored row and `excluded`, so the
  // condition reads the stored row through a subquery that names its columns alone.
  async #upsertWhere(id: string, row: StoredRow, update: string, where: DocumentQuery, scope: DocumentScopeOptions) {
    const { where: condition, params } = this.#scope.writeQuery(where, "upsertById", scope);
    const table = quoteIdent(this.#store.table);
    const columns = [...BASE_COLUMNS, "_doc"].map(
      (column) => `${table}.${quoteIdent(column)} AS ${quoteIdent(column)}`,
    );
    const written = await this.#owner
      .getConnection()
      .prepare(
        this.#dialect.upsertRow(
          this.#store.table,
          `${update} WHERE EXISTS (SELECT 1 FROM (SELECT ${columns.join(", ")}) AS "stored" WHERE ${condition})`,
        ),
      )
      .get<{ inserted: boolean | number }>(id, row.createdAt, row.updatedAt, row.removedAt, row._doc, ...params);
    if (!written) return { acknowledged: true, matchedCount: 0, modifiedCount: 0, upsertedId: null };
    const inserted = Boolean(Number(written.inserted));
    return {
      acknowledged: true,
      matchedCount: inserted ? 0 : 1,
      modifiedCount: 1,
      upsertedId: inserted ? id : null,
    };
  }

  async update(id: string, patch: DocumentRecord, options: WriteHookOptions = {}) {
    const current = await this.#pickByIdForWrite(id);
    return await this.#writeUpdatedDocument(id, { ...current, ...patch, id }, current, options);
  }

  async #findForWrite(query?: DocumentQuery, options: FindManyOptions = {}) {
    const { star, tail, args } = this.#scope.listQuery(query, options);
    const rows = await this.#prepare(`SELECT ${star} ${tail}`).all<SqliteDocumentRow>(...args);
    return rows.map((row) => this.#rows.withStoredRow(this.#store.hydrate(this.#codec.fromRow(row)), row));
  }

  async #findOneForWrite(query?: DocumentQuery, options: FindOneOptions = {}) {
    return (
      (await this.#findForWrite(query, { ...options, limit: 1, sample: options.sample ? 1 : undefined })).at(0) ?? null
    );
  }

  async #pickByIdForWrite(id: string) {
    const doc = await this.#findOneForWrite({ id } as DocumentQuery);
    if (!doc) throw new NoDocumentError(`No Document (${this.#store.table}): ${id}`);
    return doc;
  }

  async #writeUpdatedDocument(
    id: string,
    data: DocumentRecord,
    originalData: DocumentRecord,
    { runSaveHooks = true, crudType = "update", touch = true }: WriteHookOptions = {},
  ) {
    const prepared = this.#codec.prepareDocument({ ...data, id, updatedAt: touch ? dayjs() : originalData.updatedAt });
    this.#assertImmutableUnchanged(prepared, originalData);
    const doc = this.#store.hydrate(prepared, originalData);
    // `update()` re-read the row rather than trusting the caller's document, so this is the stored pre-state.
    const previous = originalData;
    if (runSaveHooks) await this.#runHooks("save", crudType, doc, "pre", previous);
    await this.#runHooks(crudType, crudType, doc, "pre", previous);
    const row = this.#codec.toRow(doc);
    const stored = (originalData as Record<symbol, StoredRead | undefined>)[StoredRows.storedRow];
    await this.#writeChanges(
      id,
      stored && !("fields" in stored) ? stored : this.#codec.toRow(originalData),
      row,
      touch,
    );
    await this.#runHooks(crudType, crudType, doc, "post", previous);
    if (runSaveHooks) await this.#runHooks("save", crudType, doc, "post", previous);
    return this.#rows.withStoredRow(doc, row);
  }

  /**
   * Merges only the fields that changed into the stored `_doc`, so a concurrent write to another field survives. A key
   * the stored row lacks is written out, which is what `q.missing` tells rows from before a field existed apart by.
   */
  async #writeChanges(id: string, read: StoredRow, written: StoredRow, touch: boolean) {
    const before = StoredRows.encodedFields(read);
    const after = StoredRows.encodedFields(written);
    //? Self-assigned untouched, so a write that landed after the read keeps the updatedAt it stamped.
    const assignments = [touch ? `"updatedAt" = ?` : `"updatedAt" = "updatedAt"`];
    const params: unknown[] = touch ? [written.updatedAt] : [];
    for (const column of ["createdAt", "removedAt"] as const) {
      if (before.get(column) === after.get(column)) continue;
      assignments.push(`${quoteIdent(column)} = ?`);
      params.push(written[column]);
    }
    const payload = JSON.parse(written._doc) as Record<string, unknown>;
    const set: [string, string][] = [];
    const removed: string[] = [];
    for (const field of new Set([...before.keys(), ...after.keys()])) {
      if (BASE_COLUMNS.has(field) || before.get(field) === after.get(field)) continue;
      if (after.has(field)) set.push([field, JSON.stringify(payload[field])]);
      else removed.push(field);
    }
    if (set.length || removed.length) {
      const merged = this.#dialect.mergeDocument(set, removed);
      assignments.push(`"_doc" = ${merged.sql}`);
      params.push(...merged.params);
    }
    await this.#owner
      .getConnection()
      .prepare(`UPDATE ${quoteIdent(this.#store.table)} SET ${assignments.join(", ")} WHERE "id" = ?`)
      .run(...params, id);
  }

  // The document path only, as mongoose exempts `bulkWrite`; checked before save hooks so the error names the
  // caller's change, not a hook's.
  #assertImmutableUnchanged(prepared: DocumentRecord, originalData: DocumentRecord) {
    this.#immutableKeys ??= Object.entries(this.#store.database.doc[FIELD_META] as unknown as FieldMap)
      .filter(([, fieldMeta]) => fieldMeta.getProps().immutable)
      .map(([key]) => key);
    if (!this.#immutableKeys.length) return;
    const changed = this.#immutableKeys.filter((key) => jsonStr(prepared[key]) !== jsonStr(originalData[key]));
    if (!changed.length) return;
    // The values are left out: an immutable field may also be `field.secret`.
    throw new Err(
      "base.error.immutableField",
      { field: changed.join(", ") },
      { details: { model: this.#store.table, id: String(prepared.id) } },
    );
  }

  async #runHooks(
    saveType: "save" | "create" | "update" | "remove",
    crudType: "create" | "update" | "remove",
    doc: DocumentRecord,
    phase: "pre" | "post",
    previous?: DocumentRecord,
  ) {
    const hooks =
      phase === "pre" ? this.#store.schema.preHooks.get(saveType) : this.#store.schema.postHooks.get(saveType);
    for (const hook of hooks ?? []) {
      const run = () => hook.call(doc, () => undefined, crudType, previous);
      if (phase === "post") await this.#owner.afterCommit(run);
      else await run();
    }
  }

  #insertStmt() {
    return this.#prepare(this.#insertManySql(1));
  }

  #insertManySql(rowNum: number) {
    const values = `(?, ?, ?, ?, ${this.#dialect.docValuePlaceholder()})`;
    return `INSERT INTO ${quoteIdent(this.#store.table)} ("id", "createdAt", "updatedAt", "removedAt", "_doc") VALUES ${Array.from({ length: rowNum }, () => values).join(", ")}`;
  }
}
