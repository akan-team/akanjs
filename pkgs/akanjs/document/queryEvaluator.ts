import {
  baseDocumentColumns,
  type DocumentQuery,
  type DocumentQueryNode,
  type DocumentQueryOperator,
  encodeDocumentValue,
  queryOperatorKeys,
  sanitizeJson,
} from "./documentQuery";

/**
 * A document as the database stores it: base columns as written, everything else inside one JSON payload.
 *
 * Membership is evaluated against this rather than against a hydrated model because that is what the SQL the
 * evaluator has to agree with actually reads. A hydrated instance has already had defaults filled, dates turned
 * back into `Dayjs`, and absent optional keys materialized as `undefined` — every one of which changes an answer.
 */
export interface DocumentRowView {
  id: unknown;
  createdAt: unknown;
  updatedAt: unknown;
  removedAt: unknown;
  doc: Record<string, unknown>;
}

/** Only `isArray` is read; the shape matches the field metadata `QueryCompiler` holds. */
export type QueryFieldMap = Record<string, { getProps?: () => Record<string, unknown> } & Record<string, unknown>>;

interface PathValue {
  /** `json_type(...) IS NOT NULL` — the key is in the stored JSON, whatever it holds. */
  present: boolean;
  /** What `json_extract(...)` yields: a SQL scalar, or JSON text for an object or array. */
  value: unknown;
  /** The value before `json_extract` flattening. `json_each` iterates this one. */
  raw: unknown;
}

/**
 * Answers "does this document match this query" in memory, reproducing what the SQL compiler would have asked the
 * database. Live sync routes a change to the rooms whose query it belongs to, and asking the database once per room
 * is not a thing that can be afforded on a write path.
 *
 * Every rule here mirrors a specific SQLite behaviour rather than a reasonable JavaScript reading of the same
 * operator, because the only property that matters is agreeing with `QueryCompiler` — a disagreement shows up as a
 * list that is quietly wrong, never as an error. `queryEvaluator.parity.test.ts` asks both and compares.
 */
export class DocumentQueryEvaluator {
  readonly #fields: QueryFieldMap;

  constructor(fields: QueryFieldMap = {}) {
    this.#fields = fields;
  }

  /**
   * Why this query cannot be evaluated in memory, or null when it can.
   *
   * Three things are genuinely out of reach. `raw` carries SQL only the database can run, and `search` compiles to
   * an fts5 JOIN whose bm25 ranking has no in-memory equivalent. `exists`/`missing` on a `_doc` field ask whether
   * the key is in the stored JSON at all, and a document read back has already had every declared nullable field
   * materialized as `null` (`SqlDocumentStore.decodeDocumentPayload`) — so a value in hand cannot tell an absent
   * key from a stored null, and answering anyway would be wrong for exactly the rows the operator exists to find.
   * `empty` covers both cases and is evaluable, which is the operator the guide already directs callers to.
   *
   * Callers decide what to do about it — this reports, it does not throw, because refusing a boot is a policy the
   * signal layer owns.
   */
  static unevaluableReason(query: DocumentQuery | undefined): string | null {
    if (!query || typeof query !== "object") return null;
    if (DocumentQueryEvaluator.#isNode(query)) {
      if (query.kind === "raw") return "q.raw() carries SQL that only the database can run";
      if (query.kind === "search") return "q.search() compiles to a full-text JOIN with no in-memory equivalent";
      if (query.kind === "all" || query.kind === "any")
        return query.queries.reduce<string | null>(
          (found, sub) => found ?? DocumentQueryEvaluator.unevaluableReason(sub),
          null,
        );
      if (query.kind === "not") return DocumentQueryEvaluator.unevaluableReason(query.query);
      return null;
    }
    return Object.entries(query).reduce<string | null>(
      (found, [path, value]) => found ?? DocumentQueryEvaluator.#unevaluableField(path, value),
      null,
    );
  }

