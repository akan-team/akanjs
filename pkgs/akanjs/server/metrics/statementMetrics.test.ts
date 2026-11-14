import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { createDocumentQueryHelper } from "akanjs/document";
import { type AkanMetricFamily, StatementProbe } from "akanjs/service";
import { runTraced, SignalTrace } from "../../signal/trace";
import { MetricExposition } from "./metricExposition";
import { metricRegistry } from "./metricRegistry";
import { StatementMetrics, statementMetrics } from "./statementMetrics";
import { openStatementModel, type StatementModel } from "./statementModel.fixture";
import { StatementReport } from "./statementReport";

const q = createDocumentQueryHelper();
const secret = "alice@example.com";
const statementFamilies = () =>
  metricRegistry.snapshot().filter((family) => family.name.startsWith("akan_db_statement"));
const sampleOf = (family: AkanMetricFamily | undefined, fingerprint: string) =>
  family?.samples.find((sample) => sample.labels.fingerprint === fingerprint);

describe("statement metrics", () => {
  let model: StatementModel;

  beforeAll(async () => {
    model = await openStatementModel("sqlite", 400);
  });
  afterAll(async () => {
    await model.driver.close();
  });
  beforeEach(() => {
    statementMetrics.reset();
  });

  test("names the slowest statement, its model call and the endpoint that sent it", async () => {
    const { Memo, ids } = model;
    await runTraced(new SignalTrace("memoListByScore", "query", { mode: "context" }), async () => {
      for (let idx = 0; idx < 30; idx++) await Memo.count({ score: q.gte(idx) } as never);
    });
    await runTraced(new SignalTrace("memo", "query", { mode: "context" }), async () => {
      await Memo.pickById(ids[0]);
    });

    const report = StatementReport.view(statementMetrics.top(50));
    const [slowest] = report.byTotalTime;
    expect(slowest).toMatchObject({ model: "statMemo", op: "count", count: 30, rows: 30 });
    expect(slowest.text).toStartWith(`SELECT count(*) as count FROM "statMemo" WHERE`);
    expect(slowest.sentBy).toEqual([{ endpoint: "query:memoListByScore", count: 30, totalMs: expect.any(Number) }]);
    expect(slowest.p95Ms).toBeGreaterThan(0);
    const pick = report.byTotalTime.find((row) => row.op === "findOne");
    expect(pick?.sentBy.map((sender) => sender.endpoint)).toEqual(["query:memo"]);
  });

  test("labels every series by fingerprint, model and op, and carries no value it was sent", async () => {
    const { Memo } = model;
    await runTraced(new SignalTrace("memoUpdate", "mutation", { mode: "context" }), async () => {
      await Memo.updateMany({ ownerId: "u1" } as never, { title: secret } as never);
      await Memo.count({ title: secret } as never);
    });

    const families = statementFamilies();
    expect(families.map((family) => family.name).sort((a, b) => a.localeCompare(b))).toEqual([
      "akan_db_statement_duration_seconds",
      "akan_db_statement_rows_total",
      "akan_db_statement_seconds_total",
      "akan_db_statement_wait_seconds_total",
      "akan_db_statements_total",
    ]);
    for (const family of families)
      for (const sample of family.samples)
        expect(Object.keys(sample.labels).sort()).toEqual(["fingerprint", "model", "op"]);
    const [update] = statementMetrics.top(50).filter((stat) => stat.op === "updateMany");
    const rows = sampleOf(
      families.find((family) => family.name === "akan_db_statement_rows_total"),
      update.fingerprint,
    );
    expect(rows && "value" in rows ? rows.value : null).toBe(10);
    const exposed = MetricExposition.render(families, "openmetrics");
    const report = JSON.stringify(StatementReport.view(statementMetrics.top(50)));
    for (const text of [exposed, report]) expect(text).not.toContain(secret);
  });

  test("times a write's wait for the SQLite write turn apart from its run", async () => {
    const { driver, Memo, store } = model;
    let held!: () => void;
    let began!: () => void;
    const holding = new Promise<void>((resolve) => {
      held = resolve;
    });
    const begun = new Promise<void>((resolve) => {
      began = resolve;
    });
    const transaction = driver.database.transaction(async () => {
      await store.updateManyByQuery({ ownerId: "u2" } as never, { score: 1 } as never);
      began();
      await holding;
    });
    await begun;
    const waiting = Memo.updateMany({ ownerId: "u3" } as never, { score: 2 } as never);
    await Bun.sleep(40);
    held();
    await Promise.all([transaction, waiting]);

    const stats = statementMetrics.top(50);
    const outside = stats.find((stat) => stat.op === "updateMany");
    expect(outside?.waitMs).toBeGreaterThanOrEqual(30);
    expect(outside?.totalMs).toBeLessThan(outside?.waitMs ?? 0);
  });

  test("keeps a bounded number of statements, letting the cheapest go first", () => {
    const costly = StatementProbe.fixed(`SELECT "costly" FROM "bounded"`);
    StatementProbe.sent(costly, [], 900, 0, 1);
    for (let idx = 0; idx < StatementMetrics.maxStatements + 100; idx++)
      StatementProbe.sent(StatementProbe.fixed(`SELECT "c${idx}" FROM "bounded"`), [], 1, 0, 1);

    const kept = statementMetrics.top(StatementMetrics.maxStatements * 2);
    expect(kept.length).toBeLessThanOrEqual(StatementMetrics.maxStatements);
    expect(kept.map((stat) => stat.fingerprint)).toContain(costly.shape.fingerprint);
  });
});
