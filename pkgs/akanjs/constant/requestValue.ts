import { InvalidInputError } from "./invalidInputError";

const isPlainRecord = (value: unknown): value is Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
};

//? JSON can spell a query condition's shape, so a plain object an `Any` value carries in is never read as one.
export class RequestValue {
  //? Interned: a built main.js and server.js each bundle a copy, and the parser and the query compiler may sit apart.
  static readonly #key = Symbol.for("akanjs.constant.requestValues");

  static get #values(): WeakSet<object> {
    const holder = globalThis as unknown as Record<symbol, WeakSet<object> | undefined>;
    const values = holder[RequestValue.#key] ?? new WeakSet<object>();
    holder[RequestValue.#key] = values;
    return values;
  }

  static admit(value: unknown, path: string): void {
    if (Array.isArray(value)) {
      value.forEach((item, idx) => {
        RequestValue.admit(item, `${path}.${idx}`);
      });
      return;
    }
    if (!isPlainRecord(value)) return;
    const values = RequestValue.#values;
    if (values.has(value)) return;
    if (RequestValue.#isRawSqlShaped(value)) throw new InvalidInputError(path, "a value, not a SQL condition");
    values.add(value);
    for (const [key, item] of Object.entries(value)) RequestValue.admit(item, `${path}.${key}`);
  }

  static isFrom(value: unknown): boolean {
    return !!value && typeof value === "object" && RequestValue.#values.has(value);
  }

  static #isRawSqlShaped(value: Record<string, unknown>) {
    return (
      value.kind === "raw" &&
      typeof value.sql === "string" &&
      Array.isArray(value.params) &&
      Object.keys(value).every((key) => key === "kind" || key === "sql" || key === "params")
    );
  }
}
