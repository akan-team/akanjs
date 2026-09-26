import { describe, expect, test } from "bun:test";
import {
  CLIENT_VALUE,
  DEFAULT_VALUE,
  EXAMPLE_VALUE,
  PrimitiveRegistry,
  PrimitiveScalar,
  SERVER_VALUE,
} from "akanjs/base";
import { via } from "akanjs/constant";
import { sampleOf } from "./sampleOf";

interface SampleNoteDoc {
  lines: string[];
}
class SampleNote extends PrimitiveScalar {
  static override refName = "SampleNote";
  static override [SERVER_VALUE]: SampleNoteDoc;
  static override [CLIENT_VALUE]: SampleNoteDoc;
  static override [DEFAULT_VALUE]: SampleNoteDoc = { lines: [] };
  static override [EXAMPLE_VALUE] = "# Example";
  static override validate(value: SampleNoteDoc) {
    return Array.isArray(value.lines);
  }
  static override parseValue(input: string | SampleNoteDoc): SampleNoteDoc {
    return typeof input === "string" ? { lines: input.split("\n") } : input;
  }
}
PrimitiveRegistry.register(SampleNote);

class SampleBlank extends PrimitiveScalar {
  static override refName = "SampleBlank";
  static override [DEFAULT_VALUE] = { lines: [] };
}
PrimitiveRegistry.register(SampleBlank);

const SampleNotePage = via((f) => ({ title: f(String), note: f(SampleNote), blank: f(SampleBlank) }));

describe("sampleOf with a primitive the sample table does not know", () => {
  test("samples its example parsed as an argument would be, and falls back to a copy of its default", () => {
    const first = sampleOf(SampleNotePage) as unknown as { note: SampleNoteDoc; blank: SampleNoteDoc };
    const second = sampleOf(SampleNotePage) as unknown as { note: SampleNoteDoc; blank: SampleNoteDoc };
    expect(first.note).toEqual({ lines: ["# Example"] });
    expect(first.blank).toEqual({ lines: [] });
    expect(first.blank).not.toBe(second.blank);
  });

  test("so a required field of it purifies instead of throwing on a null", () => {
    expect(SampleNotePage.purify(sampleOf(SampleNotePage) as never)).not.toBeNull();
  });
});
