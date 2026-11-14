import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { DocumentStore } from "akanjs/service";
import { runTraced, SignalTrace } from "../../signal/trace";
import { statementMetrics } from "../metrics/statementMetrics";
import { openStatementModel, type StatementModel } from "../metrics/statementModel.fixture";
import { modelFacadeOf } from "./modelFacade";
import { timedQuery } from "./timedQuery";

describe("timedQuery", () => {
  test("records a span naming the model and the operation, and nothing of the query", async () => {
    const trace = new SignalTrace("listMemo", "query", { mode: "full" });
    const secret = "alice@example.com";
    const store = {
      count: async () => 3,
      updateManyByQuery: async () => 1,
      findOne: async () => ({ id: "m1", email: secret }),
    } as unknown as DocumentStore;
    const noHook = (() => () => undefined) as never;
    const Memo = modelFacadeOf(store, "memo", noHook, noHook);

    await runTraced(trace, async () => {
      await Memo.count({ email: secret } as never);
      await Memo.updateMany({ email: secret } as never, { email: secret } as never);
      await Memo.pickById("m1");
    });

    const spans = trace.spans.filter((span) => span.name !== "total");
    expect(spans.map((span) => [span.name, span.attrs])).toEqual([
      ["db:memo.count", { model: "memo", op: "count" }],
      ["db:memo.updateMany", { model: "memo", op: "updateMany" }],
      ["db:memo.findOne", { model: "memo", op: "findOne" }],
    ]);
    expect(trace.dbQueryCount).toBe(3);
    expect(JSON.stringify(trace.spans)).not.toContain(secret);
    expect(trace.serverTiming()).not.toContain(secret);
  });

  test("times nothing with tracing off or outside a call, and still answers", async () => {
    const context = new SignalTrace("listMemo", "query", { mode: "context" });

    const inContext = await runTraced(context, () => timedQuery("memo", "count", async () => 3));
    const outside = await timedQuery("memo", "count", async () => 4);

    expect([inContext, outside]).toEqual([3, 4]);
    expect(context.spans).toEqual([]);
    expect(context.dbQueryCount).toBe(0);
  });
});

describe("timedQuery on a SQLite store", () => {
  let model: StatementModel;

  beforeAll(async () => {
    statementMetrics.slowLog.thresholdMs = Number.POSITIVE_INFINITY;
    statementMetrics.planCheck = null;
    model = await openStatementModel("sqlite", 20);
  });
  afterAll(async () => {
    await model.driver.close();
  });

  test("records a span per statement the driver sends, named after the model call, and nothing of the query", async () => {
    const trace = new SignalTrace("listMemo", "query", { mode: "full" });
    const secret = "alice@example.com";
    const { Memo, ids } = model;

    await runTraced(trace, async () => {
      await Memo.count({ ownerId: secret } as never);
      await Memo.updateMany({ ownerId: secret } as never, { title: secret } as never);
      await Memo.pickById(ids[0]);
      await timedQuery("statMemo", "pair", async () => {
        await Memo.count({} as never);
        await Memo.exists({ ownerId: secret } as never);
      });
    });

    const spans = trace.spans.filter((span) => span.name !== "total");
    expect(spans.map((span) => span.name)).toEqual([
      "db:statMemo.count",
      "db:statMemo.updateMany",
      "db:statMemo.findOne",
      "db:statMemo.count",
      "db:statMemo.exists",
    ]);
    expect(trace.dbQueryCount).toBe(5);
    expect(JSON.stringify(trace.spans)).not.toContain(secret);
    expect(trace.serverTiming()).not.toContain(secret);
  });

  test("records no span with tracing off, though the driver sent a statement", async () => {
    const context = new SignalTrace("listMemo", "query", { mode: "context" });

    expect(await runTraced(context, async () => await model.Memo.count({} as never))).toBe(20);
    expect(context.spans).toEqual([]);
    expect(context.dbQueryCount).toBe(0);
  });
});
