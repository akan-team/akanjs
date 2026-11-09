import { describe, expect, test } from "bun:test";
import { AkanError } from "akanjs/base";
import { MigrationError } from "./migrationError";

describe("MigrationError", () => {
  test("is an AkanError matched by its code, with its name and message as before", () => {
    const error: unknown = new MigrationError("locked", "another run holds the migration lock");

    expect(MigrationError.is(error, "locked")).toBe(true);
    expect(MigrationError.is(error, "notApplied")).toBe(false);
    expect(AkanError.is(error, "locked")).toBe(true);
    expect(String(error)).toBe("MigrationError: another run holds the migration lock");
    expect(MigrationError.codeOf(error)).toBe("locked");
    expect(MigrationError.codeOf(new Error("disk full"))).toBe("failed");
  });

  test("keeps the code of a failure it records, and records anything else as failed", () => {
    expect(MigrationError.recorded(new MigrationError("planChanged", "plan changed"), "run-1")).toMatchObject({
      code: "planChanged",
      runId: "run-1",
    });
    const recorded = MigrationError.recorded(new Error("disk full"), "run-2");
    expect([recorded.code, recorded.message, recorded.runId]).toEqual(["failed", "disk full", "run-2"]);
  });
});
