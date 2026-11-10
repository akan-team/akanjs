import { afterEach, describe, expect, test } from "bun:test";
import { LlmSpend, type LlmTurnRequest } from "akanjs/service";
import { AgentMeter, type AgentQuotaCheck, type AgentUsageReport } from "./agentMeter";

afterEach(() => AgentMeter.use({ usage: null, quota: null, serial: true }));

const usage = { inputTokens: 10, outputTokens: 2, cachedTokens: 0 };

describe("AgentMeter", () => {
  test("reports the provider's counts with the caller and the model", async () => {
    const reports: AgentUsageReport[] = [];
    AgentMeter.use({ usage: (report) => void reports.push(report) });
    const result = await AgentMeter.run({ id: "u1" }, async () => ({ text: "hi", usage, model: "m1" }));
    await Bun.sleep(0);
    expect(result.text).toBe("hi");
    expect(reports).toEqual([
      {
        account: { id: "u1" },
        turn: expect.objectContaining({ id: expect.any(String) }),
        model: "m1",
        usage,
        outcome: "ok",
      },
    ]);
  });

  test("hands the quota and the report the same turn, with its headers and the request the policy returned", async () => {
    const checks: AgentQuotaCheck[] = [];
    const reports: AgentUsageReport[] = [];
    AgentMeter.use({
      quota: (check) => {
        checks.push(check);
        return true;
      },
      usage: (report) => void reports.push(report),
    });
    const turn = AgentMeter.turnOf({ id: "u1" }, { headers: new Headers({ "x-org": "o1" }), ip: "198.18.0.1" });
    const request: LlmTurnRequest = { messages: [], tools: [], context: [] };
    await AgentMeter.run({ id: "u1" }, async () => ({ model: "m1" }), { turn, request });
    await Bun.sleep(0);
    expect(checks).toEqual([{ account: { id: "u1" }, turn, request }]);
    expect(reports[0]?.turn).toBe(turn);
    expect(reports[0]?.turn.headers.get("x-org")).toBe("o1");
    expect(reports[0]?.usage).toEqual({ inputTokens: 0, outputTokens: 0, cachedTokens: 0 });
  });

  test("a turn that fails is reported once with what the provider counted, and still fails", async () => {
    const reports: AgentUsageReport[] = [];
    AgentMeter.use({ usage: (report) => void reports.push(report) });
    const cut = LlmSpend.attach(new Error("socket closed"), { usage, model: "m1" });
    await expect(
      AgentMeter.run({ id: "u1" }, async () => {
        throw cut;
      }),
    ).rejects.toBe(cut);
    const refused = new Error("overloaded");
    await expect(
      AgentMeter.run({ id: "u1" }, async () => {
        throw refused;
      }),
    ).rejects.toBe(refused);
    await Bun.sleep(0);
    expect(reports.map(({ model, usage, outcome }) => ({ model, usage, outcome }))).toEqual([
      { model: "m1", usage, outcome: "failed" },
      { model: null, usage: { inputTokens: 0, outputTokens: 0, cachedTokens: 0 }, outcome: "failed" },
    ]);
  });

  test("a turn whose caller went away is reported aborted", async () => {
    const reports: AgentUsageReport[] = [];
    AgentMeter.use({ usage: (report) => void reports.push(report) });
    const abort = new AbortController();
    const run = AgentMeter.run(
      { id: "u1" },
      async () => {
        abort.abort();
        throw LlmSpend.attach(new Error("aborted"), { usage, model: "m1" });
      },
      { signal: abort.signal },
    );
    await expect(run).rejects.toThrow("aborted");
    await Bun.sleep(0);
    expect(reports.map(({ outcome, usage }) => ({ outcome, usage }))).toEqual([{ outcome: "aborted", usage }]);
  });

  test("a turn cut short reports its estimate as one", async () => {
    const reports: AgentUsageReport[] = [];
    AgentMeter.use({ usage: (report) => void reports.push(report) });
    const abort = new AbortController();
    const run = AgentMeter.run(
      { id: "u1" },
      async () => {
        abort.abort();
        throw LlmSpend.attach(new Error("aborted"), { usage, model: "m1", estimated: true });
      },
      { signal: abort.signal },
    );
    await expect(run).rejects.toThrow("aborted");
    await Bun.sleep(0);
    expect(reports.map(({ outcome, usage, estimated }) => ({ outcome, usage, estimated }))).toEqual([
      { outcome: "aborted", usage, estimated: true },
    ]);
  });

  test("a plain turn left running past its abort holds the caller's lane until the provider's counts settle it", async () => {
    const order: string[] = [];
    const reports: AgentUsageReport[] = [];
    AgentMeter.use({
      quota: () => {
        order.push("check");
        return true;
      },
      usage: (report) => {
        order.push(`reported:${report.outcome}`);
        reports.push(report);
      },
    });
    const provider = Promise.withResolvers<{ usage: typeof usage; model: string }>();
    const abort = new AbortController();
    const left = AgentMeter.run(
      { id: "u1" },
      () => LlmSpend.outlast(provider.promise, abort.signal, (answer) => ({ ...answer })),
      { signal: abort.signal },
    );
    await Bun.sleep(0);
    abort.abort();
    await expect(left).rejects.toThrow();
    const next = AgentMeter.run({ id: "u1" }, async () => ({ usage, text: "next" }));
    await Bun.sleep(5);
    expect(order).toEqual(["check"]);
    provider.resolve({ usage, model: "m1" });
    await expect(next).resolves.toMatchObject({ text: "next" });
    await Bun.sleep(0);
    expect(order).toEqual(["check", "reported:aborted", "check", "reported:ok"]);
    expect(reports[0]).toMatchObject({ outcome: "aborted", usage, model: "m1" });
    expect(reports[0]?.estimated).toBeUndefined();
  });

  test("a failed turn holds the caller's next one until its report settles, as a billed one does", async () => {
    const order: string[] = [];
    AgentMeter.use({
      quota: () => {
        order.push("check");
        return true;
      },
      usage: async ({ outcome }) => {
        await Bun.sleep(5);
        order.push(`reported:${outcome}`);
      },
    });
    const failed = AgentMeter.run({ id: "u1" }, async () => {
      throw new Error("overloaded");
    });
    const next = AgentMeter.run({ id: "u1" }, async () => ({ usage, text: "next" }));
    await expect(failed).rejects.toThrow("overloaded");
    await expect(next).resolves.toMatchObject({ text: "next" });
    expect(order).toEqual(["check", "reported:failed", "check"]);
  });

  test("a turn that answers null still settles, so the caller's next turn is not held forever", async () => {
    AgentMeter.use({ quota: () => true });
    await AgentMeter.run({ id: "u1" }, async () => null);
    const next = AgentMeter.run({ id: "u1" }, async () => ({ model: "m1" }));
    const settled = await Promise.race([next.then(() => "ran"), Bun.sleep(50).then(() => "held")]);
    expect(settled).toBe("ran");
  });

  test("each report gets usage of its own, so a hook that rewrites one does not bill the next", async () => {
    const reports: AgentUsageReport[] = [];
    AgentMeter.use({
      usage: (report) => {
        reports.push(report);
        report.usage.inputTokens += 7;
      },
    });
    await AgentMeter.run({ id: "u1" }, async () => ({ model: "m1" }));
    await AgentMeter.run({ id: "u2" }, async () => ({ model: "m1" }));
    await Bun.sleep(0);
    expect(reports.map(({ usage }) => usage.inputTokens)).toEqual([7, 7]);
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
