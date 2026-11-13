import { dayjs, FIELD_META } from "akanjs/base";
import { Logger } from "akanjs/common";
import type { ConstantModel } from "akanjs/constant";
import {
  type DatabaseModel,
  type DocumentQuery,
  type DocumentSchema,
  type DocumentScopeOptions,
  type DocumentTouchOptions,
  type DocumentUpdateInput,
  type DocumentUpdateOptions,
  documentQueryHelper,
  NoDocumentError,
} from "akanjs/document";
import { DocumentStoreError } from "../../documentStoreError";
import { DocumentHydrator } from "./DocumentHydrator";
import { DocumentRowCodec } from "./DocumentRowCodec";
import { DocumentWriter } from "./DocumentWriter";
import { SqliteDialect } from "./dialect/sqlite";
import { QueryCompiler } from "./QueryCompiler";
import { QueryScope } from "./QueryScope";
import { QueryWriter } from "./QueryWriter";
import { SqlTableSchema } from "./SqlTableSchema";
import { type StoredRead, StoredRows } from "./StoredRows";
import {
  type AkanSqlClient,
  type AkanSqlStatement,
  BASE_COLUMNS,
  type DocumentDatabaseOwner,
  type DocumentRecord,
  type FieldMap,
  type FindIdOptions,
  type FindManyOptions,
  type FindOneOptions,
  type ProjectedSqliteDocumentRow,
  type PrunedIndex,
  type SqlDialect,
  type SqliteDocumentRow,
  type TransferRow,
  type UndeclaredIndex,
  type UpsertByIdOptions,
  type WriteHookOptions,
} from "./types";
import { UpdateCompiler } from "./UpdateCompiler";
import { assertStorableJson, decodeDateValue, quoteIdent } from "./values";

export class SqlDocumentStore {
  readonly schema: DocumentSchema;
  readonly table: string;
  readonly compiler: QueryCompiler;
  readonly updateCompiler: UpdateCompiler;
  // Keyed by connection too: inside a transaction a statement bound to the pool would run outside it.
  #statements = new WeakMap<AkanSqlClient, Map<string, AkanSqlStatement>>();
  readonly #tableSchema: SqlTableSchema;
  readonly #codec: DocumentRowCodec;
  readonly #scope: QueryScope;
  readonly #rows: StoredRows;
  readonly #hydrator: DocumentHydrator;
  readonly #writer: DocumentWriter;
  readonly #queryWriter: QueryWriter;
  static readonly #logger = new Logger("SqlDocumentStore");

