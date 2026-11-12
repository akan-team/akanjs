import type { Logger } from "akanjs/common";
import type { ConstantModel } from "akanjs/constant";
import type { DatabaseModel, DocumentIndexDescriptor, DocumentQuery, DocumentSchema } from "akanjs/document";
import { DocumentStoreError } from "../../documentStoreError";
import type { QueryCompiler } from "./QueryCompiler";
import {
  type CreateIndexProps,
  type DocumentDatabaseOwner,
  REF_NAME_RE,
  RESERVED_RE,
  type SqlDialect,
  toSafeRefName,
} from "./types";
import { descriptorHash, inlineParams, quoteIdent } from "./values";

interface DeclaredIndex {
  name: string;
  next: string;
  metaKey: string;
  /** The name it is built under instead while an index made outside akan holds `name`. */
  aside: string;
  hash: string;
  /** Every descriptor that declares this very index, so a copy an earlier release built under any of them serves it. */
  hashes: Set<string>;
  props: Omit<CreateIndexProps, "name">;
  create: (name: string, concurrently: boolean) => string;
}

interface StaleIndex {
  name: string;
  metaKey: string;
  exists: boolean;
}

export interface SqlTableSchemaOptions {
  owner: DocumentDatabaseOwner;
  table: string;
  schema: DocumentSchema;
  constant: ConstantModel;
  database: DatabaseModel;
  dialect: SqlDialect;
  compiler: QueryCompiler;
  logger: Logger;
}

export class SqlTableSchema {
  readonly #owner: DocumentDatabaseOwner;
  readonly #table: string;
  readonly #schema: DocumentSchema;
  readonly #constant: ConstantModel;
  readonly #database: DatabaseModel;
  readonly #dialect: SqlDialect;
  readonly #compiler: QueryCompiler;
  readonly #logger: Logger;
  #ensured: Promise<void> | null = null;

  constructor({ owner, table, schema, constant, database, dialect, compiler, logger }: SqlTableSchemaOptions) {
    this.#owner = owner;
    this.#table = table;
    this.#schema = schema;
    this.#constant = constant;
    this.#database = database;
    this.#dialect = dialect;
    this.#compiler = compiler;
    this.#logger = logger;
  }

  // One shared run: two concurrent `CREATE TABLE IF NOT EXISTS` on one name are a duplicate-key error in Postgres.
  ensure() {
    this.#ensured ??= this.#ensure();
    return this.#ensured;
  }

