import type { DocumentUpdateOperator } from "akanjs/document";
import { jsonPath, quoteIdent } from "../../sqlDescriptor";
import type { CreateIndexProps, SqlDialect, SqlFrag } from "../types";
import { encodeSqlValue, jsonStr, likePattern } from "../values";

export class SqliteDialect implements SqlDialect {
  readonly name = "sqlite" as const;
  timestampType() {
    return "INTEGER";
  }
  docColumnType() {
    return "TEXT";
  }
  docColumn() {
    return quoteIdent("_doc");
  }
  docValuePlaceholder() {
    return "?";
  }
  #path(path: string) {
    return `'${jsonPath(path).replaceAll("'", "''")}'`;
  }
  extract(path: string) {
    return `json_extract(${this.docColumn()}, ${this.#path(path)})`;
  }
  // A projected column is read back as a value, not compared, so it must keep its JSON type. `json_extract`
  // unwraps a scalar into a SQL value — a string field holding '{"a":1}' comes back indistinguishable from an
  // object, and a boolean comes back as 0/1 — while `->` yields the value's JSON text, which `decodeProjected`
  // parses back into exactly what was stored.
  projectExpr(path: string) {
    return `${this.docColumn()} -> ${this.#path(path)}`;
  }
  decodeProjected(value: unknown) {
    return typeof value === "string" ? JSON.parse(value) : value;
  }
  eq(path: string, value: unknown): SqlFrag {
    return value === null
      ? { sql: `${this.extract(path)} IS NULL`, params: [] }
      : { sql: `${this.extract(path)} = ?`, params: [encodeSqlValue(value)] };
  }
  ne(path: string, value: unknown): SqlFrag {
    return value === null
      ? { sql: `${this.extract(path)} IS NOT NULL`, params: [] }
      : { sql: `${this.extract(path)} != ?`, params: [encodeSqlValue(value)] };
  }
  compare(path: string, op: "gt" | "gte" | "lt" | "lte", value: unknown): SqlFrag {
    const operators = { gt: ">", gte: ">=", lt: "<", lte: "<=" } as const;
    return { sql: `${this.extract(path)} ${operators[op]} ?`, params: [encodeSqlValue(value)] };
  }
  between(path: string, from: unknown, to: unknown): SqlFrag {
    return {
      sql: `(${this.extract(path)} >= ? AND ${this.extract(path)} <= ?)`,
      params: [encodeSqlValue(from), encodeSqlValue(to)],
    };
  }
  inList(path: string, values: unknown[]): SqlFrag {
    return {
      sql: `${this.extract(path)} IN (${values.map(() => "?").join(", ")})`,
      params: values.map(encodeSqlValue),
    };
  }
  notInList(path: string, values: unknown[]): SqlFrag {
    return {
      sql: `${this.extract(path)} NOT IN (${values.map(() => "?").join(", ")})`,
      params: values.map(encodeSqlValue),
    };
  }
  exists(path: string): SqlFrag {
    return { sql: `json_type(${this.docColumn()}, ${this.#path(path)}) IS NOT NULL`, params: [] };
  }
  missing(path: string): SqlFrag {
    return { sql: `json_type(${this.docColumn()}, ${this.#path(path)}) IS NULL`, params: [] };
  }
  empty(path: string): SqlFrag {
    const type = `json_type(${this.docColumn()}, ${this.#path(path)})`;
    return { sql: `(${type} IS NULL OR ${type} = 'null')`, params: [] };
  }
  arrayHas(path: string, value: unknown): SqlFrag {
    return {
      sql: `EXISTS (SELECT 1 FROM json_each(${this.extract(path)}) WHERE json_each.value = ?)`,
      params: [encodeSqlValue(value)],
    };
  }
  contains(path: string, value: unknown): SqlFrag {
    return { sql: `${this.extract(path)} LIKE ? ESCAPE '\\'`, params: [likePattern(value)] };
  }
  orderTerm(expr: string, direction: 1 | -1) {
    return `${expr} ${direction === 1 ? "ASC" : "DESC"}`;
  }
  indexName(name: string) {
    return name;
  }
  createIndex({ name, table, unique, columns }: CreateIndexProps) {
    return `CREATE ${unique ? "UNIQUE " : ""}INDEX IF NOT EXISTS ${quoteIdent(name)} ON ${quoteIdent(table)} (${columns.map(({ expr }) => expr).join(", ")})`;
  }
  applyUpdate(acc: string, op: DocumentUpdateOperator, path: string, value: unknown): SqlFrag {
    const p = this.#path(path);
    // Current values are read from the original `_doc` column (param-free), never from the accumulator, so folding
    // never duplicates prior placeholders. All operators in one update therefore observe the pre-update document.
    const cur = `json_extract(${this.docColumn()}, ${p})`;
    const arr = `COALESCE(${cur}, json('[]'))`;
    // biome-ignore lint/suspicious/noUnnecessaryConditions: exhaustive switch over a string-literal union, not a truthiness check
    switch (op) {
      case "set":
        return { sql: `json_set(${acc}, ${p}, json(?))`, params: [jsonStr(value)] };
      case "unset":
        return { sql: `json_remove(${acc}, ${p})`, params: [] };
      case "inc":
        return { sql: `json_set(${acc}, ${p}, COALESCE(${cur}, 0) + ?)`, params: [Number(value)] };
      case "mul":
        return { sql: `json_set(${acc}, ${p}, COALESCE(${cur}, 0) * ?)`, params: [Number(value)] };
      case "min":
        return { sql: `json_set(${acc}, ${p}, MIN(COALESCE(${cur}, ?), ?))`, params: [Number(value), Number(value)] };
      case "max":
        return { sql: `json_set(${acc}, ${p}, MAX(COALESCE(${cur}, ?), ?))`, params: [Number(value), Number(value)] };
      case "push":
        return { sql: `json_set(${acc}, ${p}, json_insert(${arr}, '$[#]', json(?)))`, params: [jsonStr(value)] };
      case "addToSet":
        return {
          sql: `json_set(${acc}, ${p}, CASE WHEN EXISTS (SELECT 1 FROM json_each(${arr}) WHERE json_each.value = ?) THEN ${arr} ELSE json_insert(${arr}, '$[#]', json(?)) END)`,
          params: [encodeSqlValue(value), jsonStr(value)],
        };
      case "pull":
        return {
          sql: `json_set(${acc}, ${p}, (SELECT json_group_array(json_each.value) FROM json_each(${arr}) WHERE json_each.value <> ?))`,
          params: [encodeSqlValue(value)],
        };
      case "setOnInsert":
        return { sql: acc, params: [] };
    }
  }
  mergeDocument(set: [field: string, json: string][], removed: string[]): SqlFrag {
    let sql = this.docColumn();
    if (set.length) sql = `json_set(${sql}, ${set.map(([field]) => `${this.#path(field)}, json(?)`).join(", ")})`;
    if (removed.length) sql = `json_remove(${sql}, ${removed.map((field) => this.#path(field)).join(", ")})`;
    return { sql, params: set.map(([, json]) => json) };
  }
  affectedRows(result: unknown): number {
    const row = result as { changes?: number | bigint; rowsAffected?: number } | null;
    return Number(row?.changes ?? row?.rowsAffected ?? 0);
  }
}
