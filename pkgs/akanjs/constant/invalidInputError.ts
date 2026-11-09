import { AkanError } from "akanjs/base";

/** A body value the request schema refuses: `path` names it from the argument down (`data.items.2.price`). */
export class InvalidInputError extends AkanError<"missingInput" | "invalidInput"> {
  readonly path: string;
  readonly reason: "missing" | "invalid";
  /** What the field takes — a type name, `object`, `array`, or the enum's values; `null` when it is missing. */
  readonly expected: string | null;
  constructor(path: string, expected: string | null) {
    super(
      expected ? "invalidInput" : "missingInput",
      expected ? `Invalid input at ${path}: expected ${expected}` : `Missing input at ${path}`,
      { statusCode: 400 },
    );
    this.path = path;
    this.reason = expected ? "invalid" : "missing";
    this.expected = expected;
  }
}
