import { DEFAULT_VALUE, dayjs, FIELD_META } from "akanjs/base";
import { Logger } from "akanjs/common";
import { type ConstantModel, freshPrimitiveValue, getDefault } from "akanjs/constant";
import { Err } from "akanjs/dictionary";
import {
  createDocumentId,
  type DatabaseModel,
  type DocumentQuery,
  type DocumentSchema,
  type DocumentScopeOptions,
  type DocumentUpdate,
  type DocumentUpdateInput,
  type DocumentUpdateNode,
  type DocumentUpdateOptions,
  documentQueryHelper,
  isDocumentId,
  isDocumentUpdateNode,
  LiveRowScope,
  NoDocumentError,
  resolveDocumentUpdate,
  sanitizeJson,
} from "akanjs/document";
import { SqliteDialect } from "./dialect/sqlite";
import { QueryCompiler } from "./QueryCompiler";
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
  MODIFICATION_STATE,
  type ModificationState,
  type MutableDocumentRecord,
  type ProjectedSqliteDocumentRow,
  type ProjectionOption,
  REF_NAME_RE,
  RESERVED_RE,
  type SearchJoin,
  type SortOption,
  type SqlDialect,
  type SqliteDocumentRow,
  type TransferRow,
  toSafeRefName,
  type UpsertByIdOptions,
  type WriteHookOptions,
} from "./types";
import { UpdateCompiler } from "./UpdateCompiler";
import {
  assertStorableJson,
  decodeDateValue,
  descriptorHash,
  encodeSqlValue,
  jsonStr,
  quoteIdent,
  stableJson,
} from "./values";

interface DeclaredIndex {
  name: string;
  next: string;
  metaKey: string;
  hash: string;
  fields: Record<string, unknown>;
  /** A key ordered neither 1 nor -1, as MongoDB's `"text"`: no SQL index here stands for it. */
  unbuilt: boolean;
  create: (name: string, concurrently: boolean) => string;
}

type StoredRow = Omit<SqliteDocumentRow, "id">;

// A literal default (every array field's `[]`) belongs to the model; uncopied, one document's `push` would reach it.
const freshDefault = (value: unknown) => (Array.isArray(value) ? [...(value as unknown[])] : value);

