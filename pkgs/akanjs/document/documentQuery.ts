import { type Dayjs, dayjs } from "akanjs/base";
import { isValidDate } from "akanjs/common";

export type DocumentId = string & { readonly __brand: "DocumentId" };

const documentIdProcessRandom = crypto.getRandomValues(new Uint8Array(5));
let documentIdCounter = crypto.getRandomValues(new Uint8Array(3)).reduce((count, byte) => (count << 8) + byte, 0);

const hex = (bytes: Uint8Array) => [...bytes].reduce((acc, byte) => acc + byte.toString(16).padStart(2, "0"), "");

export const createDocumentId = (now = Date.now()): DocumentId => {
  const timestampHex = Math.floor(now / 1000)
    .toString(16)
    .padStart(8, "0");
  const processHex = hex(documentIdProcessRandom);
  documentIdCounter = (documentIdCounter + 1) & 0xffffff;
  const counterHex = documentIdCounter.toString(16).padStart(6, "0");
  return `${timestampHex}${processHex}${counterHex}` as DocumentId;
};

export const isDocumentId = (value: unknown): value is DocumentId =>
  typeof value === "string" && /^[0-9a-f]{24}$/i.test(value);

export type DocumentPrimitive = string | number | boolean | null | Dayjs | Date;
export type DocumentPath<T = any> = Extract<keyof T, string> | (string & {});

// The fts5 index columns in the order `bm25()` weights them positionally. `thumb` is mirrored for rendering a hit
// but never indexed, so it is absent here.
export const searchColumns = ["title", "desc", "tag", "filter"] as const;
export type SearchColumn = (typeof searchColumns)[number];

export interface DocumentSearchOptions {
  columns?: SearchColumn[];
  prefix?: boolean;
  weights?: number[];
}

export type DocumentQueryNode =
  | { kind: "all"; queries: DocumentQuery[] }
  | { kind: "any"; queries: DocumentQuery[] }
  | { kind: "not"; query: DocumentQuery }
  | { kind: "op"; op: DocumentQueryOperator; value?: unknown }
  | { kind: "raw"; sql: string; params: unknown[] }
  | ({ kind: "search"; text: string } & DocumentSearchOptions);

/** The four real SQL columns. Everything else lives inside `_doc`, which is what makes the two compile differently. */
export const baseDocumentColumns = new Set(["id", "createdAt", "updatedAt", "removedAt"]);

const documentQueryOperators = [
  "eq",
  "ne",
  "oneOf",
  "notOneOf",
  "gt",
  "gte",
  "lt",
  "lte",
  "between",
  "exists",
  "missing",
  "empty",
  "has",
  "contains",
] as const;
export type DocumentQueryOperator = (typeof documentQueryOperators)[number];

/** The operator-object shorthand's keys: `{ status: { oneOf: [...] } }` reaches the same operators as `q.oneOf`. */
export const queryOperatorKeys = new Set<string>(documentQueryOperators);

export type DocumentQueryValue =
  | DocumentPrimitive
  | DocumentPrimitive[]
  | DocumentQueryNode
  | undefined
  | Record<string, unknown>;

// A bare value at a path is shorthand for `set(value)`; the nodes compile to one atomic JSON expression, never a
// read-modify-write.
export type DocumentUpdateOperator =
  | "set"
  | "unset"
  | "inc"
  | "mul"
  | "min"
  | "max"
  | "push"
  | "pull"
  | "addToSet"
  | "setOnInsert";

export interface DocumentUpdateNode {
  kind: "update";
  op: DocumentUpdateOperator;
  value?: unknown;
}

export type DocumentUpdateValue =
  | DocumentUpdateNode
  | DocumentPrimitive
  | DocumentPrimitive[]
  | Record<string, unknown>
  | undefined;

export type DocumentUpdate<T = any> = {
  [K in DocumentPath<T>]?: DocumentUpdateValue;
};

/** Server-only: no endpoint or slice builds it from a request, so a caller can never widen a read to removed rows. */
export interface DocumentScopeOptions {
  withRemoved?: boolean;
}

export interface DocumentUpdateOptions extends DocumentScopeOptions {
  upsert?: boolean;
}

const updateOp = (op: DocumentUpdateOperator, value?: unknown): DocumentUpdateNode => ({ kind: "update", op, value });

export const createDocumentUpdateHelper = () => ({
  set: (value: unknown) => updateOp("set", value),
  unset: () => updateOp("unset"),
  inc: (by = 1) => updateOp("inc", by),
  mul: (by: number) => updateOp("mul", by),
  min: (value: unknown) => updateOp("min", value),
  max: (value: unknown) => updateOp("max", value),
  push: (value: unknown) => updateOp("push", value),
  pull: (value: unknown) => updateOp("pull", value),
  addToSet: (value: unknown) => updateOp("addToSet", value),
  setOnInsert: (value: unknown) => updateOp("setOnInsert", value),
});

export type DocumentUpdateHelper = ReturnType<typeof createDocumentUpdateHelper>;

export const documentUpdateHelper = createDocumentUpdateHelper();

export type DocumentUpdateBuilder<T = any> = (helper: DocumentUpdateHelper) => DocumentUpdate<T>;
export type DocumentUpdateInput<T = any> = DocumentUpdate<T> | DocumentUpdateBuilder<T>;

