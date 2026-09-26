import { describe, expect, test } from "bun:test";
import {
  Any,
  CLIENT_VALUE,
  type Dayjs,
  dayjs,
  enumOf,
  type Float,
  type GetStateObject,
  ID,
  Int,
  type PrimitiveAgentFace,
  PrimitiveRegistry,
  PrimitiveScalar,
  SERVER_VALUE,
  Upload,
} from "akanjs/base";
import { via } from "akanjs/constant";
import { AgentValue, type AgentValueOf } from "./AgentValue";

const ReadableNote = via((f) => ({
  title: f(String),
  secretMemo: f.secret(String).optional(),
}));

class ReadableMode extends enumOf("agentValueMode", ["fit", "fill"] as const) {}

interface ReadableTextDoc {
  lines: string[];
}
class ReadableText extends PrimitiveScalar {
  static override refName = "ReadableText";
  static override [SERVER_VALUE]: ReadableTextDoc;
  static override [CLIENT_VALUE]: ReadableTextDoc;
  static override agent: PrimitiveAgentFace<ReadableTextDoc> = {
    schema: { type: "string" },
    read: (value) => value.lines.join("\n"),
  };
}
PrimitiveRegistry.register(ReadableText);

const ReadablePage = via((f) => ({ title: f(String), body: f(ReadableText) }));

describe("AgentValue.serialize", () => {
  test("scalars and enums pass through, arrays element by element", () => {
    expect(AgentValue.serialize(String, "info")).toBe("info");
    expect(AgentValue.serialize(Int, 3)).toBe(3);
    expect(AgentValue.serialize(Boolean, false)).toBe(false);
    expect(AgentValue.serialize(ReadableMode, "fit")).toBe("fit");
    expect(AgentValue.serialize([Int], [1, 2, 3])).toEqual([1, 2, 3]);
    expect(AgentValue.serialize(ID, null)).toBeNull();
    expect(AgentValue.serialize(ID, undefined)).toBeUndefined();
  });

  test("a date leaves as an ISO string whichever carrier it arrived in", () => {
    expect(AgentValue.serialize(Date, new Date("2026-08-19T00:00:00.000Z"))).toBe("2026-08-19T00:00:00.000Z");
    expect(AgentValue.serialize(Date, dayjs("2026-08-19T00:00:00.000Z"))).toBe("2026-08-19T00:00:00.000Z");
    expect(AgentValue.serialize(Date, "nonsense")).toBeNull();
  });

  test("a model type strips what the model marks secret, spread copies included", () => {
    const value = { title: "hello", secretMemo: "do not ship" };
    expect(AgentValue.serialize(ReadableNote, value)).toEqual({ title: "hello" });
    expect(AgentValue.serialize([ReadableNote], [value])).toEqual([{ title: "hello" }]);
  });

  test("a primitive declaring an agent face leaves in that face, alone, in an array, and inside a model", () => {
    expect(AgentValue.serialize(ReadableText, { lines: ["# Title", "body"] })).toBe("# Title\nbody");
    expect(AgentValue.serialize([ReadableText], [{ lines: ["a"] }, { lines: ["b"] }])).toEqual(["a", "b"]);
    expect(AgentValue.serialize(ReadableText, null)).toBeNull();
    expect(AgentValue.serialize(ReadablePage, { title: "t", body: { lines: ["x"] } })).toEqual({
      title: "t",
      body: "x",
    });
  });

  test("Any passes the value untouched — the escape hatch is not a mask", () => {
    const payload = { progress: 0.4, nested: { secretMemo: "kept" } };
    expect(AgentValue.serialize(Any, payload)).toBe(payload);
  });
});

describe("AgentValue.publishable", () => {
  test("a type nothing can read is reported and unpublished, never thrown", () => {
    const errors: string[] = [];
    const error = console.error;
    console.error = (message: unknown) => errors.push(String(message));
    try {
      expect(AgentValue.publishable('st.expose("job")', Map as never)).toBe(false);
      expect(AgentValue.publishable('st.expose("file")', Upload)).toBe(false);
      expect(AgentValue.publishable('st.expose("note")', ReadableNote)).toBe(true);
      expect(AgentValue.publishable('st.expose("text")', ReadableText)).toBe(true);
    } finally {
      console.error = error;
    }
    expect(errors[0]).toBe(
      'st.expose("job") is not published: its type is the type Map, and a readable value is a scalar, an enum, a model, or Any.',
    );
    expect(errors[1]).toBe(
      'st.expose("file") is not published: its type is the scalar Upload, which an agent cannot read: it declares no `agent` face.',
    );
  });
});

/** Invariant in both directions — a one-way check would pass a branch that narrowed to a literal union. */
type Equals<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
const pinned = <_Assertion extends true>() => true;

describe("AgentValueOf", () => {
  // `via.ts` augments the global String, Boolean, Date and Map constructors with model field metadata, so these
  // four are the ones a `FIELD_META`-first mapping silently reads as models. Nothing else here can regress alone.
  test("an augmented global constructor is its scalar, not the model its field metadata makes it look like", () => {
    expect(pinned<Equals<AgentValueOf<StringConstructor>, string>>()).toBe(true);
    expect(pinned<Equals<AgentValueOf<BooleanConstructor>, boolean>>()).toBe(true);
    expect(pinned<Equals<AgentValueOf<DateConstructor>, Dayjs | Date | string>>()).toBe(true);
  });

  test("declared scalars, enums, and Any", () => {
    expect(pinned<Equals<AgentValueOf<typeof Int>, number>>()).toBe(true);
    expect(pinned<Equals<AgentValueOf<typeof Float>, number>>()).toBe(true);
    expect(pinned<Equals<AgentValueOf<typeof ID>, string>>()).toBe(true);
    expect(pinned<Equals<AgentValueOf<typeof Any>, unknown>>()).toBe(true);
    expect(pinned<Equals<AgentValueOf<typeof ReadableText>, ReadableTextDoc>>()).toBe(true);
    expect(pinned<Equals<AgentValueOf<typeof ReadableMode>, "fit" | "fill">>()).toBe(true);
  });

  test("a model is its state object, so a hydrated document and a plain copy of one both fit", () => {
    expect(pinned<Equals<AgentValueOf<typeof ReadableNote>, GetStateObject<InstanceType<typeof ReadableNote>>>>()).toBe(
      true,
    );
    const hydrated: AgentValueOf<typeof ReadableNote> = new ReadableNote();
    const copied: AgentValueOf<typeof ReadableNote> = { ...hydrated };
    expect(copied).toEqual(hydrated);
  });

  test("an array declares an array of whatever its element declares", () => {
    expect(pinned<Equals<AgentValueOf<[StringConstructor]>, string[]>>()).toBe(true);
    expect(pinned<Equals<AgentValueOf<[typeof Int]>, number[]>>()).toBe(true);
    expect(
      pinned<Equals<AgentValueOf<[typeof ReadableNote]>, GetStateObject<InstanceType<typeof ReadableNote>>[]>>(),
    ).toBe(true);
  });
});
