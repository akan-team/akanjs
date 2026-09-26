import { describe, expect, test } from "bun:test";
import { DatabaseModes } from "./databaseModes";

const resolve = (requested?: string, declared?: string, local = false) =>
  DatabaseModes.resolve({ requested, declared, local });

describe("DatabaseModes.resolve", () => {
  test("runs the named mode, and single when nothing is named or declared", () => {
    expect(resolve("cluster")).toBe("cluster");
    expect(resolve(" multiple ")).toBe("multiple");
    expect(resolve()).toBe("single");
    expect(resolve("")).toBe("single");
  });

  test("[CFG-5] refuses a name that is not a mode instead of reading it as multiple", () => {
    expect(() => resolve("clsuter")).toThrow(
      'AKAN_DATABASE_MODE must be one of single, multiple, cluster, not "clsuter"',
    );
    expect(() => resolve(undefined, "single,postgres")).toThrow("AKAN_DATABASE_MODES must be one of");
  });

  test("[CFG-1] takes a build's only mode, and makes a deployment of several name one", () => {
    expect(resolve(undefined, "cluster")).toBe("cluster");
    expect(() => resolve(undefined, "single,cluster")).toThrow("AKAN_DATABASE_MODE names neither");
    expect(resolve(undefined, "single,cluster", true)).toBe("single");
  });

  test("[CFG-2] refuses a mode the build carries no drivers for", () => {
    expect(() => resolve("cluster", "single")).toThrow('Add "cluster" to database.modes in akan.config.ts');
    expect(resolve("cluster", "single,cluster")).toBe("cluster");
  });

  test("settle answers undefined where resolve would fail", () => {
    expect(DatabaseModes.settle({ requested: "clsuter", declared: undefined, local: false })).toBeUndefined();
    expect(DatabaseModes.settle({ requested: undefined, declared: "cluster", local: false })).toBe("cluster");
  });
});