  async #ensure() {
    this.#assertValidRefName(this.#table);
    const declared = await this.#declaredIndexes();
    for (const index of this.#schema.indexes) if (!SqlTableSchema.#builds(index)) this.#warnUnbuilt(index);
    const createSchema = async () => {
      const db = this.#owner.getConnection();
      const existed = !!this.#owner.buildIndexConcurrently && !!(await this.#owner.hasTable?.(this.#table));
      const ts = this.#dialect.timestampType();
      await db.execute(
        `CREATE TABLE IF NOT EXISTS ${quoteIdent(this.#table)} (
        "id" TEXT PRIMARY KEY NOT NULL,
        "createdAt" ${ts} NOT NULL,
        "updatedAt" ${ts} NOT NULL,
        "removedAt" ${ts},
        "_doc" ${this.#dialect.docColumnType()} NOT NULL
      )`,
      );
      await this.#owner.grantInsight?.(this.#table);
      await this.#owner.setMeta(
        `table:${this.#table}`,
        await descriptorHash({ table: this.#table, columns: ["id", "createdAt", "updatedAt", "removedAt", "_doc"] }),
      );
      const { indexes, adopted, stale } = await this.#reconcileIndexes(declared);
      const concurrent: (DeclaredIndex & { replace: boolean })[] = [];
      for (const index of indexes) {
        if (adopted.has(index.name)) continue;
        const stored = await this.#owner.getMeta(index.metaKey);
        const replace = !!stored && !index.hashes.has(stored);
        if (replace)
          this.#logger.warn(
            `Index ${index.name} on ${this.#table} changed its descriptor and is rebuilt; on a large table that is a full index build`,
          );
        if (existed && !replace && (await this.#owner.hasValidIndex?.(index.name))) {
          await this.#owner.setMeta(index.metaKey, index.hash);
          continue;
        }
        if (existed) {
          concurrent.push({ ...index, replace });
          continue;
        }
        if (replace) await this.#replaceIndex(index);
        else await db.execute(index.create(index.name, false));
        await this.#owner.setMeta(index.metaKey, index.hash);
      }
      const drops: StaleIndex[] = [];
      for (const index of stale) {
        if (!index.exists) await this.#owner.deleteMeta(index.metaKey);
        else if (this.#owner.dropIndexConcurrently) drops.push(index);
        else await this.#dropStaleIndex(index);
      }
      return { concurrent, drops };
    };
    const { concurrent, drops } = this.#owner.lockSchema
      ? await this.#owner.lockSchema(createSchema)
      : await createSchema();
    for (const { name, next, create, replace, metaKey, hash } of concurrent) {
      await this.#owner.buildIndexConcurrently?.({ name, next, create: (target) => create(target, true), replace });
      await this.#owner.setMeta(metaKey, hash);
    }
    for (const index of drops) await this.#dropStaleIndex(index);
    await this.#owner.getSearchIndex()?.ensureRef(this.#constant, this.#database);
  }

  static #builds(index: DocumentIndexDescriptor) {
    return Object.values(index.fields).every((order) => order === 1 || order === -1);
  }

  // Named by what it indexes, never by position: a name that moved when an index was added rebuilt every later one.
  async #declaredIndexes(): Promise<DeclaredIndex[]> {
    const candidates = await Promise.all(
      this.#schema.indexes.filter(SqlTableSchema.#builds).map(async (descriptor) => {
        const paths = Object.keys(descriptor.fields);
        const base =
          descriptor.name ??
          [this.#table, ...paths.map(toSafeRefName), ...(descriptor.unique ? ["unique"] : [])].join("_");
        const columns = paths.map((path) => ({
          path,
          expr: this.#compiler.fieldExpr(path),
          isArray: this.#compiler.isArrayPath(path),
        }));
        const predicate = descriptor.where ? this.#indexPredicate(descriptor.where, base) : undefined;
        const props = { table: this.#table, unique: !!descriptor.unique, columns, where: predicate };
        const create = (target: string, concurrently: boolean) =>
          this.#dialect.createIndex({ ...props, name: target, concurrently });
        const definition = create("", false);
        return {
          named: !!descriptor.name,
          base,
          definition,
          // Hashed with the predicate: before a `where` reached the DDL, the same descriptor built a whole index.
          hash: await descriptorHash(predicate ? { ...descriptor, predicate } : descriptor),
          suffix: (await descriptorHash(definition)).slice(0, 8),
          props,
          create,
        };
      }),
    );
    const definitionsOf = new Map<string, Set<string>>();
    for (const { base, definition } of candidates)
      definitionsOf.set(base, (definitionsOf.get(base) ?? new Set()).add(definition));
    const namedDefinitions = new Set(candidates.filter(({ named }) => named).map(({ definition }) => definition));
    const indexes = new Map<string, DeclaredIndex>();
    for (const { named, base, definition, hash, suffix, props, create } of candidates) {
      if (!named && namedDefinitions.has(definition)) continue;
      // Two different indexes claiming one name: a named one keeps it, an automatic one adds what tells it apart.
      const shared = (definitionsOf.get(base)?.size ?? 0) > 1;
      if (
        named &&
        shared &&
        candidates.some((other) => other.named && other.base === base && other.definition !== definition)
      )
        throw new DocumentStoreError("invalidSchema", `Two different indexes on ${this.#table} are both named ${base}`);
      const declared = named || !shared ? base : `${base}_${suffix}`;
      this.#assertValidRefName(declared);
      const naming = this.#indexNamed(declared);
      const existing = indexes.get(naming.name);
      if (existing) {
        existing.hashes.add(hash);
        continue;
      }
      indexes.set(naming.name, {
        ...naming,
        aside: `${declared}_${suffix}`,
        hash,
        hashes: new Set([hash]),
        props,
        create,
      });
    }
    return [...indexes.values()];
  }

  #indexNamed(declared: string) {
    const name = this.#dialect.indexName(declared);
    return { name, next: this.#dialect.indexName(`${declared}_next`), metaKey: `index:${this.#table}:${name}` };
  }

