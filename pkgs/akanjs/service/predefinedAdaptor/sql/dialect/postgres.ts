import { createHash } from "node:crypto";
import type { DocumentUpdateOperator } from "akanjs/document";
import { quoteIdent } from "../../sqlDescriptor";
import type { CreateIndexProps, PathKind, SqlDialect, SqlFrag } from "../types";
import { jsonStr, likePattern } from "../values";

export class PostgresDialect implements SqlDialect {
  readonly name = "postgres" as const;
  static readonly #setFunction = "akan_jsonb_set";
  // Postgres cuts an identifier at 63 bytes, and two index names cut to one prefix make `IF NOT EXISTS` skip the second.
  static readonly #identifierBytes = 63;

  /**
   * `json_set` in SQLite creates the objects a nested path is missing and leaves the document alone when a parent is
   * not an object; `jsonb_set` returns the document untouched when a parent is missing, so a nested write vanishes.
   * A function rather than inline SQL because updates fold into one expression: reading the accumulated document
   * twice per level would repeat every earlier operation's parameters.
   */
  static schemaSetup() {
    return `CREATE OR REPLACE FUNCTION ${PostgresDialect.#setFunction}(target jsonb, path text[], value jsonb) RETURNS jsonb
      LANGUAGE plpgsql IMMUTABLE PARALLEL SAFE AS $akan$
      DECLARE
        child jsonb;
      BEGIN
        IF jsonb_typeof(target) IS DISTINCT FROM 'object' THEN
          RETURN target;
        END IF;
        IF cardinality(path) = 1 THEN
          RETURN target || jsonb_build_object(path[1], value);
        END IF;
        child := COALESCE(target -> path[1], '{}'::jsonb);
        IF jsonb_typeof(child) <> 'object' THEN
          RETURN target;
        END IF;
        RETURN target || jsonb_build_object(path[1], ${PostgresDialect.#setFunction}(child, path[2:], value));
      END
      $akan$`;
  }

