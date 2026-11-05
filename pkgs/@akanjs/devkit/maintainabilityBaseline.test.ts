import { describe, expect, test } from "bun:test";
import { MaintainabilityBaseline } from "./maintainabilityBaseline";
import { type DebtRuleId, MaintainabilityContract, type MaintainabilityViolation } from "./maintainabilityContract";

const sizeOf = (key: string, lineCount: number): MaintainabilityViolation => ({
  kind: "size",
  rule: key.includes("#") ? "akan.size.component" : "akan.size.file",
  key,
  file: key.split("#")[0] ?? key,
  line: 1,
  lineCount,
  maxLines: 400,
});
const writeOf = (key: string, writeCount = 2): MaintainabilityViolation => ({
  kind: "multiWrite",
  rule: "akan.store.multi-write",
  key,
  file: key.split("#")[0] ?? key,
  line: 1,
  owner: key.split("#")[1] ?? "",
  writes: [],
  writeCount,
});
const accessOf = (key: string, accessCount: number): MaintainabilityViolation => ({
  kind: "storeAccess",
  rule: "akan.component.store-access",
  key,
  file: key.split("#")[0] ?? key,
  line: 1,
  component: key.split("#")[1] ?? "",
  accessCount,
  maxAccesses: 16,
});
const placementOf = (file: string, writes: string[]): MaintainabilityViolation => ({
  kind: "writePlacement",
  rule: "akan.write.placement",
  key: file,
  file,
  line: 1,
  writes,
});
const baselineOf = (
  sections: { [rule in DebtRuleId]?: Record<string, number> },
  reasons: Record<string, string> = {},
) =>
  new MaintainabilityBaseline(
    new Map(Object.entries(sections).map(([rule, counts]) => [rule as DebtRuleId, new Map(Object.entries(counts))])),
    new Map(Object.entries(reasons)),
  );