export const resolveDocumentUpdate = <T>(update: DocumentUpdateInput<T>): DocumentUpdate<T> =>
  typeof update === "function" ? update(documentUpdateHelper) : update;

export const isDocumentUpdateNode = (value: unknown): value is DocumentUpdateNode =>
  !!value && typeof value === "object" && (value as { kind?: unknown }).kind === "update";

export type DocumentQuery<T = any> =
  | DocumentQueryNode
  | {
      [K in DocumentPath<T>]?: DocumentQueryValue;
    };

// A model may declare its own `kind` field, so `{ kind: "image" }` is a field query; only a node's whole shape is a
// node. Not a brand: framework code and callers build node literals, and a spread or JSON round trip drops a symbol.
export const isDocumentQueryNode = (value: unknown): value is DocumentQueryNode => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const node = value as Record<string, unknown>;
  const fits = (...keys: string[]) => Object.keys(node).every((key) => key === "kind" || keys.includes(key));
  switch (node.kind) {
    case "all":
    case "any":
      return Array.isArray(node.queries) && fits("queries");
    case "not":
      return !!node.query && typeof node.query === "object" && fits("query");
    case "op":
      return typeof node.op === "string" && queryOperatorKeys.has(node.op) && fits("op", "value");
    case "raw":
      return typeof node.sql === "string" && Array.isArray(node.params) && fits("sql", "params");
    case "search":
      return typeof node.text === "string" && fits("text", "columns", "prefix", "weights");
    default:
      return false;
  }
};

export interface SqlFragment {
  sql: string;
  params: unknown[];
}

const op = (op: DocumentQueryOperator, value?: unknown): DocumentQueryNode => ({ kind: "op", op, value });
const group =
  (kind: "all" | "any") =>
  (...queries: (DocumentQuery | null | undefined | false)[]): DocumentQueryNode => ({
    kind,
    queries: queries.filter(Boolean) as DocumentQuery[],
  });

export const createDocumentQueryHelper = () => ({
  all: group("all"),
  any: group("any"),
  not: (query: DocumentQuery): DocumentQueryNode => ({ kind: "not", query }),
  eq: (value: unknown) => op("eq", value),
  ne: (value: unknown) => op("ne", value),
  oneOf: (values: readonly unknown[]) => op("oneOf", [...values]),
  notOneOf: (values: readonly unknown[]) => op("notOneOf", [...values]),
  gt: (value: unknown) => op("gt", value),
  gte: (value: unknown) => op("gte", value),
  lt: (value: unknown) => op("lt", value),
  lte: (value: unknown) => op("lte", value),
  between: (from: unknown, to: unknown) => op("between", [from, to]),
  exists: (path: string) => ({ [path]: op("exists") }),
  // `missing` is key absence, not "no value": a document read back and saved carries an explicit null the read
  // materialized. `empty` covers both.
  missing: (path: string) => ({ [path]: op("missing") }),
  empty: (path: string) => ({ [path]: op("empty") }),
  has: (value: unknown) => op("has", value),
  contains: (value: unknown) => op("contains", value),
  raw: (sql: string, params: unknown[] = []): DocumentQueryNode => ({ kind: "raw", sql, params }),
  // A pure descriptor: the compiler decides whether search is available, so a filter still builds with it off.
  search: (text: string, options: DocumentSearchOptions = {}): DocumentQueryNode => ({
    kind: "search",
    text,
    ...options,
  }),
  when: (condition: unknown, query: DocumentQuery): DocumentQuery => (condition ? query : {}),
});

export type DocumentQueryHelper = ReturnType<typeof createDocumentQueryHelper>;

export const documentQueryHelper = createDocumentQueryHelper();

export const encodeDocumentValue = (value: unknown): unknown => {
  if (value === undefined || value === null) return value;
  if (dayjs.isDayjs(value)) return value.valueOf();
  if (value instanceof Date) return value.getTime();
  if (Array.isArray(value)) return value.map(encodeDocumentValue);
  if (typeof value === "object") return JSON.stringify(sanitizeJson(value));
  return value;
};

export const sanitizeJson = (value: unknown): unknown => {
  if (value === undefined || value === null) return value;
  if (dayjs.isDayjs(value)) return value.valueOf();
  if (value instanceof Date) return value.getTime();
  if (value instanceof Map)
    return Object.fromEntries([...value.entries()].map(([key, val]) => [key, sanitizeJson(val)]));
  if (Array.isArray(value)) return value.map(sanitizeJson).filter((item) => item !== undefined);
  if (typeof value !== "object") return value;
  const entries = Object.entries(value as Record<string, unknown>).flatMap(([key, val]) => {
    if (["__proto__", "constructor", "prototype"].includes(key)) {
      throw new Error(`Unsafe JSON key: ${key}`);
    }
    const sanitized = sanitizeJson(val);
    return sanitized === undefined ? [] : [[key, sanitized] as const];
  });
  return Object.fromEntries(entries);
};

const convertOperatorValue = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map((v) => convertOperatorValue(v));
  if (!value) return value;
  if (isValidDate(value as Date)) return dayjs(value as Date).valueOf();
  if (typeof value !== "object" || value.constructor !== Object) return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, value]) => [key, convertOperatorValue(value)]),
  );
};
export const convertAggregateMatch = (query: unknown) =>
  Object.fromEntries(
    Object.entries(query as Record<string, unknown>).map(([key, value]) => [key, convertOperatorValue(value)]),
  );