  static #unevaluableField(path: string, value: unknown): string | null {
    if (!value || typeof value !== "object") return null;
    if (baseDocumentColumns.has(path)) return null;
    const keyAbsence = `${path}: exists/missing asks whether the key is in the stored JSON, which a document in hand cannot answer — use q.empty()`;
    if (DocumentQueryEvaluator.#isNode(value)) {
      if (value.kind === "op") return value.op === "exists" || value.op === "missing" ? keyAbsence : null;
      return DocumentQueryEvaluator.unevaluableReason(value as DocumentQuery);
    }
    const operators = value as Record<string, unknown>;
    // `empty: false` is the compiler's spelling of `exists`, so it asks the same unanswerable question.
    if ("exists" in operators || "missing" in operators || ("empty" in operators && !operators.empty))
      return keyAbsence;
    return DocumentQueryEvaluator.unevaluableReason(value as DocumentQuery);
  }

  /** Splits a saved document into the row shape above, mirroring `SqlDocumentStore.toRow`. */
  static rowViewOf(doc: Record<string, unknown>): DocumentRowView {
    const payload = { ...doc };
    delete payload.id;
    delete payload.createdAt;
    delete payload.updatedAt;
    delete payload.removedAt;
    return {
      id: doc.id ?? null,
      createdAt: doc.createdAt === undefined ? null : Number(encodeDocumentValue(doc.createdAt)),
      updatedAt: doc.updatedAt === undefined ? null : Number(encodeDocumentValue(doc.updatedAt)),
      removedAt: doc.removedAt ? Number(encodeDocumentValue(doc.removedAt)) : null,
      doc: (sanitizeJson(payload) ?? {}) as Record<string, unknown>,
    };
  }

  evaluate(query: DocumentQuery | undefined, row: DocumentRowView): boolean {
    if (!query || typeof query !== "object") return true;
    if (DocumentQueryEvaluator.#isNode(query)) return this.#node(query, row);
    const entries = Object.entries(query);
    if (!entries.length) return true;
    return entries.every(([path, value]) => this.#field(path, value, row));
  }

  #node(node: DocumentQueryNode, row: DocumentRowView): boolean {
    switch (node.kind) {
      // An empty `all`/`any` compiles to `1 = 1`, so both are vacuously true rather than following boolean algebra.
      case "all":
        return !node.queries.length || node.queries.every((sub) => this.evaluate(sub, row));
      case "any":
        return !node.queries.length || node.queries.some((sub) => this.evaluate(sub, row));
      case "not":
        return !this.evaluate(node.query, row);
      case "raw":
      case "search":
        throw new Error(`Query cannot be evaluated in memory: ${DocumentQueryEvaluator.unevaluableReason(node)}`);
      case "op":
        throw new Error("Operator nodes must be attached to a document path");
    }
  }

  #field(path: string, value: unknown, row: DocumentRowView): boolean {
    if (DocumentQueryEvaluator.#isNode(value)) {
      if (value.kind !== "op") return this.evaluate({ [path]: value } as DocumentQuery, row);
      return this.#operator(path, value.op, value.value, row);
    }
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const operators = value as Record<string, unknown>;
      const keys = Object.keys(operators);
      if (keys.some((key) => queryOperatorKeys.has(key))) {
        return keys
          .filter((key) => queryOperatorKeys.has(key))
          .every((key) => {
            // These three carry a boolean that selects the operator rather than a value to compare against.
            if (key === "exists") return this.#operator(path, operators.exists ? "exists" : "missing", undefined, row);
            if (key === "missing")
              return this.#operator(path, operators.missing ? "missing" : "exists", undefined, row);
            if (key === "empty") return this.#operator(path, operators.empty ? "empty" : "exists", undefined, row);
            return this.#operator(path, key as DocumentQueryOperator, operators[key], row);
          });
      }
    }
    // A bare value on an array field means membership, not equality — the same shorthand the compiler applies.
    if (this.#isArrayField(path) && !Array.isArray(value)) return this.#operator(path, "has", value, row);
    return this.#operator(path, "eq", value, row);
  }

  #operator(path: string, op: DocumentQueryOperator, operand: unknown, row: DocumentRowView): boolean {
    const isBase = baseDocumentColumns.has(path);
    const read = this.#read(path, row);
    switch (op) {
      case "eq":
        return operand === null ? read.value === null : DocumentQueryEvaluator.#equals(read.value, operand);
      case "ne":
        // `x != ?` is NULL, and therefore not true, when x is NULL — only the `IS NOT NULL` form matches a null.
        if (operand === null) return read.value !== null;
        return read.value !== null && !DocumentQueryEvaluator.#equals(read.value, operand);
      case "gt":
      case "gte":
      case "lt":
      case "lte": {
        const order = DocumentQueryEvaluator.#compare(read.value, DocumentQueryEvaluator.#encode(operand));
        if (order === null) return false;
        return op === "gt" ? order > 0 : op === "gte" ? order >= 0 : op === "lt" ? order < 0 : order <= 0;
      }
      case "between": {
        const [from, to] = (operand as [unknown, unknown]) ?? [];
        const low = DocumentQueryEvaluator.#compare(read.value, DocumentQueryEvaluator.#encode(from));
        const high = DocumentQueryEvaluator.#compare(read.value, DocumentQueryEvaluator.#encode(to));
        return low !== null && high !== null && low >= 0 && high <= 0;
      }
      case "oneOf": {
        const values = (operand as unknown[]) ?? [];
        if (!values.length) return false;
        if (this.#isArrayField(path)) return values.some((item) => this.#has(read, item));
        return read.value !== null && values.some((item) => DocumentQueryEvaluator.#equals(read.value, item));
      }
      case "notOneOf": {
        const values = (operand as unknown[]) ?? [];
        if (!values.length) return true;
        if (this.#isArrayField(path)) return !values.some((item) => this.#has(read, item));
        return read.value !== null && !values.some((item) => DocumentQueryEvaluator.#equals(read.value, item));
      }
      case "exists":
      case "missing": {
        // A base column is always in the row, so this is the plain null check the compiler emits. Off the base
        // columns it is key absence, which `unevaluableReason` refuses ahead of time rather than guessing here.
        if (!isBase)
          throw new Error(
            `Query cannot be evaluated in memory: ${DocumentQueryEvaluator.#unevaluableField(path, { kind: "op", op })}`,
          );
        return op === "exists" ? read.value !== null : read.value === null;
      }
      case "empty":
        // A stored JSON null is present but empty, which is why this is not the same question as `missing`.
        return isBase ? read.value === null : !read.present || read.value === null;
      case "has":
        return this.#has(read, operand);
      case "contains":
        // SQLite's `LIKE` folds ASCII letters only, so "É" and "é" stay apart; `%` and `_` are escaped, not wildcards.
        return (
          read.value !== null &&
          DocumentQueryEvaluator.#foldAscii(String(read.value)).includes(
            DocumentQueryEvaluator.#foldAscii(String(operand)),
          )
        );
    }
  }

  /** `EXISTS (SELECT 1 FROM json_each(<extract>) WHERE value = ?)` — an object iterates its values, a scalar itself. */
  #has(read: PathValue, operand: unknown): boolean {
    const { raw } = read;
    if (raw === null || raw === undefined) return false;
    const items = Array.isArray(raw)
      ? raw
      : typeof raw === "object"
        ? Object.values(raw as Record<string, unknown>)
        : [raw];
    return items.some((item) => DocumentQueryEvaluator.#equals(DocumentQueryEvaluator.#extract(item), operand));
  }

  #read(path: string, row: DocumentRowView): PathValue {
    if (baseDocumentColumns.has(path)) {
      const value = (row as unknown as Record<string, unknown>)[path] ?? null;
      return { present: value !== null, value, raw: value };
    }
    let current: unknown = row.doc;
    for (const segment of path.split(".")) {
      // `json_extract(_doc, '$.list.0')` is an object-key lookup that finds nothing in an array — SQLite spells an
      // index `[0]`, which no path built from a dotted field name ever produces. Deep array paths match nothing.
      if (current === null || current === undefined || typeof current !== "object" || Array.isArray(current))
        return { present: false, value: null, raw: undefined };
      if (!(segment in (current as Record<string, unknown>))) return { present: false, value: null, raw: undefined };
      current = (current as Record<string, unknown>)[segment];
    }
    if (current === undefined) return { present: false, value: null, raw: undefined };
    return { present: true, value: DocumentQueryEvaluator.#extract(current), raw: current };
  }

  #isArrayField(path: string): boolean {
    const field = this.#fields[path.split(".")[0]];
    const props = field?.getProps?.() ?? field;
    return !!props?.isArray;
  }

  /** What `json_extract` yields for a stored value: booleans collapse to 1/0, containers come back as JSON text. */
  static #extract(value: unknown): unknown {
    if (value === undefined || value === null) return null;
    if (typeof value === "boolean") return value ? 1 : 0;
    if (typeof value === "object") return JSON.stringify(value);
    return value;
  }

  /** A query operand as the compiler binds it — dates to epoch ms, containers to JSON text. */
  static #encode(operand: unknown): unknown {
    const encoded = encodeDocumentValue(operand);
    if (typeof encoded === "boolean") return encoded ? 1 : 0;
    if (encoded === undefined) return null;
    return encoded;
  }

  static #equals(value: unknown, operand: unknown): boolean {
    return DocumentQueryEvaluator.#compare(value, DocumentQueryEvaluator.#encode(operand)) === 0;
  }

  /**
   * SQLite's ordering: NULL sorts below every number, which sorts below every text. Comparing across those classes
   * is never equal, so a query on a field holding the wrong type matches nothing rather than coercing its way to a
   * match the way JavaScript's `<` would.
   */
  static #compare(left: unknown, right: unknown): number | null {
    const leftClass = DocumentQueryEvaluator.#classOf(left);
    const rightClass = DocumentQueryEvaluator.#classOf(right);
    if (leftClass === 0 || rightClass === 0) return null;
    if (leftClass !== rightClass) return leftClass < rightClass ? -1 : 1;
    if (leftClass === 1) return Number(left) === Number(right) ? 0 : Number(left) < Number(right) ? -1 : 1;
    return DocumentQueryEvaluator.#compareText(String(left), String(right));
  }

  static #classOf(value: unknown): 0 | 1 | 2 {
    if (value === null || value === undefined) return 0;
    if (typeof value === "number" || typeof value === "bigint") return 1;
    if (typeof value === "boolean") return 1;
    return 2;
  }

  /**
   * By code point, which is exactly UTF-8 byte order and therefore SQLite's BINARY collation. JavaScript's own `<`
   * compares UTF-16 code units, which puts supplementary-plane characters below U+E000 instead of above it.
   */
  static #compareText(left: string, right: string): number {
    const leftPoints = [...left];
    const rightPoints = [...right];
    const shared = Math.min(leftPoints.length, rightPoints.length);
    for (let idx = 0; idx < shared; idx += 1) {
      const a = leftPoints[idx].codePointAt(0) ?? 0;
      const b = rightPoints[idx].codePointAt(0) ?? 0;
      if (a !== b) return a < b ? -1 : 1;
    }
    return leftPoints.length === rightPoints.length ? 0 : leftPoints.length < rightPoints.length ? -1 : 1;
  }

  static #foldAscii(text: string) {
    return text.replace(/[A-Z]/g, (char) => char.toLowerCase());
  }

  static #isNode(value: unknown): value is DocumentQueryNode {
    return !!value && typeof value === "object" && "kind" in value;
  }
}