  timestampType() {
    return "BIGINT";
  }
  docColumnType() {
    return "jsonb";
  }
  docColumn() {
    return quoteIdent("_doc");
  }
  // postgres.js serializes a value bound to a `jsonb` parameter itself, so the JSON text the store already built would
  // be stored as one JSON string. Bound as text, Postgres parses it.
  docValuePlaceholder() {
    return "?::text::jsonb";
  }
  #path(path: string) {
    return `'{${path
      .split(".")
      .map((part) => part.replaceAll("'", "''"))
      .join(",")}}'`;
  }
  #jsonb(path: string) {
    return `(${this.docColumn()} #> ${this.#path(path)})`;
  }
  #text(path: string) {
    return `(${this.docColumn()} #>> ${this.#path(path)})`;
  }
  // SQLite's answers are the contract — live sync's in-memory evaluator is pinned to them — so a path compares the way
  // `json_extract` reads it. A declared string reads as text in byte order, since a jsonb string follows the database
  // collation, which puts "a" before "B". Anything else stays jsonb with a stored JSON null read as SQL NULL, so a null
  // is left out of `<>`, `<` and `NOT IN`, sorts first, and does not collide in a unique index.
  #value(path: string, kind: PathKind) {
    return kind === "text" ? `(${this.#text(path)} COLLATE "C")` : `NULLIF(${this.#jsonb(path)}, 'null'::jsonb)`;
  }
  // Against a non-string operand a declared string compares as jsonb, where "5" and 5 differ — as they do in SQLite.
  #operandKind(kind: PathKind, operands: unknown[]): PathKind {
    return kind === "text" && operands.every((operand) => typeof operand === "string") ? "text" : "json";
  }
  #operand(kind: PathKind) {
    return kind === "text" ? "?" : "?::text::jsonb";
  }
  #bind(value: unknown, kind: PathKind) {
    return kind === "text" ? value : jsonStr(value);
  }
  #binary(path: string, operator: string, value: unknown, kind: PathKind): SqlFrag {
    const operandKind = this.#operandKind(kind, [value]);
    return {
      sql: `${this.#value(path, operandKind)} ${operator} ${this.#operand(operandKind)}`,
      params: [this.#bind(value, operandKind)],
    };
  }
  #list(path: string, operator: "IN" | "NOT IN", values: unknown[], kind: PathKind): SqlFrag {
    const operandKind = this.#operandKind(kind, values);
    return {
      sql: `${this.#value(path, operandKind)} ${operator} (${values.map(() => this.#operand(operandKind)).join(", ")})`,
      params: values.map((value) => this.#bind(value, operandKind)),
    };
  }
  extract(path: string, kind: PathKind = "json") {
    return this.#value(path, kind);
  }
  projectExpr(path: string) {
    return this.#jsonb(path);
  }
  // jsonb arrives as its text (`PostgresDatabase` parses it no further), so a stored string stays a string.
  decodeProjected(value: unknown) {
    return typeof value === "string" ? JSON.parse(value) : value;
  }
  eq(path: string, value: unknown, kind: PathKind = "json"): SqlFrag {
    return value === null
      ? { sql: `${this.#value(path, kind)} IS NULL`, params: [] }
      : this.#binary(path, "=", value, kind);
  }
  ne(path: string, value: unknown, kind: PathKind = "json"): SqlFrag {
    return value === null
      ? { sql: `${this.#value(path, kind)} IS NOT NULL`, params: [] }
      : this.#binary(path, "<>", value, kind);
  }
  compare(path: string, op: "gt" | "gte" | "lt" | "lte", value: unknown, kind: PathKind = "json"): SqlFrag {
    const operators = { gt: ">", gte: ">=", lt: "<", lte: "<=" } as const;
    return this.#binary(path, operators[op], value, kind);
  }
  between(path: string, from: unknown, to: unknown, kind: PathKind = "json"): SqlFrag {
    const operandKind = this.#operandKind(kind, [from, to]);
    const value = this.#value(path, operandKind);
    const operand = this.#operand(operandKind);
    return {
      sql: `(${value} >= ${operand} AND ${value} <= ${operand})`,
      params: [this.#bind(from, operandKind), this.#bind(to, operandKind)],
    };
  }
  inList(path: string, values: unknown[], kind: PathKind = "json"): SqlFrag {
    return this.#list(path, "IN", values, kind);
  }
  notInList(path: string, values: unknown[], kind: PathKind = "json"): SqlFrag {
    return this.#list(path, "NOT IN", values, kind);
  }
  exists(path: string): SqlFrag {
    return { sql: `${this.#jsonb(path)} IS NOT NULL`, params: [] };
  }
  missing(path: string): SqlFrag {
    return { sql: `${this.#jsonb(path)} IS NULL`, params: [] };
  }
  empty(path: string): SqlFrag {
    return { sql: `(${this.#jsonb(path)} IS NULL OR jsonb_typeof(${this.#jsonb(path)}) = 'null')`, params: [] };
  }
  // `@>` on a missing value is NULL, which `NOT` keeps NULL where SQLite's `EXISTS` answers false. The `AND` makes it
  // false without hiding the `@>` from a GIN index.
  arrayHas(path: string, value: unknown): SqlFrag {
    return {
      sql: `(${this.#jsonb(path)} @> ?::text::jsonb AND ${this.#jsonb(path)} IS NOT NULL)`,
      params: [jsonStr(value)],
    };
  }
  // SQLite's LIKE folds ASCII letters only. ILIKE and lower() follow the locale and would also fold "É" into "é".
  contains(path: string, value: unknown): SqlFrag {
    return {
      sql: `translate(${this.#text(path)}, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz') LIKE ? ESCAPE '\\'`,
      params: [likePattern(String(value).replace(/[A-Z]/g, (char) => char.toLowerCase()))],
    };
  }
  // SQLite sorts NULL below every value; Postgres puts it last in an ascending sort.
  orderTerm(expr: string, direction: 1 | -1) {
    return `${expr} ${direction === 1 ? "ASC NULLS FIRST" : "DESC NULLS LAST"}`;
  }
  indexName(name: string) {
    if (Buffer.byteLength(name) <= PostgresDialect.#identifierBytes) return name;
    const hash = createHash("sha256").update(name).digest("hex").slice(0, 8);
    return `${name.slice(0, PostgresDialect.#identifierBytes - hash.length - 1)}_${hash}`;
  }
  createIndex({ name, table, unique, columns, concurrently = false }: CreateIndexProps) {
    const create = `CREATE ${unique ? "UNIQUE " : ""}INDEX ${concurrently ? "CONCURRENTLY " : ""}IF NOT EXISTS ${quoteIdent(name)} ON ${quoteIdent(table)}`;
    const [column] = columns;
    // An array field is matched with `@>`, which a btree cannot serve.
    if (!unique && columns.length === 1 && column.isArray)
      return `${create} USING GIN (${this.#jsonb(column.path)} jsonb_path_ops)`;
    // `NULLS FIRST` as `orderTerm` sorts: an ascending sort scans the index forward, a descending one backward.
    return `${create} (${columns.map(({ expr }) => `${expr} NULLS FIRST`).join(", ")})`;
  }
  applyUpdate(acc: string, op: DocumentUpdateOperator, path: string, value: unknown): SqlFrag {
    const p = this.#path(path);
    // Reads target the original `_doc` column (param-free) so folding never duplicates prior placeholders; `acc` is
    // only ever the write target.
    const jsonbAt = `(${this.docColumn()}) #> ${p}`;
    const textAt = `(${this.docColumn()}) #>> ${p}`;
    const arr = `COALESCE(NULLIF(${jsonbAt}, 'null'::jsonb), '[]'::jsonb)`;
    const set = (next: string) => `${PostgresDialect.#setFunction}(${acc}, ${p}, ${next})`;
    // biome-ignore lint/suspicious/noUnnecessaryConditions: exhaustive switch over a string-literal union, not a truthiness check
    switch (op) {
      case "set":
        return { sql: set("?::text::jsonb"), params: [jsonStr(value)] };
      case "unset":
        return { sql: `(${acc}) #- ${p}`, params: [] };
      case "inc":
        return { sql: set(`to_jsonb(COALESCE((${textAt})::numeric, 0) + ?)`), params: [Number(value)] };
      case "mul":
        return { sql: set(`to_jsonb(COALESCE((${textAt})::numeric, 0) * ?)`), params: [Number(value)] };
      case "min":
        return {
          sql: set(`to_jsonb(LEAST(COALESCE((${textAt})::numeric, ?), ?))`),
          params: [Number(value), Number(value)],
        };
      case "max":
        return {
          sql: set(`to_jsonb(GREATEST(COALESCE((${textAt})::numeric, ?), ?))`),
          params: [Number(value), Number(value)],
        };
      case "push":
        return { sql: set(`${arr} || jsonb_build_array(?::text::jsonb)`), params: [jsonStr(value)] };
      case "addToSet":
        return {
          sql: set(
            `CASE WHEN ${arr} @> jsonb_build_array(?::text::jsonb) THEN ${arr} ELSE ${arr} || jsonb_build_array(?::text::jsonb) END`,
          ),
          params: [jsonStr(value), jsonStr(value)],
        };
      case "pull":
        return {
          sql: set(
            `COALESCE((SELECT jsonb_agg(elem) FROM jsonb_array_elements(${arr}) elem WHERE elem <> ?::text::jsonb), '[]'::jsonb)`,
          ),
          params: [jsonStr(value)],
        };
      case "setOnInsert":
        return { sql: acc, params: [] };
    }
  }
  // `||` replaces a top-level key whole, the way a full rewrite did, where a nested `set` would merge into it.
  mergeDocument(set: [field: string, json: string][], removed: string[]): SqlFrag {
    let sql = this.docColumn();
    const params: unknown[] = [];
    if (set.length) {
      sql = `(${sql} || ?::text::jsonb)`;
      params.push(`{${set.map(([field, json]) => `${JSON.stringify(field)}:${json}`).join(",")}}`);
    }
    for (const field of removed) {
      sql = `(${sql} - ?::text)`;
      params.push(field);
    }
    return { sql, params };
  }
  affectedRows(result: unknown): number {
    const row = result as { count?: number } | Array<unknown> | null;
    if (Array.isArray(row)) return (row as { count?: number }).count ?? row.length;
    return Number(row?.count ?? 0);
  }
}
