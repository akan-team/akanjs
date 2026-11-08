import { afterEach, describe, expect, test } from "bun:test";
import { AgentMeter, type AgentUsageReport } from "./agentMeter";

afterEach(() => AgentMeter.use({ usage: null, quota: null, serial: true }));

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

  test("a burst from one caller asks the quota once per turn, each after the one before it was billed", async () => {
    let spent = 0;
    const order: string[] = [];
    AgentMeter.use({
      quota: () => {
        order.push(`check:${spent}`);
        return spent < 1;
      },
      usage: async () => {
        await Bun.sleep(5);
        spent += 1;
      },
    });
    const turn = async () => {
      order.push("turn");
      return { usage, text: "ok" };
    };
    const settled = await Promise.allSettled([AgentMeter.run({ id: "u1" }, turn), AgentMeter.run({ id: "u1" }, turn)]);
    expect(settled.map(({ status }) => status)).toEqual(["fulfilled", "rejected"]);
    expect(order).toEqual(["check:0", "turn", "check:1"]);
  });

  test("a usage hook that never settles holds the caller's next turn only until the timeout", async () => {
    const timeout = AgentMeter.usageTimeoutMs;
    AgentMeter.usageTimeoutMs = 20;
    try {
      AgentMeter.use({ quota: () => true, usage: () => new Promise<void>(() => undefined) });
      await AgentMeter.run({ id: "u1" }, async () => ({ usage, text: "first" }));
      const next = AgentMeter.run({ id: "u1" }, async () => ({ usage, text: "next" }));
      const early = await Promise.race([next.then(() => "ran"), Bun.sleep(5).then(() => "held")]);
      expect(early).toBe("held");
      await expect(next).resolves.toMatchObject({ text: "next" });
    } finally {
      AgentMeter.usageTimeoutMs = timeout;
    }
  });

  test("callers do not wait on one another, nor do anonymous ones or a meter told it need not", async () => {
    const gate = Promise.withResolvers<void>();
    AgentMeter.use({ quota: () => true });
    const held = AgentMeter.run({ id: "u1" }, async () => {
      await gate.promise;
      return { usage, text: "first" };
    });
    await expect(AgentMeter.run({ id: "u2" }, async () => ({ usage, text: "other" }))).resolves.toMatchObject({
      text: "other",
    });
    await expect(AgentMeter.run(null, async () => ({ usage, text: "anonymous" }))).resolves.toMatchObject({
      text: "anonymous",
    });
    AgentMeter.use({ serial: false });
    await expect(AgentMeter.run({ id: "u1" }, async () => ({ usage, text: "beside" }))).resolves.toMatchObject({
      text: "beside",
    });
    gate.resolve();
    await expect(held).resolves.toMatchObject({ text: "first" });
  });
});
