import { describe, expect, test } from "bun:test";
import type { DatabaseMode } from "akanjs";
import type { AdaptorCls } from "akanjs/service";
import { collectPredefinedDependencies, getPredefinedAdaptor, predefinedAdaptorRole } from "./predefinedAdaptor";
import { resolveAdaptorHierarchy } from "./resolveAdaptorHierarchy";

// Registers a mode's adaptor set the way `DiLifecycle` does before any service asks for more — which is all a mode
// has to boot on. Ids are from `local/database-modes/`.
const resolveMode = (mode: DatabaseMode) => {
  const adaptors = getPredefinedAdaptor(mode);
  const adaptorMap = new Map<string, AdaptorCls>(
    [...Object.values(adaptors), ...collectPredefinedDependencies(adaptors)].map((adaptor) => [
      adaptor.refName,
      adaptor,
    ]),
  );
  const roles = new Map<AdaptorCls, AdaptorCls>(
    Object.entries(predefinedAdaptorRole).map(([key, role]) => [role, adaptors[key as keyof typeof adaptors]]),
  );
  return () => resolveAdaptorHierarchy(adaptorMap, roles);
};

describe("predefined adaptors per database mode", () => {
  test("single resolves on its own", () => {
    expect(resolveMode("single")).not.toThrow();
  });

  test("[M-0] multiple resolves on its own", () => {
    expect(resolveMode("multiple")).not.toThrow();
  });

  test("[M-0] cluster resolves on its own", () => {
    expect(resolveMode("cluster")).not.toThrow();
  });

  test("[D1] multiple opens the same SQLite as single, and only cluster moves the database", () => {
    expect(getPredefinedAdaptor("multiple").database).toBe(getPredefinedAdaptor("single").database);
    expect(getPredefinedAdaptor("cluster").database).not.toBe(getPredefinedAdaptor("single").database);
  });

  test("[CFG-5] a mode name that is not one of the three is refused", () => {
    expect(() => getPredefinedAdaptor("clsuter" as DatabaseMode)).toThrow();
    expect(() => getPredefinedAdaptor("" as DatabaseMode)).toThrow();
  });
});
