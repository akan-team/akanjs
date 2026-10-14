type JsonObject = Record<string, unknown>;

export type PipelineValueProblem =
  | { kind: "object" | "list" | "string" | "empty" | "boolean" }
  | { kind: "unknownKey"; key: string; keys: readonly string[] }
  | { kind: "missingKey"; key: string }
  | { kind: "length"; max: number }
  | { kind: "int" | "range"; min: number; max: number }
  | { kind: "oneOf"; value: unknown; options: readonly string[] };

//* One copy of the value checks for the plan schema and the input reader: `miss` throws for one, records for the other.
export class PipelineValueReader<Miss extends null> {
  static readonly #textChars = 1024;

  readonly #form: "plan" | "config";
  readonly #miss: (path: string, ...problems: PipelineValueProblem[]) => Miss;

  constructor(form: "plan" | "config", miss: (path: string, ...problems: PipelineValueProblem[]) => Miss) {
    this.#form = form;
    this.#miss = miss;
  }

  object(value: unknown, path: string, keys?: readonly string[]): JsonObject | Miss {
    if (typeof value !== "object" || value === null || Array.isArray(value))
      return this.#miss(path, { kind: "object" });
    const raw = value as JsonObject;
    const problems = keys ? this.#keyProblems(raw, keys) : [];
    return problems.length ? this.#miss(path, ...problems) : raw;
  }

  keys(raw: JsonObject, path: string, keys: readonly string[]): boolean {
    const problems = this.#keyProblems(raw, keys);
    if (problems.length) this.#miss(path, ...problems);
    return !problems.length;
  }

  list(value: unknown, path: string): unknown[] | Miss {
    return Array.isArray(value) ? value : this.#miss(path, { kind: "list" });
  }

  //? Blank text a person wrote is empty; a plan the planner wrote is read as is.
  string(
    value: unknown,
    path: string,
    max = PipelineValueReader.#textChars,
    { allowEmpty = false }: { allowEmpty?: boolean } = {},
  ): string | Miss {
    if (typeof value !== "string") return this.#miss(path, { kind: "string" });
    if (!allowEmpty && !(this.#form === "config" ? value.trim() : value)) return this.#miss(path, { kind: "empty" });
    if (value.length > max) return this.#miss(path, { kind: "length", max });
    return value;
  }

  boolean(value: unknown, path: string): boolean | Miss {
    return typeof value === "boolean" ? value : this.#miss(path, { kind: "boolean" });
  }

  int(value: unknown, path: string, min: number, max = Number.MAX_SAFE_INTEGER): number | Miss {
    if (typeof value !== "number" || !Number.isInteger(value)) return this.#miss(path, { kind: "int", min, max });
    if (value < min || value > max) return this.#miss(path, { kind: "range", min, max });
    return value;
  }

  oneOf<T extends string>(value: unknown, path: string, options: readonly T[]): T | Miss {
    if (typeof value === "string" && (options as readonly string[]).includes(value)) return value as T;
    return this.#miss(path, { kind: "oneOf", value, options });
  }

  //? The plan carries every key; in a config a key set to `undefined` is the key left out.
  #keyProblems(raw: JsonObject, keys: readonly string[]): PipelineValueProblem[] {
    const exact = this.#form === "plan";
    const unknown = Object.keys(raw).filter((key) => !keys.includes(key) && (exact || raw[key] !== undefined));
    const missing = exact ? keys.filter((key) => !(key in raw)) : [];
    return [
      ...unknown.map((key): PipelineValueProblem => ({ kind: "unknownKey", key, keys })),
      ...missing.map((key): PipelineValueProblem => ({ kind: "missingKey", key })),
    ];
  }
}
