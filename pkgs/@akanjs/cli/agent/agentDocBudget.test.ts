import { describe, expect, test } from "bun:test";
import { AgentDocBudget } from "./agentDocBudget";

describe("AgentDocBudget", () => {
  test("every agent doc stays within its recorded size; rewrite with bun run agent:budget", async () => {
    const sizes = await AgentDocBudget.measure();
    expect(Object.keys(sizes)).toContain(AgentDocBudget.block);
    expect(Object.keys(sizes)).toContain(".claude/rules/akan/page.md");
    expect(Object.keys(sizes)).toContain(".agents/skills/akan-page/SKILL.md");
    expect(Object.keys(sizes)).toContain(".agents/skills/akan-page/references/pageRule.md");
    expect(Object.keys(sizes)).toContain("pkgs/akanjs/README.md");
    expect(AgentDocBudget.problems(await AgentDocBudget.read(), sizes)).toEqual([]);
  });

  test("names a doc past its slack, one without a budget, a budget without a doc, and a stale budget", () => {
    const record = { "a.md": 1000, "b.md": 1000, "gone.md": 10, "same.md": 500 };
    const sizes = { "a.md": 1021, "b.md": 979, "new.md": 7, "same.md": 509 };
    expect(AgentDocBudget.problems(record, sizes)).toEqual([
      "a.md grew to 1021 bytes, past its budget of 1000: trim it, or raise the budget on purpose with `bun run agent:budget --raise a.md`",
      "b.md shrank to 979 bytes from its budget of 1000: run `bun run agent:budget` to lower it",
      "new.md (7 bytes) has no budget: run `bun run agent:budget` to record it",
      "gone.md has a budget but no file: run `bun run agent:budget` to drop it",
    ]);
  });

  test("the rewrite lowers, adds and drops by itself, and raises only a doc it is told to", () => {
    const record = { "a.md": 1000, "b.md": 1000, "c.md": 1000, "gone.md": 10 };
    const sizes = { "a.md": 1100, "b.md": 900, "c.md": 1010, "new.md": 7 };
    expect(AgentDocBudget.next(record, sizes)).toEqual({
      next: { "a.md": 1000, "b.md": 900, "c.md": 1000, "new.md": 7 },
      grown: ["a.md"],
    });
    expect(AgentDocBudget.next(record, sizes, ["a.md"]).next["a.md"]).toBe(1100);
  });
});
