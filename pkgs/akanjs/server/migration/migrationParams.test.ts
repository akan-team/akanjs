import { describe, expect, test } from "bun:test";
import { type Dayjs, dayjs, enumOf, ID, Int } from "akanjs/base";
import { MigrationParams } from "./migrationParams";

class Policy extends enumOf("migrationPolicy", ["duplicate", "primary"] as const) {}

const declared = () => {
  const params = new MigrationParams();
  params.declare({ name: "shared", type: String, enum: ["duplicate", "primary"], default: "duplicate" });
  params.declare({ name: "policy", type: Policy, default: "primary" });
  params.declare({ name: "fallbackOrg", type: ID, nullable: true });
  params.declare({ name: "limit", type: Int, default: 100 });
  params.declare({ name: "dryRun", type: Boolean, default: false });
  params.declare({ name: "since", type: Date, nullable: true });
  return params;
};

describe("MigrationParams", () => {
  test("parses each value by its type and fills defaults, null for a nullable one left out", () => {
    const parsed = declared().parse({
      shared: "primary",
      fallbackOrg: "65f0c0ffee0000000000abcd",
      limit: "25",
      dryRun: "true",
      since: "2026-10-01",
    });
    expect(parsed).toMatchObject({
      shared: "primary",
      policy: "primary",
      fallbackOrg: "65f0c0ffee0000000000abcd",
      limit: 25,
      dryRun: true,
    });
    expect(dayjs.isDayjs(parsed.since)).toBe(true);
    expect(declared().parse({})).toEqual({
      shared: "duplicate",
      policy: "primary",
      fallbackOrg: null,
      limit: 100,
      dryRun: false,
      since: null,
    });
  });

  test("refuses a value outside its type or choices, an unknown name, and a required one left out", () => {
    expect(() => declared().parse({ limit: "1.5" })).toThrow('Param "limit" expects Int');
    expect(() => declared().parse({ shared: "split" })).toThrow('Param "shared" expects one of duplicate, primary');
    expect(() => declared().parse({ policy: "split" })).toThrow('Param "policy" expects one of duplicate, primary');
    expect(() => declared().parse({ fallbackOrg: "not-an-id" })).toThrow('Param "fallbackOrg" expects ID');
    expect(() => declared().parse({ dryRun: "yes" })).toThrow('Param "dryRun" expects Boolean');
    expect(() => declared().parse({ org: "x" })).toThrow('Unknown param "org"');
    const required = new MigrationParams();
    required.declare({ name: "org", type: ID });
    expect(() => required.parse({ org: "" })).toThrow('Param "org" is required');
  });

  test("reads a date alone as midnight UTC, and revives params a run stored as JSON", () => {
    const params = declared();
    const parsed = params.parse({ since: "2026-10-01", limit: "25" });
    expect((parsed.since as Dayjs).toISOString()).toBe("2026-10-01T00:00:00.000Z");
    const revived = params.revive(JSON.parse(JSON.stringify({ since: parsed.since, limit: 25 })));
    expect(dayjs.isDayjs(revived.since)).toBe(true);
    expect((revived.since as Dayjs).valueOf()).toBe((parsed.since as Dayjs).valueOf());
    expect(revived).toMatchObject({ limit: 25, shared: "duplicate", fallbackOrg: null });
  });

  test("refuses a malformed or repeated declaration", () => {
    const params = new MigrationParams();
    expect(() => params.declare({ name: "1st", type: String })).toThrow("must start with a letter");
    params.declare({ name: "org", type: ID });
    expect(() => params.declare({ name: "org", type: String })).toThrow("declared twice");
  });

  test("describes each param for the approval form", () => {
    expect(declared().specs().slice(0, 3)).toEqual([
      {
        name: "shared",
        type: "one of duplicate, primary",
        required: false,
        enum: ["duplicate", "primary"],
        default: "duplicate",
      },
      {
        name: "policy",
        type: "one of duplicate, primary",
        required: false,
        enum: ["duplicate", "primary"],
        default: "primary",
      },
      { name: "fallbackOrg", type: "ID", required: false },
    ]);
  });
});
