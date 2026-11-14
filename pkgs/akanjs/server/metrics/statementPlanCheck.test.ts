import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import { Logger, type LogRecord } from "akanjs/common";
import { createDocumentQueryHelper } from "akanjs/document";
import { StatementProbe } from "akanjs/service";
import { runTraced, SignalTrace } from "../../signal/trace";
import { statementMetrics } from "./statementMetrics";
import { openStatementModel, type StatementModel } from "./statementModel.fixture";
import { StatementPlanCheck } from "./statementPlanCheck";

const q = createDocumentQueryHelper();

describe("dev query-plan check", () => {
  let large: StatementModel;
  const records: LogRecord[] = [];
  let removeSink: () => void;

  const settle = async () => {
    for (let idx = 0; idx < 20; idx++) await Bun.sleep(5);
  };
  const traced = async (endpoint: string, fn: () => Promise<unknown>) => {
    await runTraced(new SignalTrace(endpoint, "query", { mode: "context" }), fn);
    await settle();
  };

  beforeAll(async () => {
    statementMetrics.slowLog.thresholdMs = Number.POSITIVE_INFINITY;
    large = await openStatementModel("sqlite", StatementPlanCheck.minRows + 200);
    removeSink = Logger.addSink(
      (entry) => {
        if (entry.record.name === "QueryPlan") records.push(entry.record);
      },
      { minLevel: "warn" },
    );
  });
  afterEach(() => {
    records.length = 0;
    statementMetrics.reset();
  });
  afterAll(async () => {
    removeSink();
    await large.driver.close();
  });

  test("warns once for a filter no index serves, naming the model call, the endpoint and the plan", async () => {
    statementMetrics.planCheck = new StatementPlanCheck();
    await traced("memoByOwner", async () => {
      for (let idx = 0; idx < 3; idx++) await large.Memo.count({ ownerId: `u${idx}` } as never);
    });
    await traced("memoByOwner", async () => await large.Memo.count({ ownerId: "u9" } as never));

    expect(records).toHaveLength(1);
    const [record] = records;
    expect(record.message).toContain("statMemo.count statement");
    expect(record.message).toContain("sent by query:memoByOwner");
    expect(record.message).toContain(`reads every row of "statMemo"`);
    expect(record.message).toContain("[plan: SCAN statMemo]");
    expect(record.message).toContain("AKAN_QUERY_PLAN_IGNORE");
    expect(record.message).not.toContain("u9");
  });

  test("stays quiet for an indexed filter, an unfiltered count, a migration and an ignored statement", async () => {
    statementMetrics.planCheck = new StatementPlanCheck();
    await traced("memoByTitle", async () => {
      await large.Memo.count({ title: "memo 4" } as never);
      await large.Memo.count({} as never);
    });
    await StatementProbe.unplanned(async () => await large.Memo.count({ ownerId: "u1" } as never));
    await settle();
    expect(records).toEqual([]);

    const ignoredScan = await (async () => {
      statementMetrics.planCheck = null;
      await large.Memo.count({ score: q.gte(5) } as never);
      return statementMetrics.top(50).find((stat) => stat.text.includes(`'$.score'`))?.fingerprint ?? "";
    })();
    statementMetrics.reset();
    statementMetrics.planCheck = new StatementPlanCheck([ignoredScan]);
    await traced("memoByScore", async () => await large.Memo.count({ score: q.gte(5) } as never));
    expect(records).toEqual([]);
  });

  test("leaves a table under the row threshold alone", async () => {
    const small = await openStatementModel("sqlite", 30);
    try {
      statementMetrics.planCheck = new StatementPlanCheck();
      await traced("smallByOwner", async () => await small.Memo.count({ ownerId: "u1" } as never));
      expect(records).toEqual([]);
    } finally {
      await small.driver.close();
    }
  });

  test("reads a scan and a sort out of SQLite and Postgres plans", () => {
    expect(StatementPlanCheck.findingOf(["SCAN memo", "USE TEMP B-TREE FOR ORDER BY"], "memo")).toEqual({
      scans: "memo",
      sorts: true,
    });
    expect(StatementPlanCheck.findingOf(["SEARCH memo USING INDEX memo_title (<expr>=?)"], "memo")).toEqual({
      scans: null,
      sorts: false,
    });
    expect(
      StatementPlanCheck.findingOf(
        ["Limit", "  ->  Sort", '        ->  Seq Scan on "memo"', "  Filter: (x = 1)"],
        "memo",
      ),
    ).toEqual({ scans: "memo", sorts: true });
    expect(StatementPlanCheck.findingOf(["Index Scan using memo_title on memo"], "memo")).toEqual({
      scans: null,
      sorts: false,
    });
  });

  test("runs only in a local dev runtime, and AKAN_QUERY_PLAN_IGNORE=all turns it off", () => {
    const saved = { env: process.env.AKAN_PUBLIC_ENV, ignore: process.env.AKAN_QUERY_PLAN_IGNORE };
    try {
      process.env.AKAN_PUBLIC_ENV = "local";
      expect(StatementPlanCheck.fromEnv()).toBeInstanceOf(StatementPlanCheck);
      process.env.AKAN_QUERY_PLAN_IGNORE = "all";
      expect(StatementPlanCheck.fromEnv()).toBeNull();
      process.env.AKAN_PUBLIC_ENV = "main";
      delete process.env.AKAN_QUERY_PLAN_IGNORE;
      expect(StatementPlanCheck.fromEnv()).toBeNull();
    } finally {
      for (const [key, value] of [
        ["AKAN_PUBLIC_ENV", saved.env],
        ["AKAN_QUERY_PLAN_IGNORE", saved.ignore],
      ] as const)
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
    }
  });
});
