import { FIELD_META, ID } from "akanjs/base";
import { type DocumentQuery, type DocumentQueryNode, searchColumns } from "akanjs/document";
import { DEFAULT_SEARCH_WEIGHTS, type SearchIndex } from "../searchIndex";
import {
  BASE_COLUMNS,
  type CompileContext,
  type CompiledQuery,
  type FieldMap,
  type PathKind,
  QUERY_OPERATOR_KEYS,
  type QueryLeafOps,
  type QueryOperatorName,
  type SearchJoin,
  type SqlDialect,
} from "./types";
import { BASE_COLUMN_LEAF, quoteIdent } from "./values";

export class QueryCompiler {
  constructor(
    private readonly fields: FieldMap,
    private readonly dialect: SqlDialect,
    private readonly ref: string,
    private readonly searchIndex: () => SearchIndex | null,
  ) {}

  #leaf(path: string): QueryLeafOps {
    return BASE_COLUMNS.has(path) ? BASE_COLUMN_LEAF : this.dialect;
  }

  compile(query?: DocumentQuery): CompiledQuery {
    const joins: SearchJoin[] = [];
    if (!query || (typeof query === "object" && !Array.isArray(query) && Object.keys(query).length === 0)) {
      return { where: "1 = 1", params: [], joins };
    }
    const compiled = this.compileNode(query, { joins, conjunctive: true });
    return { where: compiled.sql || "1 = 1", params: compiled.params, joins };
  }

  // Rows the keys tie on would come back in plan order, which varies per query: a row repeats or vanishes across
  // `loadMore` pages, and a live client has no order to reproduce. `id` last, in the last key's direction, settles it.
  orderBy(sort: Record<string, 1 | -1> = { createdAt: -1 }) {
    const terms = Object.entries(sort);
    if (!terms.some(([path]) => path === "id")) terms.push(["id", terms.at(-1)?.[1] ?? -1]);
    return terms.map(([path, direction]) => this.dialect.orderTerm(this.fieldExpr(path), direction)).join(", ");
  }

  fieldExpr(path: string) {
    this.assertPath(path);
    return BASE_COLUMNS.has(path) ? quoteIdent(path) : this.dialect.extract(path, this.pathKind(path));
  }

  /** Walks declared scalar models down the path; a path through anything else is one the model does not type. */
  pathKind(path: string): PathKind {
    const [root, ...rest] = path.split(".");
    let props: Record<string, unknown> | undefined = this.fields[root]?.getProps();
    for (const segment of rest) {
      if (!props || props.isArray || !props.isClass || !props.isScalar) return "json";
      props = (props.modelRef as { [FIELD_META]?: FieldMap })[FIELD_META]?.[segment]?.getProps();
    }
    if (!props || props.isArray || props.isMap) return "json";
    if (props.modelRef === String || props.modelRef === ID) return "text";
    return props.isClass && !props.isScalar ? "text" : "json";
  }

  isArrayPath(path: string) {
    return !path.includes(".") && !!this.fields[path]?.getProps().isArray;
  }

  projectExpr(path: string) {
    this.assertPath(path);
    return BASE_COLUMNS.has(path) ? quoteIdent(path) : this.dialect.projectExpr(path);
  }

  // A search node accumulates into `ctx.joins`; a JOIN cannot express OR/NOT, so one below `any`/`not` (`conjunctive`
  // false) is rejected rather than silently widening the result.
  private compileNode(query: DocumentQuery, ctx: CompileContext): { sql: string; params: unknown[] } {
    if (this.isQueryNode(query)) {
      if (query.kind === "search") {
        if (!ctx.conjunctive)
          throw new Error(
            `Text search on "${this.ref}" must sit at an AND position; q.search() cannot be nested under q.any() or q.not().`,
          );
        const join = this.#searchJoin(query, ctx.joins.length);
        if (join) ctx.joins.push(join);
        return { sql: join ? "" : "0 = 1", params: [] };
      }
      if (query.kind === "all" || query.kind === "any") {
        const subCtx = query.kind === "all" ? ctx : { ...ctx, conjunctive: false };
        const parts = query.queries.map((sub) => this.compileNode(sub, subCtx)).filter((part) => part.sql);
        if (!parts.length) return { sql: "1 = 1", params: [] };
        const joiner = query.kind === "all" ? " AND " : " OR ";
        return {
          sql: `(${parts.map((part) => part.sql).join(joiner)})`,
          params: parts.flatMap((part) => part.params),
        };
      }
      if (query.kind === "not") {
        const part = this.compileNode(query.query, { ...ctx, conjunctive: false });
        return { sql: `NOT (${part.sql})`, params: part.params };
      }
      if (query.kind === "raw") {
        if (/[;]/.test(query.sql)) throw new Error("Raw SQL query fragments must be a single statement fragment");
        return { sql: `(${query.sql})`, params: query.params };
      }
      throw new Error("Operator nodes must be attached to a document path");
    }
    const parts = Object.entries(query).flatMap(([path, value]) => {
      if (value === undefined) throw new Error(`Undefined query value is not allowed: ${path}`);
      return [this.compileField(path, value, ctx)];
    });
    if (!parts.length) return { sql: "1 = 1", params: [] };
    return {
      sql: `(${parts.map((part) => part.sql).join(" AND ")})`,
      params: parts.flatMap((part) => part.params),
    };
  }

  #searchJoin(node: Extract<DocumentQueryNode, { kind: "search" }>, index: number): SearchJoin | null {
    const search = this.searchIndex();
    if (!search)
      throw new Error(`Text search on "${this.ref}" is unavailable: this database adaptor keeps no search index.`);
    if (!search.enabled)
      throw new Error(
        `Text search on "${this.ref}" is unavailable because the search index is switched off (AKAN_SEARCH_ENABLED).`,
      );
    const columns = node.columns?.filter((column) => searchColumns.includes(column));
    if (node.columns?.length && !columns?.length)
      throw new Error(`Unknown search column on "${this.ref}": ${node.columns.join(", ")}`);
    const weights = node.weights ?? DEFAULT_SEARCH_WEIGHTS;
    // Interpolated (bm25 takes no bind parameters), so proven numeric; a negative means nothing to a Postgres rank.
    if (weights.length !== searchColumns.length || weights.some((weight) => !Number.isFinite(weight) || weight < 0))
      throw new Error(
        `Search weights on "${this.ref}" must be ${searchColumns.length} finite, non-negative numbers: ${JSON.stringify(node.weights)}`,
      );
    const subquery = search.join({ ref: this.ref, text: node.text, prefix: !!node.prefix, columns, weights });
    // Blank input matches nothing: an unscoped fallthrough would turn a search endpoint into a full listing.
    if (!subquery) return null;
    // Only `rid`/`score` are exposed: `search_doc`'s own `title` would be ambiguous against a model's, and `rid` keeps
    // the outer `"id"` unambiguous so the base table stays un-aliased.
    const alias = `__s${index}`;
    return {
      alias,
      sql: `JOIN ${subquery.sql} ${alias} ON ${alias}."rid" = ${quoteIdent(this.ref)}."id"`,
      params: subquery.params,
    };
  }

  private compileField(path: string, value: unknown, ctx: CompileContext): { sql: string; params: unknown[] } {
    this.assertPath(path);
    const field = this.fields[path]?.getProps?.() ?? this.fields[path];
    const leaf = this.#leaf(path);
    const kind = this.pathKind(path);
    if (this.isQueryNode(value)) {
      if (value.kind !== "op") return this.compileNode({ [path]: value } as DocumentQuery, ctx);
      switch (value.op) {
        case "eq":
          return leaf.eq(path, value.value, kind);
        case "ne":
          return leaf.ne(path, value.value, kind);
        case "oneOf": {
          const values = (value.value as unknown[]) ?? [];
          if (!values.length) return { sql: "0 = 1", params: [] };
          if (field?.isArray) {
            const parts = values.map((item) => leaf.arrayHas(path, item));
            return {
              sql: `(${parts.map((part) => part.sql).join(" OR ")})`,
              params: parts.flatMap((part) => part.params),
            };
          }
          return leaf.inList(path, values, kind);
        }
        case "notOneOf": {
          const values = (value.value as unknown[]) ?? [];
          if (!values.length) return { sql: "1 = 1", params: [] };
          if (field?.isArray) {
            const parts = values.map((item) => leaf.arrayHas(path, item));
            return {
              sql: `NOT (${parts.map((part) => part.sql).join(" OR ")})`,
              params: parts.flatMap((part) => part.params),
            };
          }
          return leaf.notInList(path, values, kind);
        }
        case "gt":
        case "gte":
        case "lt":
        case "lte":
          return leaf.compare(path, value.op, value.value, kind);
        case "between": {
          const [from, to] = value.value as [unknown, unknown];
          return leaf.between(path, from, to, kind);
        }
        case "exists":
          return leaf.exists(path);
        case "missing":
          return leaf.missing(path);
        case "empty":
          return leaf.empty(path);
        case "has":
          return leaf.arrayHas(path, value.value);
        case "contains":
          return leaf.contains(path, value.value);
      }
    }
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const operators = value as Record<string, unknown>;
      const keys = Object.keys(operators);
      if (keys.some((key) => QUERY_OPERATOR_KEYS.has(key))) {
        const parts = keys.flatMap((key) => {
          if (!QUERY_OPERATOR_KEYS.has(key)) return [];
          if (key === "exists")
            return [this.compileField(path, { kind: "op", op: operators.exists ? "exists" : "missing" }, ctx)];
          if (key === "missing")
            return [this.compileField(path, { kind: "op", op: operators.missing ? "missing" : "exists" }, ctx)];
          if (key === "empty")
            return [this.compileField(path, { kind: "op", op: operators.empty ? "empty" : "exists" }, ctx)];
          return [this.compileField(path, { kind: "op", op: key as QueryOperatorName, value: operators[key] }, ctx)];
        });
        return {
          sql: `(${parts.map((part) => part.sql).join(" AND ")})`,
          params: parts.flatMap((part) => part.params),
        };
      }
    }
    if (field?.isArray && !Array.isArray(value)) return leaf.arrayHas(path, value);
    return leaf.eq(path, value, kind);
  }

  /**
   * The root segment only: a deeper typo reaches only the escaped JSON-path literal and matches nothing, while checking
   * indices, array leaves and `Map` keys would refuse working queries.
   */
  private assertPath(path: string) {
    const root = path.split(".")[0];
    if (BASE_COLUMNS.has(root)) return;
    if (!this.fields[root]) {
      // A numeric root means an executed list (a slice `exec` returning `listBy…`) was passed as a query.
      if (/^\d+$/.test(root))
        throw new Error(
          `Query received an array instead of a query object (field path "${path}"). ` +
            `A query must be a descriptor object; a slice exec must return queryBy...(...), not an executed list.`,
        );
      throw new Error(`Unknown document field path: ${path}`);
    }
  }

  private isQueryNode(value: unknown): value is DocumentQueryNode {
    return !!value && typeof value === "object" && "kind" in value;
  }
}
