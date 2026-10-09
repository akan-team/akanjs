import type { DocumentUpdateOperator } from "akanjs/document";
import type { CreateIndexProps, SqlDialect, SqlFrag } from "../types";
import { encodeSqlValue, jsonPath, jsonStr, likePattern, quoteIdent } from "../values";

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
  // `json_extract` would unwrap a string holding '{"a":1}' into an object and a boolean into 0/1; `->` keeps the JSON
  // text, which `decodeProjected` parses back exactly.
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
    // Reads target the param-free original `_doc`, so every operator of one update sees the pre-update document.
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
    return Number((result as { changes?: number | bigint } | null)?.changes ?? 0);
  }
}
