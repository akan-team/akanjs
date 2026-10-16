/** A body value the request schema refuses: `path` names it from the argument down (`data.items.2.price`). */
export class InvalidInputError extends Error {
  readonly path: string;
  readonly reason: "missing" | "invalid";
  /** What the field takes — a type name, `object`, `array`, or the enum's values; `null` when it is missing. */
  readonly expected: string | null;
  constructor(path: string, expected: string | null) {
    super(expected ? `Invalid input at ${path}: expected ${expected}` : `Missing input at ${path}`);
    this.path = path;
    this.reason = expected ? "invalid" : "missing";
    this.expected = expected;
  }
}