  constructor(
    private readonly owner: DocumentDatabaseOwner,
    readonly constant: ConstantModel,
    readonly database: DatabaseModel,
    schema: DocumentSchema,
    private readonly dialect: SqlDialect = new SqliteDialect(),
  ) {
    this.schema = schema;
    this.table = database.refName;
    const fields = database.doc[FIELD_META] as unknown as FieldMap;
    // Resolved per compile: the store exists before the adaptor's `onInit` builds the search index.
    this.compiler = new QueryCompiler(fields, dialect, this.table, () => this.owner.getSearchIndex());
    this.updateCompiler = new UpdateCompiler(fields, dialect);
    const logger = SqlDocumentStore.#logger;
    this.#tableSchema = new SqlTableSchema({
      owner,
      table: this.table,
      schema,
      constant,
      database,
      dialect,
      compiler: this.compiler,
      logger,
    });
    this.#codec = new DocumentRowCodec(database, this.table, dialect, this.compiler);
    this.#scope = new QueryScope(this.table, this.compiler);
    this.#rows = new StoredRows(this, this.#codec, logger);
    this.#hydrator = new DocumentHydrator(this, this.#codec, this.#rows);
    this.#writer = new DocumentWriter({
      owner,
      store: this,
      dialect,
      codec: this.#codec,
      rows: this.#rows,
      scope: this.#scope,
      prepare: (sql) => this.prepareStmt(sql),
    });
    this.#queryWriter = new QueryWriter(owner, this, dialect, this.#scope);
  }

  ensure() {
    return this.#tableSchema.ensure();
  }

  undeclaredIndexes(): Promise<UndeclaredIndex[]> {
    return this.#tableSchema.undeclaredIndexes();
  }

  pruneUndeclaredIndexes(): Promise<PrunedIndex[]> {
    return this.#tableSchema.pruneUndeclaredIndexes();
  }

  async create(data: DocumentRecord, { runSaveHooks = true }: WriteHookOptions = {}) {
    return await this.#writer.create(data, { runSaveHooks });
  }

  async createMany(data: DocumentRecord[]) {
    return await this.#writer.createMany(data);
  }

  async clone(data: DocumentRecord & { id: string }) {
    return this.create(data);
  }

  //* The write a sync or a backfill repeats safely: the row under the record's own id is written whole, a second run
  //* lands on the same row, and no hook runs — what arrives was validated where it was made. A live room learns nothing.
  async upsertById(
    data: DocumentRecord & { id: string },
    { preserveTimestamps = false, where, withRemoved }: UpsertByIdOptions = {},
  ) {
    return await this.#writer.upsertById(data, { preserveTimestamps, where, withRemoved });
  }

  async update(id: string, patch: DocumentRecord, options: WriteHookOptions = {}) {
    return await this.#writer.update(id, patch, options);
  }

  async remove(id: string) {
    return this.update(id, { removedAt: dayjs() }, { runSaveHooks: false, crudType: "remove" });
  }

  /** Up to `limit` stored rows after the id `after`, in id order and removed ones included. */
  async exportRows(after: string, limit: number): Promise<TransferRow[]> {
    const rows = await this.owner
      .getConnection()
      .prepare(
        `SELECT "id", "createdAt", "updatedAt", "removedAt", "_doc" FROM ${quoteIdent(this.table)} WHERE "id" > ? ORDER BY "id" LIMIT ${Math.trunc(limit)}`,
      )
      .all<SqliteDocumentRow>(after);
    const epoch = (value: unknown) => decodeDateValue(value)?.valueOf() ?? null;
    return rows.map((row) => ({
      id: row.id,
      createdAt: epoch(row.createdAt) ?? 0,
      updatedAt: epoch(row.updatedAt) ?? 0,
      removedAt: epoch(row.removedAt),
      _doc: JSON.parse(row._doc) as Record<string, unknown>,
    }));
  }

  /** Rows as another database stored them: a taken id is replaced, and no hook runs or field is derived. */
  async importRows(rows: TransferRow[]) {
    const write = async () => {
      const statement = this.owner.getConnection().prepare(
        `INSERT INTO ${quoteIdent(this.table)} ("id", "createdAt", "updatedAt", "removedAt", "_doc") VALUES (?, ?, ?, ?, ${this.dialect.docValuePlaceholder()})
           ON CONFLICT("id") DO UPDATE SET "createdAt" = excluded."createdAt", "updatedAt" = excluded."updatedAt", "removedAt" = excluded."removedAt", "_doc" = excluded."_doc"`,
      );
      for (const row of rows)
        await statement.run(
          row.id,
          row.createdAt,
          row.updatedAt,
          row.removedAt,
          assertStorableJson(JSON.stringify(row._doc), this.table),
        );
    };
    if (this.owner.transaction) await this.owner.transaction(write);
    else await write();
  }

  // One atomic UPDATE firing no document hooks, as MongoDB query middleware skips document middleware; per-document
  // hooks need `create`/`update(id)`/`remove(id)`/`.save()`.
  async updateOneByQuery(query: DocumentQuery, update: DocumentUpdateInput, options: DocumentUpdateOptions = {}) {
    if (options.upsert && options.withRemoved)
      throw new DocumentStoreError(
        "invalidQuery",
        `updateOneByQuery on "${this.table}" takes upsert or { withRemoved: true }, not both: a match would stay removed while a miss inserts a live row`,
      );
    return await this.#queryWriter.updateOne(query, update, options, "updateOneByQuery");
  }

  async updateManyByQuery(
    query: DocumentQuery,
    update: DocumentUpdateInput,
    options: DocumentScopeOptions & DocumentTouchOptions = {},
  ) {
    return await this.#queryWriter.updateMany(query, update, options, "updateManyByQuery");
  }

  // No scope: an already-removed row keeps its `removedAt`, so a cascade reaching it again changes nothing.
  async removeManyByQuery(query: DocumentQuery) {
    // "remove", not "delete": the row survives; `purgeManyByQuery` is the DELETE.
    return await this.#queryWriter.updateMany(query, { removedAt: dayjs() }, {}, "removeManyByQuery");
  }

  async removeOneByQuery(query: DocumentQuery) {
    // The newest match, reported as counts rather than an id: for "at most one of these", not a queue.
    return await this.#queryWriter.updateOne(query, { removedAt: dayjs() }, {}, "removeOneByQuery");
  }

  //* Live and removed rows alike, unlike every other write: retention purges by age, and most rows past it were removed
  //* long ago. The search mirror's rows go through its AFTER DELETE trigger; no hook, cascade or live room runs.
  async purgeManyByQuery(query: DocumentQuery) {
    return await this.#queryWriter.purgeMany(query);
  }

  async bulkWrite(
    operations: { updateOne: { filter: DocumentQuery; update: DocumentUpdateInput; upsert?: boolean } }[],
  ) {
    let matchedCount = 0;
    let modifiedCount = 0;
    let upsertedId: string | null = null;
    for (const operation of operations) {
      const result = await this.updateOneByQuery(operation.updateOne.filter, operation.updateOne.update, {
        upsert: operation.updateOne.upsert,
      });
      matchedCount += result.matchedCount;
      modifiedCount += result.modifiedCount;
      upsertedId ??= result.upsertedId ?? null;
    }
    return { acknowledged: true, matchedCount, modifiedCount, upsertedId };
  }

  async find(query?: DocumentQuery, options: FindManyOptions = {}) {
    const { star, tail, args } = this.#scope.listQuery(query, options);
    const projection = this.#codec.resolveProjection(options.select);
    if (projection) {
      const rows = await this.prepareStmt(
        `SELECT ${this.#codec.projectionSql(projection)} ${tail}`,
      ).all<ProjectedSqliteDocumentRow>(...args);
      return rows.map((row) =>
        this.#rows.readAs(
          this.#rows.withStoredRow(
            this.hydrate(this.#codec.fromProjectedRow(row, projection), undefined, { track: false }),
            { row, fields: projection },
          ),
          row,
        ),
      );
    }
    const rows = await this.prepareStmt(`SELECT ${star} ${tail}`).all<SqliteDocumentRow>(...args);
    return rows.map((row) =>
      this.#rows.readAs(
        this.#rows.withStoredRow(this.hydrate(this.#codec.fromRow(row), undefined, { track: false }), row),
        row,
      ),
    );
  }

  async findIds(query?: DocumentQuery, options: Omit<FindManyOptions, "select"> = {}) {
    const { tail, args } = this.#scope.listQuery(query, options, "findIds");
    const rows = await this.prepareStmt(`SELECT ${quoteIdent(this.table)}."id" ${tail}`).all<{ id: string }>(...args);
    return rows.map((row) => row.id);
  }

  async findOne(query?: DocumentQuery, options: FindOneOptions = {}) {
    return (await this.find(query, { ...options, limit: 1, sample: options.sample ? 1 : undefined })).at(0) ?? null;
  }

  async findId(query?: DocumentQuery, options: FindIdOptions = {}) {
    return (await this.findIds(query, { ...options, limit: 1, sample: options.sample ? 1 : undefined })).at(0) ?? null;
  }

  async pickOne(query?: DocumentQuery, options: FindOneOptions = {}) {
    const doc = await this.findOne(query, options);
    if (!doc) throw new NoDocumentError(`No Document (${this.table}): ${JSON.stringify(query)}`);
    return doc;
  }

  async pickById(id: string) {
    const doc = await this.findOne({ id } as DocumentQuery);
    if (!doc) throw new NoDocumentError(`No Document (${this.table}): ${id}`, { lookup: { refName: this.table, id } });
    return doc;
  }

  async exists(query?: DocumentQuery, options: DocumentScopeOptions = {}) {
    return this.findId(query, options);
  }

  async count(query?: DocumentQuery, options: DocumentScopeOptions = {}) {
    const { where, params, joins } = this.#scope.safeQuery(query, "count", options);
    const row = await this.prepareStmt(
      `SELECT count(*) as count FROM ${quoteIdent(this.table)}${this.#scope.joinSql(joins)} WHERE ${where}`,
    ).get<{ count: number }>(...this.#scope.joinParams(joins), ...params);
    return row?.count ?? 0;
  }

  /** The stored numbers at `path` added up over the live rows the query matches; 0 when none. */
  async sum(path: string, query?: DocumentQuery) {
    if (BASE_COLUMNS.has(path) || path.startsWith("_"))
      throw new DocumentStoreError("invalidQuery", `sum reads a model field, not "${path}"`);
    this.compiler.fieldExpr(path);
    const { where, params, joins } = this.#scope.safeQuery(query, "sum", {});
    const row = await this.prepareStmt(
      `SELECT ${this.dialect.sumOf(path)} as total FROM ${quoteIdent(this.table)}${this.#scope.joinSql(joins)} WHERE ${where}`,
    ).get<{ total: number | string | null }>(...this.#scope.joinParams(joins), ...params);
    return Number(row?.total ?? 0);
  }

  async insight(query?: DocumentQuery) {
    const insightFields = this.constant.insight[FIELD_META] as unknown as FieldMap;
    const result: DocumentRecord = {};
    for (const [key, field] of Object.entries(insightFields)) {
      const props = field.getProps();
      const { $sum: sumPath, ...condition } = (props.accumulate ?? {}) as Record<string, unknown>;
      if (!props.accumulate) {
        result[key] = props.default;
      } else if (typeof sumPath === "string") {
        //* `{ $sum: "<field>", ...condition }` adds the field up over the rows the condition also matches.
        const scoped = Object.keys(condition).length
          ? documentQueryHelper.all(query ?? {}, condition as DocumentQuery)
          : query;
        result[key] = await this.sum(sumPath, scoped);
      } else if (
        typeof props.accumulate === "object" &&
        !Object.keys(props.accumulate as Record<string, unknown>).some((key) => key.startsWith("$"))
      ) {
        result[key] = await this.count(documentQueryHelper.all(query ?? {}, props.accumulate as DocumentQuery));
      } else {
        result[key] = await this.count(query);
      }
    }
    return result;
  }

  /** `track` buys `isModified()` with a deep clone of the row; only the read paths opt out. */
  hydrate(data: DocumentRecord, originalData: DocumentRecord = data, { track = true }: { track?: boolean } = {}) {
    return this.#hydrator.hydrate(data, originalData, { track });
  }

  serialize(doc: DocumentRecord) {
    return JSON.stringify(this.#codec.toRow(doc));
  }

  deserialize(text: string) {
    return this.hydrate(this.#codec.fromRow(JSON.parse(text) as SqliteDocumentRow), undefined, { track: false });
  }

  /** Another instance of a read document, built from the row it was read as, so what either is set to stays its own. */
  rehydrate(doc: DocumentRecord) {
    const stored = (doc as Record<symbol, StoredRead | undefined>)[StoredRows.storedRow];
    if (!stored) return this.deserialize(this.serialize(doc));
    const copy = this.#rows.withStoredRow(this.#rows.hydrateStored(stored, String(doc.id)), stored);
    return this.#rows.readAs(copy, { removedAt: (doc as Record<symbol, unknown>)[StoredRows.readRemoved] });
  }

  private prepareStmt(sql: string) {
    const connection = this.owner.getConnection();
    let cache = this.#statements.get(connection);
    if (!cache) {
      cache = new Map();
      this.#statements.set(connection, cache);
    }
    const cached = cache.get(sql);
    if (cached) return cached;
    // Keep the cache bounded; list/find query shapes repeat heavily, while ad-hoc filters should not grow forever.
    if (cache.size >= 128) {
      const oldest = cache.keys().next().value;
      if (oldest) cache.delete(oldest);
    }
    const stmt = connection.prepare(sql);
    cache.set(sql, stmt);
    return stmt;
  }
}
