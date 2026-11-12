import { type DocumentQuery, type DocumentScopeOptions, documentQueryHelper, LiveRowScope } from "akanjs/document";
import { DocumentStoreError } from "../../documentStoreError";
import type { QueryCompiler } from "./QueryCompiler";
import type { FindManyOptions, SearchJoin, SortOption } from "./types";
import { quoteIdent } from "./values";

export class QueryScope {
  readonly #table: string;
  readonly #compiler: QueryCompiler;

  constructor(table: string, compiler: QueryCompiler) {
    this.#table = table;
    this.#compiler = compiler;
  }

  listQuery(query: DocumentQuery | undefined, options: FindManyOptions, operation = "find") {
    const { where, params, joins } = this.safeQuery(query, operation, options);
    const limitValue = Number(options.limit ?? 0);
    const skipValue = Number(options.skip ?? 0);
    const order = options.sample ? "ORDER BY random()" : `ORDER BY ${this.#orderBy(options.sort, joins)}`;
    const page = `${limitValue ? ` LIMIT ${limitValue}` : ""}${skipValue ? ` OFFSET ${skipValue}` : ""}`;
    return {
      // A bare `*` would drag the join subquery's `rid`/`score` into the row.
      star: joins.length ? `${quoteIdent(this.#table)}.*` : "*",
      tail: `FROM ${quoteIdent(this.#table)}${this.joinSql(joins)} WHERE ${where} ${order}${page}`,
      args: [...this.joinParams(joins), ...params],
    };
  }

  safeQuery(query: DocumentQuery | undefined, operation: string, { withRemoved = false }: DocumentScopeOptions) {
    if (withRemoved) {
      const compiled = this.#compiler.compile(query ?? {});
      // The search mirror drops a row when it is removed, so the join would silently leave every removed row out.
      if (compiled.joins.length)
        throw new DocumentStoreError("invalidQuery", `q.search() cannot see removed rows on "${this.#table}"`);
      return compiled;
    }
    const conflict = LiveRowScope.conflictOf(query);
    if (conflict)
      throw new DocumentStoreError(
        "invalidQuery",
        `${operation} on "${this.#table}" can never match (${conflict}); ${operation.startsWith("remove") ? "a remove reaches live rows only" : "pass { withRemoved: true }"}`,
      );
    return this.#compiler.compile(documentQueryHelper.all(documentQueryHelper.empty("removedAt"), query ?? {}));
  }

  // An atomic write has no join for the search; ignoring it would widen the write to every other match.
  writeQuery(query: DocumentQuery | undefined, operation: string, options: DocumentScopeOptions) {
    const compiled = this.safeQuery(query, operation, options);
    if (compiled.joins.length)
      throw new DocumentStoreError(
        "invalidQuery",
        `q.search() cannot be used in ${operation} on "${this.#table}"; query-level writes take no join.`,
      );
    return compiled;
  }

  joinSql(joins: SearchJoin[]) {
    return joins.length ? ` ${joins.map((join) => join.sql).join(" ")}` : "";
  }

  // The JOIN precedes the WHERE in the text, so its bindings go first; a wrong order raises nothing, just wrong rows.
  joinParams(joins: SearchJoin[]) {
    return joins.flatMap((join) => join.params);
  }

  // Scores sort best-first ascending (bm25 is negative; Postgres negates its rank), `id` keeping paging stable on ties.
  // An explicit sort wins; `relevance` arrives as an empty sort map.
  #orderBy(sort: SortOption, joins: SearchJoin[]) {
    const explicit = sort && Object.keys(sort).length ? sort : null;
    if (!explicit && joins.length) return `${joins[0].alias}."score", ${quoteIdent(this.#table)}."id" DESC`;
    return this.#compiler.orderBy(explicit ?? undefined);
  }
}
