import {
  type DocumentQuery,
  type DocumentScopeOptions,
  type DocumentTouchOptions,
  type DocumentUpdate,
  type DocumentUpdateInput,
  type DocumentUpdateNode,
  type DocumentUpdateOptions,
  isDocumentQueryNode,
  isDocumentUpdateNode,
  resolveDocumentUpdate,
} from "akanjs/document";
import { DocumentStoreError } from "../../documentStoreError";
import type { QueryScope } from "./QueryScope";
import type { SqlDocumentStore } from "./SqlDocumentStore";
import type { DocumentDatabaseOwner, DocumentRecord, MutableDocumentRecord, SqlDialect } from "./types";
import { assertStorableJson, jsonStr, quoteIdent, stableJson } from "./values";

export class QueryWriter {
  static readonly #purgeBatchRows = 1000;
  readonly #owner: DocumentDatabaseOwner;
  readonly #store: SqlDocumentStore;
  readonly #dialect: SqlDialect;
  readonly #scope: QueryScope;

  constructor(owner: DocumentDatabaseOwner, store: SqlDocumentStore, dialect: SqlDialect, scope: QueryScope) {
    this.#owner = owner;
    this.#store = store;
    this.#dialect = dialect;
    this.#scope = scope;
  }

  async updateOne(
    query: DocumentQuery,
    update: DocumentUpdateInput,
    options: DocumentUpdateOptions,
    operation: string,
  ) {
    const resolved = resolveDocumentUpdate(update);
    const { assignments, params } = this.#compiledUpdate(resolved, options);
    const { where, params: whereParams } = this.#scope.writeQuery(query, operation, options);
    const subquery = `SELECT ${quoteIdent("id")} FROM ${quoteIdent(this.#store.table)} WHERE ${where} ORDER BY ${this.#store.compiler.orderBy()} LIMIT 1`;
    //? Postgres re-checks a row another write changed meanwhile against the outer WHERE only, never the subquery's,
    //? so the condition is repeated there or two racing writes both apply it (READ COMMITTED's EvalPlanQual).
    const sql = `UPDATE ${quoteIdent(this.#store.table)} SET ${assignments.join(", ")} WHERE ${quoteIdent("id")} IN (${subquery}) AND (${where})`;
    const changes = this.#dialect.affectedRows(
      await this.#owner
        .getConnection()
        .prepare(sql)
        .run(...params, ...whereParams, ...whereParams),
    );
    if (changes > 0) return { acknowledged: true, matchedCount: 1, modifiedCount: 1, upsertedId: null };
    if (!options.upsert) return { acknowledged: true, matchedCount: 0, modifiedCount: 0, upsertedId: null };
    const inserted = await this.#store.create(this.#applyInsertUpdate(this.#extractInsertBase(query), resolved), {
      runSaveHooks: false,
    });
    return { acknowledged: true, matchedCount: 0, modifiedCount: 1, upsertedId: inserted.id };
  }

  async updateMany(
    query: DocumentQuery,
    update: DocumentUpdateInput,
    options: DocumentScopeOptions & DocumentTouchOptions,
    operation: string,
  ) {
    const { assignments, params } = this.#compiledUpdate(resolveDocumentUpdate(update), options);
    const { where, params: whereParams } = this.#scope.writeQuery(query, operation, options);
    const sql = `UPDATE ${quoteIdent(this.#store.table)} SET ${assignments.join(", ")} WHERE ${where}`;
    const changes = this.#dialect.affectedRows(
      await this.#owner
        .getConnection()
        .prepare(sql)
        .run(...params, ...whereParams),
    );
    return { acknowledged: true, matchedCount: changes, modifiedCount: changes };
  }

  async purgeMany(query: DocumentQuery) {
    // A filter whose arguments all fell through `q.when` builds `{}`, and a purge has no undo.
    if (QueryWriter.#matchesEveryRow(query))
      throw new DocumentStoreError(
        "invalidQuery",
        `purgeManyByQuery on "${this.#store.table}" matches every row; a purge cannot be undone, so name a condition`,
      );
    const { where, params, joins } = this.#store.compiler.compile(query);
    if (joins.length)
      throw new DocumentStoreError(
        "invalidQuery",
        `q.search() cannot be used in purgeManyByQuery on "${this.#store.table}"; query-level writes take no join.`,
      );
    const table = quoteIdent(this.#store.table);
    const batch = QueryWriter.#purgeBatchRows;
    // The outer condition is repeated for Postgres's re-check of a row changed meanwhile, as in `updateOne`.
    const statement = this.#owner
      .getConnection()
      .prepare(
        `DELETE FROM ${table} WHERE ${quoteIdent("id")} IN (SELECT ${quoteIdent("id")} FROM ${table} WHERE ${where} LIMIT ${batch}) AND (${where})`,
      );
    let purged = 0;
    for (;;) {
      const changes = this.#dialect.affectedRows(await statement.run(...params, ...params));
      purged += changes;
      if (changes < batch) return purged;
      //* bun:sqlite deletes synchronously: a timer turn between batches lets this process's other requests write.
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }

  static #matchesEveryRow(query: DocumentQuery): boolean {
    if (!isDocumentQueryNode(query)) return Object.keys(query).length === 0;
    if (query.kind === "all") return query.queries.every((sub) => QueryWriter.#matchesEveryRow(sub));
    if (query.kind === "any")
      return !query.queries.length || query.queries.some((sub) => QueryWriter.#matchesEveryRow(sub));
    return false;
  }

  #compiledUpdate(update: DocumentUpdate, { touch = true }: DocumentTouchOptions = {}) {
    for (const raw of Object.values(update))
      assertStorableJson(jsonStr(isDocumentUpdateNode(raw) ? raw.value : raw), this.#store.table);
    const { assignments, params } = this.#store.updateCompiler.compile(update);
    const updatedAt = quoteIdent("updatedAt");
    if (touch) return { assignments: [`${updatedAt} = ?`, ...assignments], params: [Date.now(), ...params] };
    //? A SET needs one assignment: a write left with none still matches and counts, and changes nothing.
    return { assignments: assignments.length ? assignments : [`${updatedAt} = ${updatedAt}`], params };
  }

  #extractInsertBase(query: DocumentQuery): Record<string, unknown> {
    if (!query || typeof query !== "object" || Array.isArray(query) || isDocumentQueryNode(query)) return {};
    return Object.fromEntries(
      Object.entries(query).flatMap(([key, value]) => {
        if (["all", "any"].includes(key) || key.startsWith("$")) return [];
        if (value === null || ["string", "number", "boolean"].includes(typeof value)) return [[key, value]];
        return [];
      }),
    );
  }

  // An upsert's insert applies the update nodes in JS, having no row to mutate; `setOnInsert` applies only here.
  #applyInsertUpdate(base: DocumentRecord, update: DocumentUpdate) {
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
}
