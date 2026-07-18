import { describe, expect, test } from "bun:test";
import {
  Any,
  DEFAULT_VALUE,
  dayjs,
  EXAMPLE_VALUE,
  Float,
  ID,
  Int,
  PrimitiveRegistry,
  PrimitiveScalar,
  Upload,
} from ".";

describe("PrimitiveRegistry", () => {
  test("registers and resolves default primitive scalars", () => {
    expect(PrimitiveRegistry.get("String")).toBe(String);
    expect(PrimitiveRegistry.get("Boolean")).toBe(Boolean);
    expect(PrimitiveRegistry.get("Date")).toBe(Date);
    expect(PrimitiveRegistry.get("Int")).toBe(Int);
    expect(PrimitiveRegistry.get("Float")).toBe(Float);
    expect(PrimitiveRegistry.get("ID")).toBe(ID);
    expect(PrimitiveRegistry.get("Any")).toBe(Any);
    expect(PrimitiveRegistry.get("Upload")).toBe(Upload);

    expect(PrimitiveRegistry.getName(Int)).toBe("Int");
    expect(PrimitiveRegistry.has(Float)).toBe(true);
    expect(PrimitiveRegistry.hasName("ID")).toBe(true);
    expect(PrimitiveRegistry.getNames()).toEqual(["Int", "Float", "ID", "Any", "Upload", "String", "Boolean", "Date"]);
    expect(PrimitiveRegistry.getAll()).toContain(String);
  });

  test("rejects duplicate primitive registration unless overwritten", () => {
    class TestScalar extends PrimitiveScalar {
      static override refName = "TestScalar";
    }

    PrimitiveRegistry.register(TestScalar);

    expect(PrimitiveRegistry.get("TestScalar")).toBe(TestScalar);
    expect(() => PrimitiveRegistry.register(TestScalar)).toThrow("Scalar TestScalar already registered");

    class ReplacementScalar extends PrimitiveScalar {
      static override refName = "TestScalar";
    }

    PrimitiveRegistry.register(ReplacementScalar, { overwrite: true });
    expect(PrimitiveRegistry.get("TestScalar")).toBe(ReplacementScalar);
    expect(PrimitiveRegistry.getName(ReplacementScalar)).toBe("TestScalar");
  });

  test("throws for missing primitive lookups", () => {
    class MissingScalar extends PrimitiveScalar {
      static override refName = "MissingScalar";
    }

    expect(() => PrimitiveRegistry.get("MissingScalar")).toThrow("Scalar MissingScalar not found");
    expect(() => PrimitiveRegistry.getName(MissingScalar)).toThrow("Scalar");
  });
});

describe("primitive scalars", () => {
  test("parses, serializes, and validates Int values", () => {
    expect(Int.validate(1)).toBe(true);
    expect(Int.validate(1.5)).toBe(false);
    expect(Int.validate(Number.MAX_SAFE_INTEGER + 1)).toBe(false);
    expect(Int.parseValue("42")).toBe(42);
    expect(Int.serializeValue(42)).toBe(42);
    expect(Int._parse("42")).toBe(42);
    expect(Int._serialize(42)).toBe(42);
    expect(Int._parse(null, { optional: true })).toBeUndefined();
    expect(() => Int._parse(1.5)).toThrow("Invalid Int value: 1.5");
    expect(() => Int._serialize(null)).toThrow("Required Int value: null");
  });

  test("parses, serializes, and validates Float values", () => {
    expect(Float.validate(1.5)).toBe(true);
    expect(Float.validate(Number.POSITIVE_INFINITY)).toBe(false);
    expect(Float.parseValue("3.14")).toBe(3.14);
    expect(Float.serializeValue(3.14)).toBe(3.14);
    expect(Float._parse("3.14")).toBe(3.14);
    expect(Float._serialize(3.14)).toBe(3.14);
    expect(() => Float._parse("NaN")).toThrow("Invalid Float value: NaN");
  });

  test("validates ID values", () => {
    expect(ID.validate("1234567890abcdef12345678")).toBe(true);
    expect(ID.validate("123")).toBe(false);
    expect(ID.validate("not-a-valid-object-id")).toBe(false);
    expect(ID._parse("")).toBe("");
    expect(ID._serialize("")).toBe("");
    expect(ID.parseValue(1234567890 as never)).toBe("1234567890");
    expect(ID.serializeValue("1234567890abcdef12345678")).toBe("1234567890abcdef12345678");
    expect(() => ID._parse("not-a-valid-object-id")).toThrow("Invalid ID value: not-a-valid-object-id");
  });

  test("adds scalar helpers to String, Boolean, and Date constructors", () => {
    expect(String.refName).toBe("String");
    expect(String[DEFAULT_VALUE]).toBe("");
    expect(String[EXAMPLE_VALUE]).toBe("String");
    expect(String._parse(123 as never)).toBe("123");
    expect(String._serialize("akan")).toBe("akan");

    expect(Boolean.refName).toBe("Boolean");
    expect(Boolean[DEFAULT_VALUE]).toBe(false);
    expect(Boolean[EXAMPLE_VALUE]).toBe(true);
    expect(Boolean._parse(1 as never)).toBe(true);
    expect(Boolean._serialize(false)).toBe(false);

    const parsedDate = Date._parse("2025-01-01T00:00:00.000Z" as never);
    expect(dayjs.isDayjs(parsedDate)).toBe(true);
    expect(parsedDate.toISOString()).toBe("2025-01-01T00:00:00.000Z");
    expect(Date._serialize(parsedDate)).toEqual(new Date("2025-01-01T00:00:00.000Z"));
    expect(() => Date._parse("invalid-date" as never)).toThrow("Invalid Date value: Invalid Date");
  });

  test("exposes default metadata for object-like primitives", () => {
    expect(Any.refName).toBe("Any");
    expect(Any[DEFAULT_VALUE]).toBeNull();
    expect(Any[EXAMPLE_VALUE]).toEqual({});

    expect(Upload.refName).toBe("Upload");
    expect(Upload[DEFAULT_VALUE]).toBeNull();
    expect(Upload[EXAMPLE_VALUE]).toBe("FileUpload");
    expect(new Upload().__TEMP_TYPE__).toBe("Upload");
  });
});
