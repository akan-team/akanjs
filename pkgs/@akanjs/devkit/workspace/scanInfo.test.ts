import { describe, expect, test } from "bun:test";
import { LibInfo } from "./scanInfo";

const deps: Record<string, string[]> = {
  zeta: [],
  alpha: ["zeta", "mid"],
  mid: ["zeta"],
  beta: [],
  omega: ["alpha", "mid", "zeta"],
};
const insertionOrders = [
  ["zeta", "alpha", "mid", "beta", "omega"],
  ["omega", "beta", "mid", "alpha", "zeta"],
  ["alpha", "omega", "zeta", "mid", "beta"],
  ["beta", "mid", "omega", "zeta", "alpha"],
];

describe("LibInfo.orderOf", () => {
  test("puts a lib after every lib it depends on, whatever order the libs were scanned in", () => {
    for (const names of insertionOrders) {
      const ordered = LibInfo.orderOf(new Map(names.map((name) => [name, deps[name] ?? []])));
      expect(ordered).toEqual(["zeta", "mid", "alpha", "beta", "omega"]);
    }
  });

  test("gives the same order whatever order a lib names its dependencies in", () => {
    const reversed = new Map(Object.entries(deps).map(([name, libDeps]) => [name, libDeps.toReversed()]));
    expect(LibInfo.orderOf(reversed)).toEqual(LibInfo.orderOf(new Map(Object.entries(deps))));
  });

  test("leaves out a dependency that was not scanned, and ends on libs that depend on each other", () => {
    expect(LibInfo.orderOf(new Map([["solo", ["missing"]]]))).toEqual(["solo"]);
    const cycle = new Map([
      ["b", ["a"]],
      ["a", ["b"]],
    ]);
    expect(LibInfo.orderOf(cycle)).toEqual(["b", "a"]);
  });
});
