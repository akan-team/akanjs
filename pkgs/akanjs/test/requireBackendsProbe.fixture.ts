import { expect, test } from "bun:test";
import { ConformanceEnv } from "./conformance";

const kinds = ConformanceEnv.sqlDrivers("probe");

test("probe ran", () => {
  expect(kinds).toContain("sqlite");
});