describe("MaintainabilityBaseline", () => {
  test("keeps one section per rule the gate can fail, the growth check aside", () => {
    expect(new Set(MaintainabilityBaseline.debtRules)).toEqual(
      new Set(MaintainabilityContract.ruleIds.filter((rule) => rule !== "akan.baseline.growth")),
    );
  });

  test("allows a recorded entry up to its count, writes included, and nothing it does not record", () => {
    const baseline = MaintainabilityBaseline.parse(
      JSON.stringify({
        "akan.size.file": { "lib/a/A.Zone.tsx": 900 },
        "akan.store.multi-write": { "lib/a/a.store.ts#run": 2 },
        "akan.write.placement": { "ui/Board.tsx": 1 },
      }),
    );
    expect(baseline.allows(sizeOf("lib/a/A.Zone.tsx", 900))).toBe(true);
    expect(baseline.allows(sizeOf("lib/a/A.Zone.tsx", 901))).toBe(false);
    expect(baseline.allows(sizeOf("lib/b/B.Zone.tsx", 401))).toBe(false);
    expect(baseline.allows(writeOf("lib/a/a.store.ts#run"))).toBe(true);
    expect(baseline.allows(writeOf("lib/a/a.store.ts#run", 3))).toBe(false);
    expect(baseline.allows(writeOf("lib/a/a.store.ts#other"))).toBe(false);
    expect(baseline.allows(placementOf("ui/Board.tsx", ["st.do.removeBoard"]))).toBe(true);
    expect(baseline.allows(placementOf("ui/Board.tsx", ["st.do.removeBoard", "fetch.placeBoard"]))).toBe(false);
  });

  test("records the busiest of several breaches under one key", () => {
    const chainOf = (writeCount: number): MaintainabilityViolation => ({
      kind: "multiWrite",
      rule: "akan.component.write-chain",
      key: "lib/a/A.Zone.tsx#Canvas",
      file: "lib/a/A.Zone.tsx",
      line: 1,
      owner: "Canvas",
      writes: [],
      writeCount,
    });
    const baseline = MaintainabilityBaseline.of([chainOf(2), chainOf(4)]);
    expect([...(baseline.sections.get("akan.component.write-chain") ?? [])]).toEqual([["lib/a/A.Zone.tsx#Canvas", 4]]);
  });

  test("tightens to what still breaks: lowers a shrunk entry, keeps a grown one, drops the rest", () => {
    const baseline = baselineOf({
      "akan.size.file": { "lib/a/A.Zone.tsx": 900, "lib/b/B.Zone.tsx": 700, "lib/gone/Gone.Zone.tsx": 600 },
      "akan.store.multi-write": { "lib/a/a.store.ts#run": 3, "lib/a/a.store.ts#fixed": 2 },
    });
    const tightened = baseline.tightenedBy([
      sizeOf("lib/a/A.Zone.tsx", 850),
      sizeOf("lib/b/B.Zone.tsx", 720),
      sizeOf("lib/c/C.Zone.tsx", 500),
      writeOf("lib/a/a.store.ts#run", 2),
    ]);
    expect([...(tightened.sections.get("akan.size.file") ?? [])]).toEqual([
      ["lib/a/A.Zone.tsx", 850],
      ["lib/b/B.Zone.tsx", 700],
    ]);
    expect([...(tightened.sections.get("akan.store.multi-write") ?? [])]).toEqual([["lib/a/a.store.ts#run", 2]]);
    expect(baseline.tightenedBy([]).isEmpty).toBe(true);
  });

  test("names every entry a working baseline added or raised over the reference one, per rule", () => {
    const committed = baselineOf({
      "akan.size.file": { "lib/a/A.Zone.tsx": 900 },
      "akan.store.multi-write": { "a.store.ts#run": 2 },
    });
    const working = baselineOf({
      "akan.size.file": { "lib/a/A.Zone.tsx": 950, "lib/b/B.Zone.tsx": 500 },
      "akan.store.multi-write": { "a.store.ts#run": 3, "a.store.ts#sneak": 2 },
    });
    expect(working.grownFrom(committed)).toEqual([
      { rule: "akan.size.file", key: "lib/a/A.Zone.tsx", count: 950, committed: 900 },
      { rule: "akan.size.file", key: "lib/b/B.Zone.tsx", count: 500, committed: undefined },
      { rule: "akan.store.multi-write", key: "a.store.ts#run", count: 3, committed: 2 },
      { rule: "akan.store.multi-write", key: "a.store.ts#sneak", count: 2, committed: undefined },
    ]);
    expect(committed.tightenedBy([sizeOf("lib/a/A.Zone.tsx", 800)]).grownFrom(committed)).toEqual([]);
  });

  test("ratchets a component's store accesses like a size: allows up to its entry, lowers it, refuses a raise", () => {
    const baseline = MaintainabilityBaseline.parse(
      JSON.stringify({
        "akan.component.store-access": { "lib/a/A.Zone.tsx#Canvas": 40, "lib/gone/G.Zone.tsx#Old": 30 },
      }),
    );
    expect(baseline.allows(accessOf("lib/a/A.Zone.tsx#Canvas", 40))).toBe(true);
    expect(baseline.allows(accessOf("lib/a/A.Zone.tsx#Canvas", 41))).toBe(false);
    expect(baseline.allows(accessOf("lib/b/B.Zone.tsx#Board", 17))).toBe(false);
    expect(baseline.recordedOf(accessOf("lib/a/A.Zone.tsx#Canvas", 41))).toBe(40);

    const tightened = baseline.tightenedBy([accessOf("lib/a/A.Zone.tsx#Canvas", 33)]);
    expect([...(tightened.sections.get("akan.component.store-access") ?? [])]).toEqual([
      ["lib/a/A.Zone.tsx#Canvas", 33],
    ]);
    expect(baseline.grownFrom(tightened)).toEqual([
      { rule: "akan.component.store-access", key: "lib/a/A.Zone.tsx#Canvas", count: 40, committed: 33 },
      { rule: "akan.component.store-access", key: "lib/gone/G.Zone.tsx#Old", count: 30, committed: undefined },
    ]);
    expect(tightened.grownFrom(baseline)).toEqual([]);
  });

  test("lets a shape entry grow only with a reason of ten non-space characters, a write entry never", () => {
    const committed = baselineOf({
      "akan.size.file": { "lib/a/A.Zone.tsx": 900 },
      "akan.store.multi-write": { "a.store.ts#run": 2 },
    });
    const reason = "The canvas is one pointer state machine.";
    const working = baselineOf(
      {
        "akan.size.file": { "lib/a/A.Zone.tsx": 950, "ui/Board.tsx": 450, "lib/b/B.Zone.tsx": 500 },
        "akan.size.component": { "lib/c/C.Zone.tsx#Grid": 300 },
        "akan.component.store-access": { "lib/d/D.Zone.tsx#Canvas": 30 },
        "akan.store.multi-write": { "a.store.ts#run": 2, "a.store.ts#sneak": 2 },
        "akan.component.write-chain": { "lib/c/C.Zone.tsx#Grid": 2 },
        "akan.write.placement": { "ui/Board.tsx": 1 },
        "akan.service.call-in-loop": { "lib/e/e.service.ts#sync": 1 },
      },
      {
        "lib/a/A.Zone.tsx": reason,
        "ui/Board.tsx": reason,
        "lib/b/B.Zone.tsx": "a b c d e f g h i",
        "lib/c/C.Zone.tsx#Grid": reason,
        "lib/d/D.Zone.tsx#Canvas": reason,
        "a.store.ts#sneak": reason,
        "lib/e/e.service.ts#sync": reason,
      },
    );

    expect(working.grownFrom(committed)).toEqual([
      { rule: "akan.size.file", key: "lib/b/B.Zone.tsx", count: 500, committed: undefined },
      { rule: "akan.store.multi-write", key: "a.store.ts#sneak", count: 2, committed: undefined },
      { rule: "akan.component.write-chain", key: "lib/c/C.Zone.tsx#Grid", count: 2, committed: undefined },
      { rule: "akan.write.placement", key: "ui/Board.tsx", count: 1, committed: undefined },
    ]);
    expect(working.reasonOf("lib/b/B.Zone.tsx")).toBeUndefined();
    expect(working.reasonOf("a.store.ts#sneak")).toBeUndefined();
    expect(working.reasonOf("lib/d/D.Zone.tsx#Canvas")).toBe(reason);
    expect(working.reasonOf("lib/e/e.service.ts#sync")).toBe(reason);
  });

  test("keeps a reason only beside a shape entry it still describes", () => {
    const reason = "The canvas is one pointer state machine.";
    const baseline = baselineOf(
      {
        "akan.size.file": { "lib/a/A.Zone.tsx": 900, "lib/gone/Gone.Zone.tsx": 600 },
        "akan.component.store-access": { "lib/a/A.Zone.tsx#Canvas": 30 },
        "akan.store.multi-write": { "lib/a/a.store.ts#run": 2 },
      },
      {
        "lib/a/A.Zone.tsx": reason,
        "lib/gone/Gone.Zone.tsx": reason,
        "lib/a/A.Zone.tsx#Canvas": reason,
        "lib/a/a.store.ts#run": reason,
        "lib/never/Recorded.tsx": reason,
      },
    );

    const tightened = baseline.tightenedBy([
      sizeOf("lib/a/A.Zone.tsx", 850),
      accessOf("lib/a/A.Zone.tsx#Canvas", 20),
      writeOf("lib/a/a.store.ts#run"),
    ]);

    expect([...(tightened.sections.get("akan.size.file") ?? [])]).toEqual([["lib/a/A.Zone.tsx", 850]]);
    expect([...tightened.reasons]).toEqual([
      ["lib/a/A.Zone.tsx", reason],
      ["lib/a/A.Zone.tsx#Canvas", reason],
    ]);
    expect(baseline.tightenedBy([]).reasons.size).toBe(0);
  });

  test("prints the rule sections in rule order with sorted keys, as Biome would, and reprints them unchanged", () => {
    const baseline = MaintainabilityBaseline.of([
      writeOf("lib/z/z.store.ts#run"),
      sizeOf("lib/court/Court.Zone.tsx#Canvas", 640),
      sizeOf("lib/court/Court.Zone.tsx", 947),
      writeOf("lib/court/court.store.ts#assignCourtPcOnCourt", 3),
      placementOf("ui/Board.tsx", ["st.do.removeBoard"]),
    ]);
    const text = baseline.stringify();
    expect(text).toBe(`{
  "akan.size.file": {
    "lib/court/Court.Zone.tsx": 947
  },
  "akan.size.component": {
    "lib/court/Court.Zone.tsx#Canvas": 640
  },
  "akan.store.multi-write": {
    "lib/court/court.store.ts#assignCourtPcOnCourt": 3,
    "lib/z/z.store.ts#run": 2
  },
  "akan.write.placement": {
    "ui/Board.tsx": 1
  }
}
`);
    expect(MaintainabilityBaseline.parse(text).stringify()).toBe(text);
  });

  test("prints the reasons last and only once there are some, reprinting them unchanged", () => {
    const text = `{
  "akan.size.file": {
    "lib/a/A.Zone.tsx": 950,
    "ui/Board.tsx": 450
  },
  "reasons": {
    "lib/a/A.Zone.tsx": "The canvas is one pointer state machine.",
    "ui/Board.tsx": "Generated SVG path table for the court layout."
  }
}
`;
    const reasonless = '{\n  "akan.size.file": {\n    "lib/a/A.Zone.tsx": 950\n  }\n}\n';

    expect(MaintainabilityBaseline.parse(text).stringify()).toBe(text);
    expect(MaintainabilityBaseline.parse(reasonless).stringify()).toBe(reasonless);
    expect(MaintainabilityBaseline.parse('{ "reasons": {} }').stringify()).not.toContain("reasons");
  });

  test("refuses a file that is not the baseline shape, naming it", () => {
    expect(() => MaintainabilityBaseline.parse("{", "apps/demo/akan.baseline.json")).toThrow(
      "apps/demo/akan.baseline.json is not valid JSON.",
    );
    expect(() => MaintainabilityBaseline.parse("[]")).toThrow("holds an object");
    expect(() => MaintainabilityBaseline.parse('{ "akan.size.file": { "a": "900" } }')).toThrow('"akan.size.file"');
    expect(() => MaintainabilityBaseline.parse('{ "akan.store.multi-write": ["a#b"] }')).toThrow(
      '"akan.store.multi-write"',
    );
    expect(() => MaintainabilityBaseline.parse('{ "maxLines": {} }')).toThrow("akan quality baseline --force");
    expect(() => MaintainabilityBaseline.parse('{ "reasons": { "ui/Board.tsx": 1 } }')).toThrow('"reasons"');
    expect(MaintainabilityBaseline.parse("{}").isEmpty).toBe(true);
  });
});
