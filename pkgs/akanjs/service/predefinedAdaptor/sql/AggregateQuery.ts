import { type DocumentQuery, documentQueryHelper } from "akanjs/document";
import { DocumentStoreError } from "../../documentStoreError";
import type { QueryCompiler } from "./QueryCompiler";
import type { QueryScope } from "./QueryScope";
import { BASE_COLUMNS, type SqlDialect, type SqlFrag } from "./types";
import { quoteIdent } from "./values";

/** One field of an insight: a count, or the sum of `sum`, over the rows `condition` also matches. */
export interface AccumulatedField {
  sum?: string;
  condition?: DocumentQuery;
}

export class AggregateQuery {
  readonly #table: string;
  readonly #dialect: SqlDialect;
  readonly #compiler: QueryCompiler;
  readonly #scope: QueryScope;

  constructor(table: string, dialect: SqlDialect, compiler: QueryCompiler, scope: QueryScope) {
    this.#table = table;
    this.#dialect = dialect;
    this.#compiler = compiler;
    this.#scope = scope;
  }

  sumOf(path: string) {
    if (BASE_COLUMNS.has(path) || path.startsWith("_"))
      throw new DocumentStoreError("invalidQuery", `sum reads a model field, not "${path}"`);
    this.#compiler.fieldExpr(path);
    return this.#dialect.sumOf(path);
  }

  /** One statement answering every field over the live rows `query` matches, the n-th as column `f<n>`. */
  insight(fields: AccumulatedField[], query?: DocumentQuery): SqlFrag {
    //* A sum reads every row's document, so a condition tested on that read costs nothing more. With counts alone the
    //* read may stay inside an index, and a condition of its own may be served by another: each keeps its own read.
    const readsDocuments = fields.some(({ sum, condition }) => sum !== undefined && !condition);
    const columns = fields.map((field) => this.#column(field, query, readsDocuments));
    const select = `SELECT ${columns.map(({ sql }, idx) => `${sql} AS ${quoteIdent(`f${idx}`)}`).join(", ")}`;
    const params = columns.flatMap((column) => column.params);
    const rows = columns.find((column) => column.rows)?.rows;
    return rows ? { sql: `${select} ${rows.sql}`, params: [...params, ...rows.params] } : { sql: select, params };
  }

  #column(
    field: AccumulatedField,
    query: DocumentQuery | undefined,
    readsDocuments: boolean,
  ): SqlFrag & { rows?: SqlFrag } {
    const aggregate = field.sum === undefined ? "count(*)" : this.sumOf(field.sum);
    if (!field.condition) return { sql: aggregate, params: [], rows: this.#rows(query, field) };
    const rows = this.#rows(documentQueryHelper.all(query ?? {}, field.condition), field);
    const condition = this.#compiler.compile(field.condition);
    if (readsDocuments && field.sum === undefined && !condition.joins.length)
      return { sql: `count(*) FILTER (WHERE ${condition.where})`, params: condition.params };
    return { sql: `(SELECT ${aggregate} ${rows.sql})`, params: rows.params };
  }

  #rows(query: DocumentQuery | undefined, { sum }: AccumulatedField): SqlFrag {
    const { where, params, joins } = this.#scope.safeQuery(query, sum === undefined ? "count" : "sum", {});
    return {
      sql: `FROM ${quoteIdent(this.#table)}${this.#scope.joinSql(joins)} WHERE ${where}`,
      params: [...this.#scope.joinParams(joins), ...params],
    };
  }
}