  // Only an index whose meta key says an earlier boot built it is adopted or dropped; one made by hand has none.
  async #reconcileIndexes(declared: DeclaredIndex[]) {
    const prefix = `index:${this.#table}:`;
    const { sql, params } = this.#dialect.indexesOf(this.#table);
    const rows = await this.#owner
      .getConnection()
      .prepare(sql)
      .all<{ name: string; valid: unknown; definition: string }>(...params);
    const physical = new Map(rows.map(({ name, valid, definition }) => [name, { valid: !!valid, definition }]));
    const recorded = (await this.#owner.listMeta(prefix))
      .map(({ key, value }) => ({ name: key.slice(prefix.length), metaKey: key, hash: value }))
      .sort((a, b) => a.name.localeCompare(b.name));
    const recordedNames = new Set(recorded.map(({ name }) => name));
    const copiesOf = (index: DeclaredIndex, among = recorded) =>
      among.filter(({ name, hash }) => index.hashes.has(hash) && physical.get(name)?.valid);
    const unrecorded = declared.filter(({ name }) => !recordedNames.has(name));
    const holds = await this.#definitionMatcher(
      unrecorded.filter((index) => physical.has(index.name) || copiesOf(index).length),
      physical,
    );
    // Unrecorded under a declared name, an index is taken only as that very index: a boot may stop before recording it.
    const indexes = declared.map((index) => {
      if (recordedNames.has(index.name) || !physical.has(index.name) || holds(index.name, index)) return index;
      const aside = { ...index, ...this.#indexNamed(index.aside) };
      this.#logger.warn(
        `Index ${index.name} on ${this.#table} was not built by akan and differs from the declared one, so it is left alone and the declared index is built as ${aside.name}`,
      );
      return aside;
    });
    const names = new Set(indexes.map(({ name }) => name));
    const undeclared = recorded.filter(({ name }) => !names.has(name));
    // SQLite cannot rename an index, so a copy an earlier release built under its positional name serves on unrebuilt.
    const kept = new Set<string>();
    const adopted = new Set<string>();
    for (const index of indexes) {
      if (recordedNames.has(index.name) || physical.has(index.name)) continue;
      const copy = copiesOf(index, undeclared).find(({ name }) => !kept.has(name) && holds(name, index));
      if (!copy) continue;
      kept.add(copy.name);
      adopted.add(index.name);
    }
    const stale: StaleIndex[] = undeclared
      .filter(({ name }) => !kept.has(name))
      .map(({ name, metaKey }) => ({ name, metaKey, exists: physical.has(name) }));
    return { indexes, adopted, stale };
  }

  // A descriptor hash ignores field order, so only the definition the database holds tells two indexes apart.
  async #definitionMatcher(indexes: DeclaredIndex[], physical: Map<string, { definition: string }>) {
    const props = indexes.map((index) => index.props);
    const probed =
      this.#dialect.indexDefinition || !props.length ? [] : await this.#owner.indexDefinitions?.(this.#table, props);
    const definitions = new Map(indexes.map(({ hash }, idx) => [hash, probed?.[idx]]));
    return (name: string, index: DeclaredIndex) => {
      const definition = this.#dialect.indexDefinition?.({ ...index.props, name }) ?? definitions.get(index.hash);
      return definition !== undefined && physical.get(name)?.definition === definition;
    };
  }

  // An index no declaration builds costs only its upkeep on writes, so failing to drop it must not fail the boot.
  async #dropStaleIndex({ name, metaKey }: StaleIndex) {
    try {
      if (this.#owner.dropIndexConcurrently) await this.#owner.dropIndexConcurrently(name);
      else await this.#owner.getConnection().execute(`DROP INDEX IF EXISTS ${quoteIdent(name)}`);
      await this.#owner.deleteMeta(metaKey);
      this.#logger.info(`Dropped index ${name} on ${this.#table}, which no declaration builds any more`);
    } catch (error) {
      this.#logger.warn(
        `Index ${name} on ${this.#table} is no longer declared, and dropping it failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  #indexPredicate(where: DocumentQuery, name: string) {
    const { where: sql, params, joins, memberTests } = this.#compiler.compile(where);
    if (joins.length)
      throw new DocumentStoreError(
        "invalidSchema",
        `Index ${name} on ${this.#table} filters with q.search(), which an index predicate cannot hold`,
      );
    // SQLite holds no subquery in an index predicate, so every mode refuses a member test: one app boots in each.
    if (memberTests.length)
      throw new DocumentStoreError(
        "invalidSchema",
        `Index ${name} on ${this.#table} tests ${memberTests.join(", ")} for a member (q.has()), which an index predicate cannot hold`,
      );
    return sql === "1 = 1" ? undefined : inlineParams(sql, params);
  }

  #warnUnbuilt(index: DocumentIndexDescriptor) {
    const paths = Object.keys(index.fields);
    this.#logger.warn(
      `Index ${JSON.stringify(index.fields)} on ${this.#table} is not built: only 1 and -1 order a key, and "text" is ` +
        `MongoDB's text index, which as a B-tree would copy each whole value and fail long writes on Postgres. Search ` +
        `${paths.join(", ")} through the full-text role, field(String, { text: "desc" }), or declare ` +
        `{ ${paths[0]}: 1 } to look it up by equality.`,
    );
  }

  // In one transaction, so a new definition the rows refuse — a `unique` over duplicates — leaves the old index.
  async #replaceIndex(index: DeclaredIndex) {
    const rebuild = async () => {
      const db = this.#owner.getConnection();
      await db.execute(`DROP INDEX IF EXISTS ${quoteIdent(index.name)}`);
      await db.execute(index.create(index.name, false));
    };
    if (this.#owner.transaction) await this.#owner.transaction(rebuild);
    else await rebuild();
  }

  #assertValidRefName(refName: string) {
    if (!REF_NAME_RE.test(refName) || RESERVED_RE.test(refName))
      throw new DocumentStoreError("invalidSchema", `Invalid database identifier: ${refName}`);
  }
}
