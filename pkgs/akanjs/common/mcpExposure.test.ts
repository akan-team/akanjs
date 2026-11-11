import { describe, expect, test } from "bun:test";
import { mcpHintsOf } from "./mcpExposure";

describe("mcpHintsOf", () => {
  const mutation = { type: "mutation" };
  const destructiveOf = (key: string, endpoint: { type: string; destructive?: boolean } = mutation) =>
    mcpHintsOf(key, endpoint).destructiveHint;

  for (const key of [
    "removeOrder",
    "deleteOrder",
    "purgeOrders",
    "destroyOrder",
    "eraseOrder",
    "wipeOrders",
    "dropOrder",
    "cancelOrder",
    "bulkRemoveOrders",
    "bulkDeleteOrders",
  ])
    test(`reads ${key} as destructive`, () => expect(destructiveOf(key)).toBe(true));

  test("leaves an ordinary write alone", () => {
    expect(destructiveOf("renameOrder")).toBe(false);
    expect(destructiveOf("archiveOrder")).toBe(false);
  });

  test("lets the endpoint's own declaration override its key, either way", () => {
    expect(destructiveOf("archiveOrder", { ...mutation, destructive: true })).toBe(true);
    expect(destructiveOf("dropOffOrder", { ...mutation, destructive: false })).toBe(false);
  });

  test("never calls a query destructive, whatever it declares", () => {
    expect(destructiveOf("removeOrder", { type: "query", destructive: true })).toBe(false);
  });
});
