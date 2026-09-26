import { afterEach, describe, expect, test } from "bun:test";
import { AgentMeter, type AgentUsageReport } from "./agentMeter";

afterEach(() => AgentMeter.use({ usage: null, quota: null }));

const usage = { inputTokens: 10, outputTokens: 2, cachedTokens: 0 };

describe("AgentMeter", () => {
  test("reports the provider's counts with the caller and the model", async () => {
    const reports: AgentUsageReport[] = [];
    AgentMeter.use({ usage: (report) => void reports.push(report) });
    const result = await AgentMeter.run({ id: "u1" }, async () => ({ text: "hi", usage, model: "m1" }));
    await Bun.sleep(0);
    expect(result.text).toBe("hi");
    expect(reports).toEqual([{ account: { id: "u1" }, model: "m1", usage }]);
  });

  test("a refused quota stops the turn before it spends anything", async () => {
    let ran = false;
    AgentMeter.use({ quota: ({ account }) => (account as { id: string }).id !== "over" });
    await expect(
      AgentMeter.run({ id: "over" }, async () => {
        ran = true;
        return { usage };
      }),
    ).rejects.toThrow("agent.error.quotaExceeded");
    expect(ran).toBe(false);
  });

  test("a failing usage hook does not fail the turn", async () => {
    AgentMeter.use({
      usage: () => {
        throw new Error("ledger down");
      },
    });
    await expect(AgentMeter.run(null, async () => ({ usage, text: "ok" }))).resolves.toMatchObject({ text: "ok" });
  });
});
