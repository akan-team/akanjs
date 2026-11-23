import { describe, expect, test } from "bun:test";
import type { CodeAgentSubagent } from "akanjs/common";
import { CodeTuiAgents } from "./CodeTuiAgents";
import { CodeTuiLines } from "./CodeTuiLines";

const agent = (patch: Partial<CodeAgentSubagent> = {}): CodeAgentSubagent => ({
  id: "c0",
  kind: "explore",
  description: "Counting untranslated desc strings in store.tsx",
  startedAt: 0,
  tokens: 301_300,
  ...patch,
});

const now = 750_000;

describe("sub-agent rail", () => {
  test("nothing is drawn when nothing is running", () => {
    expect(CodeTuiAgents.rows([], "main", 80)).toEqual([]);
  });

  test("the session heads the rail and every child gets one row", () => {
    const rows = CodeTuiAgents.rows([agent(), agent({ id: "c1", kind: "code" })], "main", 100, now);
    expect(rows.map((row) => CodeTuiLines.text(row))).toEqual([
      "❯ ⏺ main",
      "  ◯ explore  Counting untranslated desc strings in store.tsx               12m 30s · ↓ 301.3k tokens",
      "  ◯ code     Counting untranslated desc strings in store.tsx               12m 30s · ↓ 301.3k tokens",
    ]);
    for (const row of rows.slice(1)) expect(CodeTuiLines.width(CodeTuiLines.text(row))).toBe(100);
  });

  test("a row is exactly one line wide, in columns, whatever the description is", () => {
    for (const width of [40, 61, 80, 120]) {
      const rows = CodeTuiAgents.rows(
        [agent({ description: "한글로 쓴 아주 긴 설명이 여기에 들어간다" })],
        "s",
        width,
        now,
      );
      for (const row of rows) expect(CodeTuiLines.width(CodeTuiLines.text(row))).toBeLessThanOrEqual(width);
    }
  });

  test("the meta column is dropped rather than squeezed when there is no room for a description", () => {
    const [, row] = CodeTuiAgents.rows([agent()], "s", 30, now);
    expect(CodeTuiLines.text(row ?? { key: "", spans: [] })).not.toContain("tokens");
  });

  test("elapsed reads in the unit a person reads at that scale", () => {
    expect(CodeTuiAgents.elapsed(47_000)).toBe("47s");
    expect(CodeTuiAgents.elapsed(750_000)).toBe("12m 30s");
    expect(CodeTuiAgents.elapsed(3_720_000)).toBe("1h 2m");
    expect(CodeTuiAgents.elapsed(-5)).toBe("0s");
  });

  test("tokens carry one decimal past a thousand", () => {
    expect(CodeTuiAgents.tokens(842)).toBe("842");
    expect(CodeTuiAgents.tokens(12_400)).toBe("12.4k");
    expect(CodeTuiAgents.tokens(1_300_000)).toBe("1.3M");
  });
});
