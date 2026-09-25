import { beforeAll, describe, expect, test } from "bun:test";
import { Any, dayjs, Float, Int, type PrimitiveScalar } from "akanjs/base";
import { ConstantRegistry, via } from "akanjs/constant";
import { ProtobufCompressor } from "./compress.adaptor";

const NestedScalar = via((f) => ({
  label: f(String),
  point: f(Int),
}));
ConstantRegistry.buildScalar("ServiceCompressNestedScalar", NestedScalar, { NestedScalar });

const TestScalar = via((f) => ({
  name: f(String),
  age: f(Int),
  score: f(Float),
  active: f(Boolean),
  tags: f([String]),
  nested: f(NestedScalar),
  nestedList: f([NestedScalar]),
  meta: f(Map, { of: String }),
  nestedMap: f(Map, { of: NestedScalar as unknown as typeof PrimitiveScalar }),
}));
ConstantRegistry.buildScalar("ServiceCompressTestScalar", TestScalar, { TestScalar });

const Compressor = new ProtobufCompressor();

beforeAll(async () => {
  await Compressor.onInit();
});

const expectBuffer = (buffer: Buffer | null) => {
  expect(buffer).toBeInstanceOf(Buffer);
  if (!buffer) throw new Error("Expected compressor to return a buffer");
  return buffer;
};

describe("Compressor", () => {
  describe("encode/decode primitives (arrDepth=0)", () => {
    test("String", () => {
      const buf = expectBuffer(Compressor.encode(String, 0, "hello"));
      const decoded = Compressor.decode<string>(String, 0, buf);
      expect(decoded).toBe("hello");
    });

    test("Int", () => {
      const buf = expectBuffer(Compressor.encode(Int, 0, 42));
      const decoded = Compressor.decode<number>(Int, 0, buf);
      expect(decoded).toBe(42);
    });

    test("Float", () => {
      const buf = expectBuffer(Compressor.encode(Float, 0, 3.14));
      const decoded = Compressor.decode<number>(Float, 0, buf);
      expect(decoded).toBeCloseTo(3.14, 2);
    });

    test("Boolean", () => {
      const buf = expectBuffer(Compressor.encode(Boolean, 0, true));
      const decoded = Compressor.decode<boolean>(Boolean, 0, buf);
      expect(decoded).toBe(true);
    });

    test("Date", () => {
      const now = dayjs("2025-01-01T00:00:00Z");
      const buf = expectBuffer(Compressor.encode(Date, 0, now));
      const decoded = Compressor.decode<Date>(Date, 0, buf);
      expect(dayjs(decoded).toISOString()).toBe(now.toISOString());
    });

    test("Any (JSON object)", () => {
      const obj = { key: "value", nested: { a: 1 } };
      const buf = expectBuffer(Compressor.encode(Any, 0, obj));
      const decoded = Compressor.decode(Any, 0, buf);
      expect(decoded).toEqual(obj);
    });
  });

  describe("encode/decode array of primitives (arrDepth=1)", () => {
    test("[String]", () => {
      const values = ["hello", "world", "test"];
      const buf = expectBuffer(Compressor.encode(String, 1, values));
      const decoded = Compressor.decode<string[]>(String, 1, buf);
      expect(decoded).toEqual(values);
    });

    test("[Int]", () => {
      const values = [1, 2, 3, 100];
      const buf = expectBuffer(Compressor.encode(Int, 1, values));
      const decoded = Compressor.decode<number[]>(Int, 1, buf);
      expect(decoded).toEqual(values);
    });

    test("[Boolean]", () => {
      const values = [true, false, true];
      const buf = expectBuffer(Compressor.encode(Boolean, 1, values));
      const decoded = Compressor.decode<boolean[]>(Boolean, 1, buf);
      expect(decoded).toEqual(values);
    });

    test("empty array", () => {
      const buf = expectBuffer(Compressor.encode(String, 1, []));
      const decoded = Compressor.decode<string[]>(String, 1, buf);
      expect(decoded).toEqual([]);
    });
  });

  describe("encode/decode ConstantCls (arrDepth=0, delegates)", () => {
    test("round-trips through encode/decode", () => {
      const original = new TestScalar({
        name: "bob",
        age: 25,
        score: 8.0,
        active: false,
        tags: ["one", "two"],
        nested: { label: "nested", point: 1 },
        nestedList: [
          { label: "a", point: 2 },
          { label: "b", point: 3 },
        ],
      } as never);
      Object.defineProperty(original, "meta", { value: new Map([["locale", "ko"]]), configurable: true });
      Object.defineProperty(original, "nestedMap", {
        value: new Map([["home", new NestedScalar({ label: "home", point: 4 })]]),
        configurable: true,
      });
      const buf = expectBuffer(Compressor.encode(TestScalar, 0, original));
      const decoded = Compressor.decode<typeof original>(TestScalar, 0, buf, { raw: true }) as typeof original & {
        nestedList: InstanceType<typeof NestedScalar>[];
        meta: Map<string, string>;
      };
      const nestedMapHome = (decoded.nestedMap as Map<string, { label: string; point: number }>).get("home");
      expect(decoded.name).toBe("bob");
      expect(decoded.age).toBe(25);
      expect(decoded.active).toBe(false);
      expect(decoded.tags).toEqual(["one", "two"]);
      expect(decoded.nested.label).toBe("nested");
      expect(decoded.nestedList[1]?.point).toBe(3);
      expect(decoded.meta.get("locale")).toBe("ko");
      expect(nestedMapHome?.point).toBe(4);
    });
  });

  describe("encode/decode array of ConstantCls (arrDepth=1)", () => {
    test("[TestScalar]", () => {
      const items = [
        new TestScalar({
          name: "alice",
          age: 30,
          score: 9.5,
          active: true,
          tags: [],
          nested: { label: "n1", point: 1 },
          nestedList: [],
          meta: {} as never,
          nestedMap: {} as never,
        } as never),
        new TestScalar({
          name: "bob",
          age: 25,
          score: 8.0,
          active: false,
          tags: [],
          nested: { label: "n2", point: 2 },
          nestedList: [],
          meta: {} as never,
          nestedMap: {} as never,
        } as never),
      ];
      const buf = expectBuffer(Compressor.encode(TestScalar, 1, items));
      const decoded = Compressor.decode<(typeof items)[0][]>(TestScalar, 1, buf);
      expect(decoded).toHaveLength(2);
      expect(decoded[0]?.name).toBe("alice");
      expect(decoded[0]?.age).toBe(30);
      expect(decoded[1]?.name).toBe("bob");
      expect(decoded[1]?.active).toBe(false);
    });

    test("empty model array", () => {
      const buf = expectBuffer(Compressor.encode(TestScalar, 1, []));
      const decoded = Compressor.decode<InstanceType<typeof TestScalar>[]>(TestScalar, 1, buf);
      expect(decoded).toEqual([]);
    });
  });
});
