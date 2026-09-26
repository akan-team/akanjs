import type { InArgs, InValue } from "@libsql/client";
import { dayjs } from "akanjs/base";
import { encodeDocumentValue, sanitizeJson } from "akanjs/document";
import { quoteIdent } from "../sqlDescriptor";
import type { QueryLeafOps } from "./types";

export const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value) && !(value instanceof Buffer);
export const toLibsqlValue = (value: unknown): InValue => {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "bigint" ||
    typeof value === "boolean" ||
    value instanceof Date ||
    value instanceof Uint8Array ||
    value instanceof ArrayBuffer
  ) {
    return value;
  }
  if (value instanceof Buffer) return new Uint8Array(value);
  return JSON.stringify(value);
};
export const toLibsqlArgs = (params: unknown[]): InArgs => {
  if (params.length === 1 && isPlainObject(params[0])) {
    return Object.fromEntries(Object.entries(params[0]).map(([key, value]) => [key, toLibsqlValue(value)]));
  }
  return params.map(toLibsqlValue);
};
export const toPostgresSql = (sql: string, params: unknown[]) => {
  if (params.length === 1 && isPlainObject(params[0])) {
    const named = params[0];
    const values: unknown[] = [];
    const text = sql.replace(/\$[A-Za-z_][A-Za-z0-9_]*/g, (token) => {
      values.push(named[token.slice(1)]);
      return `$${values.length}`;
    });
    return { sql: text, params: values };
  }
  let index = 0;
  return {
    sql: sql.replace(/\?/g, () => `$${++index}`),
    params,
  };
};
export const encodeSqlValue = (value: unknown) => encodeDocumentValue(value);
// Dates are persisted as epoch ms, but legacy rows may hold ISO strings; accept both.
export const decodeDateValue = (value: unknown) => {
  if (value === null || value === undefined) return value;
  if (typeof value === "number") return dayjs(value);
  const epoch = Number(value);
  return Number.isNaN(epoch) ? dayjs(value as never) : dayjs(epoch);
};

export const jsonStr = (value: unknown) => JSON.stringify(sanitizeJson(value) ?? null);

// JSON.stringify writes U+0000 as `\u0000`; behind an odd run of backslashes the same six characters are text.
const nulEscape = /(?<!\\)(?:\\\\)*\\u0000/;

/** Postgres refuses U+0000 inside jsonb, so every mode refuses it — one app stores the same thing in each. */
export const assertStorableJson = (json: string, table: string) => {
  if (nulEscape.test(json))
    throw new Error(
      `Cannot store a string holding U+0000 (NUL) in "${table}": Postgres refuses it inside jsonb, so no database mode stores one`,
    );
  return json;
};

// `%` and `_` in the searched text are the text, not wildcards; both dialects are told `\` escapes them.
export const likePattern = (value: unknown) => `%${String(value).replace(/[\\%_]/g, (char) => `\\${char}`)}%`;

export const BASE_COLUMN_LEAF: QueryLeafOps = {
  eq: (path, value) =>
    value === null
      ? { sql: `${quoteIdent(path)} IS NULL`, params: [] }
      : { sql: `${quoteIdent(path)} = ?`, params: [encodeSqlValue(value)] },
  ne: (path, value) =>
    value === null
      ? { sql: `${quoteIdent(path)} IS NOT NULL`, params: [] }
      : { sql: `${quoteIdent(path)} != ?`, params: [encodeSqlValue(value)] },
  compare: (path, op, value) => {
    const operators = { gt: ">", gte: ">=", lt: "<", lte: "<=" } as const;
    return { sql: `${quoteIdent(path)} ${operators[op]} ?`, params: [encodeSqlValue(value)] };
  },
  between: (path, from, to) => ({
    sql: `(${quoteIdent(path)} >= ? AND ${quoteIdent(path)} <= ?)`,
    params: [encodeSqlValue(from), encodeSqlValue(to)],
  }),
  inList: (path, values) => ({
    sql: `${quoteIdent(path)} IN (${values.map(() => "?").join(", ")})`,
    params: values.map(encodeSqlValue),
  }),
  notInList: (path, values) => ({
    sql: `${quoteIdent(path)} NOT IN (${values.map(() => "?").join(", ")})`,
    params: values.map(encodeSqlValue),
  }),
  exists: (path) => ({ sql: `${quoteIdent(path)} IS NOT NULL`, params: [] }),
  missing: (path) => ({ sql: `${quoteIdent(path)} IS NULL`, params: [] }),
  empty: (path) => ({ sql: `${quoteIdent(path)} IS NULL`, params: [] }),
  arrayHas: (path, value) => ({
    sql: `EXISTS (SELECT 1 FROM json_each(${quoteIdent(path)}) WHERE json_each.value = ?)`,
    params: [encodeSqlValue(value)],
  }),
  contains: (path, value) => ({ sql: `${quoteIdent(path)} LIKE ? ESCAPE '\\'`, params: [likePattern(value)] }),
};