export class SqlDocumentStore {
  readonly schema: DocumentSchema;
  readonly table: string;
  readonly compiler: QueryCompiler;
  readonly updateCompiler: UpdateCompiler;
  // Keyed by connection too: inside a transaction a statement bound to the pool would run outside it.
  #statements = new WeakMap<AkanSqlClient, Map<string, AkanSqlStatement>>();
  #docPrototype: object | null = null;
  #immutableKeys: string[] | null = null;
  #ensured: Promise<void> | null = null;
  static readonly #logger = new Logger("SqlDocumentStore");
  /** The row a document was read or last written as. */
  static readonly #storedRow = Symbol("akan.storedRow");
  /** Set on a document read as removed, which only a `withRemoved` read hands out. */
  static readonly #readRemoved = Symbol("akan.readRemoved");

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
  }

  // One shared run: two concurrent `CREATE TABLE IF NOT EXISTS` on one name are a duplicate-key error in Postgres.
  ensure() {
    this.#ensured ??= this.#ensure();
    return this.#ensured;
  }

  async #ensure() {
    this.assertValidRefName(this.table);
    const declared = await this.#declaredIndexes();
    const indexes = declared.filter((index) => !index.unbuilt);
    const createSchema = async () => {
      const db = this.owner.getConnection();
      const existed = !!this.owner.buildIndexConcurrently && !!(await this.owner.hasTable?.(this.table));
      const ts = this.dialect.timestampType();
      await db.execute(
        `CREATE TABLE IF NOT EXISTS ${quoteIdent(this.table)} (
        "id" TEXT PRIMARY KEY NOT NULL,
        "createdAt" ${ts} NOT NULL,
        "updatedAt" ${ts} NOT NULL,
        "removedAt" ${ts},
        "_doc" ${this.dialect.docColumnType()} NOT NULL
      )`,
      );
      await this.owner.grantInsight?.(this.table);
      await this.owner.setMeta(
        `table:${this.table}`,
        await descriptorHash({ table: this.table, columns: ["id", "createdAt", "updatedAt", "removedAt", "_doc"] }),
      );
      for (const index of declared) if (index.unbuilt) await this.#skipUnbuiltIndex(index, indexes);
      const concurrent: (DeclaredIndex & { replace: boolean })[] = [];
      for (const index of indexes) {
        const stored = await this.owner.getMeta(index.metaKey);
        const replace = !!stored && stored !== index.hash;
        if (replace)
          SqlDocumentStore.#logger.warn(
            `Index ${index.name} on ${this.table} changed its descriptor and is rebuilt; on a large table that is a full index build`,
          );
        if (existed && !replace && (await this.owner.hasValidIndex?.(index.name))) {
          await this.owner.setMeta(index.metaKey, index.hash);
          continue;
        }
        if (existed) {
          concurrent.push({ ...index, replace });
          continue;
        }
        if (replace) await this.#replaceIndex(index);
        else await db.execute(index.create(index.name, false));
        await this.owner.setMeta(index.metaKey, index.hash);
      }
      return concurrent;
    };
    const concurrent = this.owner.lockSchema ? await this.owner.lockSchema(createSchema) : await createSchema();
    for (const { name, next, create, replace, metaKey, hash } of concurrent) {
      await this.owner.buildIndexConcurrently?.({ name, next, create: (target) => create(target, true), replace });
      await this.owner.setMeta(metaKey, hash);
    }
    await this.owner.getSearchIndex()?.ensureRef(this.constant, this.database);
  }

  // A skipped declaration keeps its position: a name carries its index, so filtering first would rename the rest.
  async #declaredIndexes(): Promise<DeclaredIndex[]> {
    return await Promise.all(
      this.schema.indexes.map(async (index, idx) => {
        const declared = index.name ?? `${this.table}_${Object.keys(index.fields).map(toSafeRefName).join("_")}_${idx}`;
        this.assertValidRefName(declared);
        const name = this.dialect.indexName(declared);
        const unbuilt = Object.values(index.fields).some((order) => order !== 1 && order !== -1);
        const columns = unbuilt
          ? []
          : Object.keys(index.fields).map((path) => ({
              path,
              expr: this.compiler.fieldExpr(path),
              isArray: this.compiler.isArrayPath(path),
            }));
        return {
          name,
          next: this.dialect.indexName(`${declared}_next`),
          metaKey: `index:${this.table}:${name}`,
          hash: await descriptorHash(index),
          fields: index.fields,
          unbuilt,
          create: (target: string, concurrently: boolean) =>
            this.dialect.createIndex({
              name: target,
              table: this.table,
              unique: !!index.unique,
              columns,
              concurrently,
            }),
        };
      }),
    );
  }

  // Dropped only on proof that this very descriptor built it (the hash `ensure` stored) and no built index has the name.
  async #skipUnbuiltIndex(index: DeclaredIndex, built: DeclaredIndex[]) {
    const dropped =
      (await this.owner.getMeta(index.metaKey)) === index.hash && !built.some(({ name }) => name === index.name);
    if (dropped) {
      await this.owner.getConnection().execute(`DROP INDEX IF EXISTS ${quoteIdent(index.name)}`);
      // Emptied, not deleted (the owner has no delete): an empty hash reads as no index, so no later boot drops again.
      await this.owner.setMeta(index.metaKey, "");
    }
    const paths = Object.keys(index.fields);
    SqlDocumentStore.#logger.warn(
      `Index ${JSON.stringify(index.fields)} on ${this.table} is not built: only 1 and -1 order a key, and "text" is ` +
        `MongoDB's text index, which as a B-tree would copy each whole value and fail long writes on Postgres. Search ` +
        `${paths.join(", ")} through the full-text role, field(String, { text: "desc" }), or declare ` +
        `{ ${paths[0]}: 1 } to look it up by equality.${dropped ? ` Dropped ${index.name}, which an earlier boot built from it.` : ""}`,
    );
  }

  // In one transaction, so a new definition the rows refuse — a `unique` over duplicates — leaves the old index.
  async #replaceIndex(index: DeclaredIndex) {
    const rebuild = async () => {
      const db = this.owner.getConnection();
      await db.execute(`DROP INDEX IF EXISTS ${quoteIdent(index.name)}`);
      await db.execute(index.create(index.name, false));
    };
    if (this.owner.transaction) await this.owner.transaction(rebuild);
    else await rebuild();
  }

  async create(data: DocumentRecord, { runSaveHooks = true }: WriteHookOptions = {}) {
    const now = Date.now();
    const id = data.id ?? createDocumentId(now);
    if (!isDocumentId(id)) throw new Error(`Invalid ID value: ${id}`);
    const doc = this.hydrate(
      this.prepareDocument({
        ...data,
        id,
        createdAt: data.createdAt ?? dayjs(now),
        updatedAt: data.updatedAt ?? dayjs(now),
      }),
    );
    if (runSaveHooks) await this.runHooks("save", "create", doc, "pre");
    await this.runHooks("create", "create", doc, "pre");
    const row = this.toRow(doc);
    await this.insertStmt().run(row.id, row.createdAt, row.updatedAt, row.removedAt, row._doc);
    await this.runHooks("create", "create", doc, "post");
    if (runSaveHooks) await this.runHooks("save", "create", doc, "post");
    return this.#withStoredRow(doc, row);
  }

  async clone(data: DocumentRecord & { id: string }) {
    return this.create(data);
  }

  //* The write a sync or a backfill repeats safely: the row under the record's own id is written whole, a second run
  //* lands on the same row, and no hook runs — what arrives was validated where it was made. A live room learns nothing.
  async upsertById(data: DocumentRecord & { id: string }, { preserveTimestamps = false }: UpsertByIdOptions = {}) {
    if (!isDocumentId(data.id)) throw new Error(`Invalid ID value: ${data.id}`);
    const now = dayjs();
    const keepsCreatedAt = preserveTimestamps && data.createdAt != null;
    const prepared = this.prepareDocument({
      ...data,
      createdAt: keepsCreatedAt ? data.createdAt : now,
      updatedAt: preserveTimestamps ? (data.updatedAt ?? now) : now,
    });
    const row = this.toRow(prepared);
    const kept = keepsCreatedAt ? `"createdAt" = excluded."createdAt", ` : "";
    const stored = await this.owner
      .getConnection()
      .prepare(
        `INSERT INTO ${quoteIdent(this.table)} ("id", "createdAt", "updatedAt", "removedAt", "_doc") VALUES (?, ?, ?, ?, ${this.dialect.docValuePlaceholder()})
           ON CONFLICT("id") DO UPDATE SET ${kept}"updatedAt" = excluded."updatedAt", "removedAt" = excluded."removedAt", "_doc" = excluded."_doc"
           RETURNING "createdAt"`,
      )
      .get<{ createdAt: number | string }>(row.id, row.createdAt, row.updatedAt, row.removedAt, row._doc);
    const createdAt = Number(stored?.createdAt ?? row.createdAt);
    return this.#withStoredRow(this.hydrate({ ...prepared, createdAt: dayjs(createdAt) }), { ...row, createdAt });
  }

  async update(id: string, patch: DocumentRecord, options: WriteHookOptions = {}) {
    const current = await this.pickByIdForWrite(id);
    return await this.writeUpdatedDocument(id, { ...current, ...patch, id, updatedAt: dayjs() }, current, options);
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
      throw new Error(
        `updateOneByQuery on "${this.table}" takes upsert or { withRemoved: true }, not both: a match would stay removed while a miss inserts a live row`,
      );
    return await this.#updateOne(query, update, options, "updateOneByQuery");
  }

  async #updateOne(
    query: DocumentQuery,
    update: DocumentUpdateInput,
    options: DocumentUpdateOptions,
    operation: string,
  ) {
    const resolved = resolveDocumentUpdate(update);
    const { assignments, params } = this.compiledUpdate(resolved);
    const { where, params: whereParams } = this.writeQuery(query, operation, options);
    const subquery = `SELECT ${quoteIdent("id")} FROM ${quoteIdent(this.table)} WHERE ${where} ORDER BY ${this.compiler.orderBy()} LIMIT 1`;
    //? Postgres re-checks a row another write changed meanwhile against the outer WHERE only, never the subquery's,
    //? so the condition is repeated there or two racing writes both apply it (READ COMMITTED's EvalPlanQual).
    const sql = `UPDATE ${quoteIdent(this.table)} SET ${assignments.join(", ")} WHERE ${quoteIdent("id")} IN (${subquery}) AND (${where})`;
    const changes = this.dialect.affectedRows(
      await this.owner
        .getConnection()
        .prepare(sql)
        .run(...params, ...whereParams, ...whereParams),
    );
    if (changes > 0) return { acknowledged: true, matchedCount: 1, modifiedCount: 1, upsertedId: null };
    if (!options.upsert) return { acknowledged: true, matchedCount: 0, modifiedCount: 0, upsertedId: null };
    const inserted = await this.create(this.applyInsertUpdate(this.extractInsertBase(query), resolved), {
      runSaveHooks: false,
    });
    return { acknowledged: true, matchedCount: 0, modifiedCount: 1, upsertedId: inserted.id };
  }

  async updateManyByQuery(query: DocumentQuery, update: DocumentUpdateInput, options: DocumentScopeOptions = {}) {
    return await this.#updateMany(query, update, options, "updateManyByQuery");
  }

  async #updateMany(
    query: DocumentQuery,
    update: DocumentUpdateInput,
    options: DocumentScopeOptions,
    operation: string,
  ) {
    const { assignments, params } = this.compiledUpdate(resolveDocumentUpdate(update));
    const { where, params: whereParams } = this.writeQuery(query, operation, options);
    const sql = `UPDATE ${quoteIdent(this.table)} SET ${assignments.join(", ")} WHERE ${where}`;
    const changes = this.dialect.affectedRows(
      await this.owner
        .getConnection()
        .prepare(sql)
        .run(...params, ...whereParams),
    );
    return { acknowledged: true, matchedCount: changes, modifiedCount: changes };
  }

  // No scope: an already-removed row keeps its `removedAt`, so a cascade reaching it again changes nothing.
  async removeManyByQuery(query: DocumentQuery) {
    // "remove", not "delete": the row survives, and `delete` stays free to mean an actual DELETE some day.
    return await this.#updateMany(query, { removedAt: dayjs() }, {}, "removeManyByQuery");
  }

  async removeOneByQuery(query: DocumentQuery) {
    // The newest match, reported as counts rather than an id: for "at most one of these", not a queue.
    return await this.#updateOne(query, { removedAt: dayjs() }, {}, "removeOneByQuery");
  }

  private compiledUpdate(update: DocumentUpdate) {
    for (const raw of Object.values(update))
      assertStorableJson(jsonStr(isDocumentUpdateNode(raw) ? raw.value : raw), this.table);
    const compiled = this.updateCompiler.compile(update);
    return {
      assignments: [`${quoteIdent("updatedAt")} = ?`, ...compiled.assignments],
      params: [Date.now(), ...compiled.params],
    };
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
    const { star, tail, args } = this.listQuery(query, options);
    const projection = this.resolveProjection(options.select);
    if (projection) {
      const rows = await this.prepareStmt(
        `SELECT ${this.projectionSql(projection)} ${tail}`,
      ).all<ProjectedSqliteDocumentRow>(...args);
      return rows.map((row) =>
        this.#readAs(this.hydrate(this.fromProjectedRow(row, projection), undefined, { track: false }), row),
      );
    }
    const rows = await this.prepareStmt(`SELECT ${star} ${tail}`).all<SqliteDocumentRow>(...args);
    return rows.map((row) =>
      this.#readAs(this.#withStoredRow(this.hydrate(this.fromRow(row), undefined, { track: false }), row), row),
    );
  }

  async findIds(query?: DocumentQuery, options: Omit<FindManyOptions, "select"> = {}) {
    const { tail, args } = this.listQuery(query, options, "findIds");
    const rows = await this.prepareStmt(`SELECT ${quoteIdent(this.table)}."id" ${tail}`).all<{ id: string }>(...args);
    return rows.map((row) => row.id);
  }

  private listQuery(query: DocumentQuery | undefined, options: FindManyOptions, operation = "find") {
    const { where, params, joins } = this.safeQuery(query, operation, options);
    const limitValue = Number(options.limit ?? 0);
    const skipValue = Number(options.skip ?? 0);
    const order = options.sample ? "ORDER BY random()" : `ORDER BY ${this.orderBy(options.sort, joins)}`;
    const page = `${limitValue ? ` LIMIT ${limitValue}` : ""}${skipValue ? ` OFFSET ${skipValue}` : ""}`;
    return {
      // A bare `*` would drag the join subquery's `rid`/`score` into the row.
      star: joins.length ? `${quoteIdent(this.table)}.*` : "*",
      tail: `FROM ${quoteIdent(this.table)}${this.joinSql(joins)} WHERE ${where} ${order}${page}`,
      args: [...this.joinParams(joins), ...params],
    };
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
    if (!doc) throw new NoDocumentError(`No Document (${this.table}): ${id}`);
    return doc;
  }

  async exists(query?: DocumentQuery, options: DocumentScopeOptions = {}) {
    return this.findId(query, options);
  }

  async count(query?: DocumentQuery, options: DocumentScopeOptions = {}) {
    const { where, params, joins } = this.safeQuery(query, "count", options);
    const row = await this.prepareStmt(
      `SELECT count(*) as count FROM ${quoteIdent(this.table)}${this.joinSql(joins)} WHERE ${where}`,
    ).get<{ count: number }>(...this.joinParams(joins), ...params);
    return row?.count ?? 0;
  }

  /** The stored numbers at `path` added up over the live rows the query matches; 0 when none. */
  async sum(path: string, query?: DocumentQuery) {
    if (BASE_COLUMNS.has(path) || path.startsWith("_")) throw new Error(`sum reads a model field, not "${path}"`);
    this.compiler.fieldExpr(path);
    const { where, params, joins } = this.safeQuery(query, "sum", {});
    const row = await this.prepareStmt(
      `SELECT ${this.dialect.sumOf(path)} as total FROM ${quoteIdent(this.table)}${this.joinSql(joins)} WHERE ${where}`,
    ).get<{ total: number | string | null }>(...this.joinParams(joins), ...params);
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

  private safeQuery(
    query: DocumentQuery | undefined,
    operation: string,
    { withRemoved = false }: DocumentScopeOptions,
  ) {
    if (withRemoved) {
      const compiled = this.compiler.compile(query ?? {});
      // The search mirror drops a row when it is removed, so the join would silently leave every removed row out.
      if (compiled.joins.length) throw new Error(`q.search() cannot see removed rows on "${this.table}"`);
      return compiled;
    }
    const conflict = LiveRowScope.conflictOf(query);
    if (conflict)
      throw new Error(
        `${operation} on "${this.table}" can never match (${conflict}); ${operation.startsWith("remove") ? "a remove reaches live rows only" : "pass { withRemoved: true }"}`,
      );
    return this.compiler.compile(documentQueryHelper.all(documentQueryHelper.empty("removedAt"), query ?? {}));
  }

  // An atomic write has no join for the search; ignoring it would widen the write to every other match.
  private writeQuery(query: DocumentQuery | undefined, operation: string, options: DocumentScopeOptions) {
    const compiled = this.safeQuery(query, operation, options);
    if (compiled.joins.length)
      throw new Error(`q.search() cannot be used in ${operation} on "${this.table}"; query-level writes take no join.`);
    return compiled;
  }

  private joinSql(joins: SearchJoin[]) {
    return joins.length ? ` ${joins.map((join) => join.sql).join(" ")}` : "";
  }

  // The JOIN precedes the WHERE in the text, so its bindings go first; a wrong order raises nothing, just wrong rows.
  private joinParams(joins: SearchJoin[]) {
    return joins.flatMap((join) => join.params);
  }

  // Scores sort best-first ascending (bm25 is negative; Postgres negates its rank), `id` keeping paging stable on ties.
  // An explicit sort wins; `relevance` arrives as an empty sort map.
  private orderBy(sort: SortOption, joins: SearchJoin[]) {
    const explicit = sort && Object.keys(sort).length ? sort : null;
    if (!explicit && joins.length) return `${joins[0].alias}."score", ${quoteIdent(this.table)}."id" DESC`;
    return this.compiler.orderBy(explicit ?? undefined);
  }

  private prepareDocument(data: DocumentRecord) {
    const fields = this.database.doc[FIELD_META] as unknown as FieldMap;
    const doc: MutableDocumentRecord = {};
    for (const [key, field] of Object.entries(fields)) {
      const props = field.getProps();
      const value = data[key];
      if (value === undefined) {
        if (props.default !== undefined && props.default !== null) {
          doc[key] = freshDefault(typeof props.default === "function" ? props.default(data) : props.default);
        } else if (props.isClass && props.isScalar && !props.nullable) {
          // A nested scalar owns its field defaults, so it is constructible; a relation is not, and fails closed below.
          doc[key] = getDefault((props.modelRef as { [FIELD_META]: FieldMap })[FIELD_META] as never);
        } else if (!props.nullable && !["removedAt"].includes(key)) {
          if (["id", "createdAt", "updatedAt"].includes(key)) continue;
          throw new Error(`Missing required field: ${key}`);
        }
      } else if (value === null && !props.nullable) {
        throw new Error(`Field is not nullable: ${key}`);
      } else {
        doc[key] = value;
      }
      if (doc[key] !== undefined && doc[key] !== null) {
        doc[key] = this.normalizeWriteValue(doc[key], props);
      }
      if (props.enum && doc[key] !== undefined && doc[key] !== null) {
        const values = Array.isArray(doc[key]) ? doc[key] : [doc[key]];
        const fieldEnum = props.enum as { has: (value: unknown) => boolean } | undefined;
        const invalidValue = fieldEnum ? values.find((value: unknown) => !fieldEnum.has(value)) : undefined;
        if (invalidValue !== undefined) throw new Error(`Invalid enum value for ${key}: ${invalidValue}`);
      }
      const validate = props.validate as ((value: unknown, doc: MutableDocumentRecord) => boolean) | undefined;
      if (validate && doc[key] !== undefined && doc[key] !== null && !validate(doc[key], doc)) {
        throw new Error(`Invalid field value: ${key}`);
      }
    }
    return { ...data, ...doc };
  }

  private extractInsertBase(query: DocumentQuery): Record<string, unknown> {
    if (!query || typeof query !== "object" || Array.isArray(query) || "kind" in query) return {};
    return Object.fromEntries(
      Object.entries(query).flatMap(([key, value]) => {
        if (["all", "any"].includes(key) || key.startsWith("$")) return [];
        if (value === null || ["string", "number", "boolean"].includes(typeof value)) return [[key, value]];
        return [];
      }),
    );
  }

  // An upsert's insert applies the update nodes in JS, having no row to mutate; `setOnInsert` applies only here.
  private applyInsertUpdate(base: DocumentRecord, update: DocumentUpdate) {
    const doc: MutableDocumentRecord = { ...base };
    const setPath = (path: string, value: unknown) => {
      const parts = path.split(".");
      let target: MutableDocumentRecord = doc;
      for (const part of parts.slice(0, -1)) {
        target[part] ??= {};
        target = target[part] as MutableDocumentRecord;
      }
      target[parts.at(-1) as string] = value;
    };
    const getPath = (path: string) =>
      path.split(".").reduce<unknown>((obj, key) => (obj as DocumentRecord | undefined)?.[key], doc);
    for (const [path, raw] of Object.entries(update)) {
      if (raw === undefined) continue;
      const node: DocumentUpdateNode = isDocumentUpdateNode(raw) ? raw : { kind: "update", op: "set", value: raw };
      const current = getPath(path);
      switch (node.op) {
        case "set":
        case "setOnInsert":
          setPath(path, node.value);
          break;
        case "unset": {
          const parts = path.split(".");
          let target: MutableDocumentRecord | undefined = doc;
          for (const part of parts.slice(0, -1)) {
            target = target?.[part] as MutableDocumentRecord | undefined;
            if (!target || typeof target !== "object") break;
          }
          if (target) delete target[parts.at(-1) as string];
          break;
        }
        case "inc":
          setPath(path, Number(current ?? 0) + Number(node.value));
          break;
        case "mul":
          setPath(path, Number(current ?? 0) * Number(node.value));
          break;
        case "min":
          setPath(path, current === undefined ? node.value : Math.min(Number(current), Number(node.value)));
          break;
        case "max":
          setPath(path, current === undefined ? node.value : Math.max(Number(current), Number(node.value)));
          break;
        case "push":
          setPath(path, [...(Array.isArray(current) ? current : []), node.value]);
          break;
        case "addToSet": {
          const arr = Array.isArray(current) ? current : [];
          if (!arr.some((item) => stableJson(item) === stableJson(node.value))) setPath(path, [...arr, node.value]);
          break;
        }
        case "pull":
          if (Array.isArray(current))
            setPath(
              path,
              current.filter((item) => stableJson(item) !== stableJson(node.value)),
            );
          break;
      }
    }
    return doc;
  }

  private toRow({ id, createdAt, updatedAt, removedAt, ...payload }: DocumentRecord) {
    return {
      id,
      createdAt: Number(encodeSqlValue(createdAt ?? dayjs())),
      updatedAt: Number(encodeSqlValue(updatedAt ?? dayjs())),
      removedAt: removedAt ? Number(encodeSqlValue(removedAt)) : null,
      _doc: assertStorableJson(JSON.stringify(sanitizeJson(payload)), this.table),
    };
  }

  private fromRow(row: SqliteDocumentRow) {
    const rawDoc: unknown = row._doc;
    const raw = typeof rawDoc === "string" ? JSON.parse(rawDoc) : (rawDoc as Record<string, unknown>);
    const payload = this.decodeDocumentPayload(raw);
    return {
      id: row.id,
      createdAt: dayjs(Number(row.createdAt)),
      updatedAt: dayjs(Number(row.updatedAt)),
      removedAt: row.removedAt ? dayjs(Number(row.removedAt)) : undefined,
      ...payload,
    };
  }

  private normalizeProjection(select: ProjectionOption): string[] | null {
    if (!select) return null;
    const fields = Object.entries(select)
      .filter(([, included]) => included)
      .map(([field]) => field);
    return [...new Set(fields.filter((field) => field !== "_doc"))];
  }

  private resolveProjection(select: ProjectionOption): string[] | null {
    const projection = this.normalizeProjection(select);
    if (projection !== null) return projection;
    return this.defaultProjection();
  }

  private defaultProjection(): string[] | null {
    const fields = this.database.doc[FIELD_META] as unknown as FieldMap;
    const entries = Object.entries(fields).filter(([key]) => !BASE_COLUMNS.has(key));
    if (!entries.some(([, field]) => field.getProps().select === false)) return null;
    return entries.flatMap(([key, field]) => (field.getProps().select === false ? [] : [key]));
  }

  private projectionSql(fields: string[]) {
    const jsonFields = fields.filter((field) => !BASE_COLUMNS.has(field));
    const baseColumns = [...BASE_COLUMNS].map((field) => quoteIdent(field));
    const jsonColumns = jsonFields.map(
      (field, idx) => `${this.compiler.projectExpr(field)} AS ${quoteIdent(this.projectionAlias(idx))}`,
    );
    return [...baseColumns, ...jsonColumns].join(", ");
  }

  private projectionAlias(idx: number) {
    return `__akan_projection_${idx}`;
  }

  private fromProjectedRow(row: ProjectedSqliteDocumentRow, fields: string[]) {
    const doc: DocumentRecord = {
      id: row.id,
      createdAt: dayjs(Number(row.createdAt)),
      updatedAt: dayjs(Number(row.updatedAt)),
      removedAt: row.removedAt ? dayjs(Number(row.removedAt)) : undefined,
    };
    const jsonFields = fields.filter((field) => !BASE_COLUMNS.has(field));
    for (const [idx, field] of jsonFields.entries()) {
      const value = this.dialect.decodeProjected(row[this.projectionAlias(idx)]);
      const props = (this.database.doc[FIELD_META] as unknown as FieldMap)[field]?.getProps?.();
      if (value === null && !props?.nullable) {
        if (props?.default != null) {
          doc[field] = freshDefault(
            typeof props.default === "function" ? (props.default as (data: unknown) => unknown)(doc) : props.default,
          );
        } else if (props?.isClass && props.isScalar) {
          doc[field] = getDefault((props.modelRef as { [FIELD_META]: FieldMap })[FIELD_META] as never);
        } else {
          doc[field] = SqlDocumentStore.#primitiveDefault(props as Record<string, unknown>);
        }
      } else {
        doc[field] = props ? this.decodeFieldValue(value, props) : value;
      }
    }
    return doc;
  }

  private async findForWrite(query?: DocumentQuery, options: FindManyOptions = {}) {
    const { star, tail, args } = this.listQuery(query, options);
    const rows = await this.prepareStmt(`SELECT ${star} ${tail}`).all<SqliteDocumentRow>(...args);
    return rows.map((row) => this.#withStoredRow(this.hydrate(this.fromRow(row)), row));
  }

  private async findOneForWrite(query?: DocumentQuery, options: FindOneOptions = {}) {
    return (
      (await this.findForWrite(query, { ...options, limit: 1, sample: options.sample ? 1 : undefined })).at(0) ?? null
    );
  }

  private async pickByIdForWrite(id: string) {
    const doc = await this.findOneForWrite({ id } as DocumentQuery);
    if (!doc) throw new NoDocumentError(`No Document (${this.table}): ${id}`);
    return doc;
  }

  private async writeUpdatedDocument(
    id: string,
    data: DocumentRecord,
    originalData: DocumentRecord,
    { runSaveHooks = true, crudType = "update" }: WriteHookOptions = {},
  ) {
    const prepared = this.prepareDocument({ ...data, id, updatedAt: dayjs() });
    this.#assertImmutableUnchanged(prepared, originalData);
    const doc = this.hydrate(prepared, originalData);
    // `update()` re-read the row rather than trusting the caller's document, so this is the stored pre-state.
    const previous = originalData;
    if (runSaveHooks) await this.runHooks("save", crudType, doc, "pre", previous);
    await this.runHooks(crudType, crudType, doc, "pre", previous);
    const row = this.toRow(doc);
    const stored = (originalData as Record<symbol, StoredRow | undefined>)[SqlDocumentStore.#storedRow];
    await this.#writeChanges(id, stored ?? this.toRow(originalData), row);
    await this.runHooks(crudType, crudType, doc, "post", previous);
    if (runSaveHooks) await this.runHooks("save", crudType, doc, "post", previous);
    return this.#withStoredRow(doc, row);
  }

  /**
   * Merges only the fields that changed into the stored `_doc`, so a concurrent write to another field survives. A key
   * the stored row lacks is written out, which is what `q.missing` tells rows from before a field existed apart by.
   */
  async #writeChanges(id: string, read: StoredRow, written: StoredRow) {
    const before = SqlDocumentStore.#encodedFields(read);
    const after = SqlDocumentStore.#encodedFields(written);
    const assignments = [`"updatedAt" = ?`];
    const params: unknown[] = [written.updatedAt];
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
      const merged = this.dialect.mergeDocument(set, removed);
      assignments.push(`"_doc" = ${merged.sql}`);
      params.push(...merged.params);
    }
    await this.owner
      .getConnection()
      .prepare(`UPDATE ${quoteIdent(this.table)} SET ${assignments.join(", ")} WHERE "id" = ?`)
      .run(...params, id);
  }

  // A document with no stored row — built rather than read — changes every field it holds.
  #changesOf(doc: DocumentRecord): DocumentRecord {
    const row = (doc as Record<symbol, StoredRow | undefined>)[SqlDocumentStore.#storedRow];
    if (!row) return doc;
    // Round-tripped so read-filled defaults and nested models rebuilt in declared order compare equal to themselves.
    const reread = this.hydrate(this.fromRow({ ...row, id: String(doc.id) }), undefined, { track: false });
    const read = SqlDocumentStore.#encodedFields(this.toRow(reread));
    const held = SqlDocumentStore.#encodedFields(this.toRow(doc));
    const changes: DocumentRecord = {};
    for (const field of new Set([...read.keys(), ...held.keys()]))
      if (read.get(field) !== held.get(field)) changes[field] = doc[field];
    return changes;
  }

  // Key order is left out of the comparison: jsonb stores an object's keys in an order of its own.
  static #encodedFields({ createdAt, removedAt, _doc }: StoredRow) {
    const fields = new Map(
      Object.entries(JSON.parse(_doc) as Record<string, unknown>).map(([field, value]) => [field, stableJson(value)]),
    );
    fields.set("createdAt", String(createdAt));
    fields.set("removedAt", String(removedAt ?? null));
    return fields;
  }

  #withStoredRow<Doc extends object>(doc: Doc, row: StoredRow): Doc {
    Object.defineProperty(doc, SqlDocumentStore.#storedRow, { value: row, configurable: true });
    return doc;
  }

  // Marked on both read paths: a model with a `field.secret` reads every document projected, with no stored row.
  #readAs<Doc extends object>(doc: Doc, { removedAt }: { removedAt?: unknown }): Doc {
    if (removedAt != null)
      Object.defineProperty(doc, SqlDocumentStore.#readRemoved, { value: true, configurable: true });
    return doc;
  }

  // A removed row is outside the write path's scope, where `update` would answer a misleading NoDocumentError.
  #assertLiveRow(doc: DocumentRecord) {
    if (!(doc as Record<symbol, unknown>)[SqlDocumentStore.#readRemoved]) return;
    throw new Error(
      `read-only: a removed ${this.table} is revived with updateById(id, { removedAt: null }, { withRemoved: true })`,
    );
  }

  // The document path only, as mongoose exempts `bulkWrite`; checked before save hooks so the error names the
  // caller's change, not a hook's.
  #assertImmutableUnchanged(prepared: DocumentRecord, originalData: DocumentRecord) {
    this.#immutableKeys ??= Object.entries(this.database.doc[FIELD_META] as unknown as FieldMap)
      .filter(([, fieldMeta]) => fieldMeta.getProps().immutable)
      .map(([key]) => key);
    if (!this.#immutableKeys.length) return;
    const changed = this.#immutableKeys.filter((key) => jsonStr(prepared[key]) !== jsonStr(originalData[key]));
    if (!changed.length) return;
    // The values are left out: an immutable field may also be `field.secret`.
    throw new Err(
      "base.error.immutableField",
      { field: changed.join(", ") },
      { details: { model: this.table, id: String(prepared.id) } },
    );
  }

  private decodeDocumentPayload(payload: Record<string, unknown>) {
    const fields = this.database.doc[FIELD_META] as unknown as FieldMap;
    const result: Record<string, unknown> = {};
    for (const [key, fieldMeta] of Object.entries(fields)) {
      if (BASE_COLUMNS.has(key)) continue;
      const props = fieldMeta.getProps();
      const value = payload[key];
      if (value === undefined) {
        const def = props.default;
        if (def != null) {
          result[key] = freshDefault(typeof def === "function" ? (def as (data: unknown) => unknown)(payload) : def);
        } else if (props.nullable) {
          result[key] = null;
        } else if (props.isClass && props.isScalar) {
          // A row from before the field was declared: `null` would fail the next save's own not-null check.
          result[key] = getDefault((props.modelRef as { [FIELD_META]: FieldMap })[FIELD_META] as never);
        } else {
          result[key] = SqlDocumentStore.#primitiveDefault(props);
        }
      } else {
        result[key] = this.decodeFieldValue(value, props);
      }
    }
    for (const [key, value] of Object.entries(payload)) {
      if (key in result || BASE_COLUMNS.has(key)) continue;
      const props = fields[key]?.getProps?.();
      result[key] = props ? this.decodeFieldValue(value, props) : value;
    }
    return result;
  }

  static #primitiveDefault(props: Record<string, unknown>) {
    return freshPrimitiveValue((props.modelRef as { [DEFAULT_VALUE]?: unknown } | undefined)?.[DEFAULT_VALUE]) ?? null;
  }

  private decodeFieldValue(value: unknown, props: Record<string, unknown>): unknown {
    if (value === undefined || value === null) return value;
    if (props.isMap) {
      const entries = value instanceof Map ? [...value.entries()] : Object.entries(value as Record<string, unknown>);
      return new Map(entries.map(([key, item]) => [key, this.decodeMapValue(item, props)]));
    }
    if (props.modelRef === Date) {
      if (Array.isArray(value)) return value.map((item) => (item === null ? item : decodeDateValue(item)));
      return decodeDateValue(value);
    }
    if (Array.isArray(value)) return value.map((item) => this.decodeNestedValue(item, props));
    return this.decodeNestedValue(value, props);
  }

  private decodeMapValue(value: unknown, props: Record<string, unknown>) {
    if (value === undefined || value === null) return value;
    if (props.of === Date) return decodeDateValue(value);
    return value;
  }

  private decodeNestedValue(value: unknown, props: Record<string, unknown>): unknown {
    if (!value || typeof value !== "object") return value;
    if (!props.isClass || !props.isScalar) return value;
    const scalarFields = (props.modelRef as { [FIELD_META]?: FieldMap } | undefined)?.[FIELD_META];
    if (!scalarFields) return value;
    const source = value as Record<string, unknown>;
    const defaults = getDefault(scalarFields as never) as Record<string, unknown>;
    const result: Record<string, unknown> = {};
    for (const [key, fieldMeta] of Object.entries(scalarFields)) {
      const nestedProps = fieldMeta.getProps();
      const nested = source[key];
      result[key] = nested === undefined ? defaults[key] : this.decodeFieldValue(nested, nestedProps);
    }
    for (const [key, nested] of Object.entries(source)) {
      if (!(key in result)) result[key] = nested;
    }
    return result;
  }

  private normalizeWriteValue(value: unknown, props: Record<string, unknown>): unknown {
    if (value === undefined || value === null) return value;
    if (props.modelRef === Date) {
      if (Array.isArray(value))
        return value.map((item) => (item === null || item === undefined ? item : dayjs(item as never)));
      return dayjs(value as never);
    }
    if (!props.isClass || !props.isScalar) return value;
    if (Array.isArray(value)) return value.map((item) => this.fillScalarDefaults(item, props));
    return this.fillScalarDefaults(value, props);
  }

  private fillScalarDefaults(value: unknown, props: Record<string, unknown>): unknown {
    if (!value || typeof value !== "object") return value;
    const scalarFields = (props.modelRef as { [FIELD_META]?: FieldMap } | undefined)?.[FIELD_META];
    if (!scalarFields) return value;
    const defaults = getDefault(scalarFields as never) as Record<string, unknown>;
    const result = { ...(value as Record<string, unknown>) };
    for (const [key, fieldMeta] of Object.entries(scalarFields)) {
      const nestedProps = fieldMeta.getProps();
      if (result[key] === undefined) result[key] = defaults[key];
      else result[key] = this.normalizeWriteValue(result[key], nestedProps);
    }
    return result;
  }

  /** `track` buys `isModified()` with a deep clone of the row; only the read paths opt out. */
  hydrate(data: DocumentRecord, originalData: DocumentRecord = data, { track = true }: { track?: boolean } = {}) {
    const isNew = !originalData.id;
    const hydratedData = isNew ? this.prepareDocument(data) : data;
    const doc = Object.assign(Object.create(this.#documentPrototype()), hydratedData);
    if (!track) return doc;
    Object.defineProperty(doc, MODIFICATION_STATE, {
      value: {
        isNew,
        // Cloned: `doc` shares nested objects with `hydratedData`, so an in-place push would move the baseline.
        original: JSON.parse(JSON.stringify(sanitizeJson(originalData) ?? {})) as Record<string, unknown>,
      } satisfies ModificationState,
    });
    return doc;
  }

  serialize(doc: DocumentRecord) {
    return JSON.stringify(this.toRow(doc));
  }

  deserialize(text: string) {
    return this.hydrate(this.fromRow(JSON.parse(text) as SqliteDocumentRow), undefined, { track: false });
  }

  //* One prototype per store, extending the model's own so chain methods and `instanceof` hold; methods non-enumerable.
  #documentPrototype() {
    if (this.#docPrototype) return this.#docPrototype;
    const store = this;
    this.#docPrototype = Object.create(this.database.doc.prototype, {
      set: {
        value(this: DocumentRecord, patch: DocumentRecord) {
          Object.assign(this, patch);
          return this;
        },
      },
      save: {
        async value(this: DocumentRecord) {
          if (!this.id) return store.create(this);
          store.#assertLiveRow(this);
          return store.update(this.id as string, store.#changesOf(this));
        },
      },
      refresh: {
        async value(this: DocumentRecord) {
          const fresh = (await store.pickById(this.id as string)) as DocumentRecord & Record<symbol, StoredRow>;
          Object.assign(this, fresh);
          Reflect.deleteProperty(this, SqlDocumentStore.#readRemoved);
          return store.#withStoredRow(this, fresh[SqlDocumentStore.#storedRow]);
        },
      },
      isModified: {
        value(this: DocumentRecord & { [MODIFICATION_STATE]?: ModificationState }, field?: string) {
          const state = this[MODIFICATION_STATE];
          if (!state) throw new Error(SqlDocumentStore.#untrackedModificationMessage(store.table));
          if (state.isNew) return true;
          if (!field) return JSON.stringify(sanitizeJson(this)) !== JSON.stringify(state.original);
          return JSON.stringify(sanitizeJson(this[field])) !== JSON.stringify(state.original[field]);
        },
      },
      toJSON: {
        value(this: DocumentRecord) {
          return sanitizeJson(this);
        },
      },
      toObject: {
        value(this: DocumentRecord) {
          return sanitizeJson(this);
        },
      },
    }) as object;
    return this.#docPrototype;
  }

  // Thrown, not guessed: `false` skips needed work and `true` redoes it (re-hashing a hashed password). Save hooks
  // always see a tracked document; only one straight out of a read lands here.
  static #untrackedModificationMessage(table: string) {
    return (
      `isModified() is unavailable on this ${table} document: it was loaded through a read query, which does not ` +
      `snapshot the row. Call it inside a save hook, or re-load the document through the write path (\`save()\`, ` +
      `\`update()\`) before comparing.`
    );
  }

  private async runHooks(
    saveType: "save" | "create" | "update" | "remove",
    crudType: "create" | "update" | "remove",
    doc: DocumentRecord,
    phase: "pre" | "post",
    previous?: DocumentRecord,
  ) {
    const hooks = phase === "pre" ? this.schema.preHooks.get(saveType) : this.schema.postHooks.get(saveType);
    for (const hook of hooks ?? []) {
      const run = () => hook.call(doc, () => undefined, crudType, previous);
      if (phase === "post") await this.owner.afterCommit(run);
      else await run();
    }
  }

  private insertStmt() {
    return this.prepareStmt(
      `INSERT INTO ${quoteIdent(this.table)} ("id", "createdAt", "updatedAt", "removedAt", "_doc") VALUES (?, ?, ?, ?, ${this.dialect.docValuePlaceholder()})`,
    );
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

  private assertValidRefName(refName: string) {
    if (!REF_NAME_RE.test(refName) || RESERVED_RE.test(refName))
      throw new Error(`Invalid database identifier: ${refName}`);
  }
}
