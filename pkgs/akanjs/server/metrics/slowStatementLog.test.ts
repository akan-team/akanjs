import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import { Logger, type LogRecord } from "akanjs/common";
import { runTraced, SignalTrace } from "../../signal/trace";
import { SlowStatementLog } from "./slowStatementLog";
import { statementMetrics } from "./statementMetrics";
import { openStatementModel, type StatementModel } from "./statementModel.fixture";

const secret = "alice@example.com";

describe("slow statement log", () => {
  let model: StatementModel;
  const records: LogRecord[] = [];
  let removeSink: () => void;

  beforeAll(async () => {
    statementMetrics.planCheck = null;
    statementMetrics.slowLog.thresholdMs = Number.POSITIVE_INFINITY;
    model = await openStatementModel("sqlite", 50);
    removeSink = Logger.addSink(
      (entry) => {
        if (entry.record.name === "SlowStatement") records.push(entry.record);
      },
      { minLevel: "warn" },
    );
  });
  afterEach(() => {
    records.length = 0;
    statementMetrics.reset();
    statementMetrics.slowLog.thresholdMs = Number.POSITIVE_INFINITY;
  });
  afterAll(async () => {
    removeSink();
    await model.driver.close();
  });

  test("reads its threshold from AKAN_LOG_SLOW_STATEMENT_MS, 200 ms unless set, and off as off or 0", () => {
    expect(SlowStatementLog.thresholdOf(undefined)).toBe(200);
    expect(SlowStatementLog.thresholdOf("")).toBe(200);
    expect(SlowStatementLog.thresholdOf("50")).toBe(50);
    expect(SlowStatementLog.thresholdOf("off")).toBe(Number.POSITIVE_INFINITY);
    expect(SlowStatementLog.thresholdOf("0")).toBe(Number.POSITIVE_INFINITY);
    expect(SlowStatementLog.thresholdOf("soon")).toBe(200);
  });

  test("writes one line per statement shape, naming the endpoint and trace but no value it was sent", async () => {
    const { Memo } = model;
    statementMetrics.slowLog.thresholdMs = 0;
    const trace = new SignalTrace("memoByTitle", "query", { mode: "context" });
    await runTraced(trace, async () => {
      for (let idx = 0; idx < 5; idx++) await Memo.count({ title: `${secret}${idx}` } as never);
    });

    expect(records).toHaveLength(1);
    const [record] = records;
    expect(record.level).toBe("warn");
    expect(record.attrs).toMatchObject({
      model: "statMemo",
      op: "count",
      rows: 1,
      sentBy: "query:memoByTitle",
      traceId: trace.traceId,
      fingerprint: expect.stringMatching(/^[0-9a-f]{12}$/),
    });
    expect(record.message).toContain(`SELECT count(*) as count FROM "statMemo"`);
    expect(JSON.stringify(record)).not.toContain(secret);
  });

  test("names no endpoint outside a request, and counts the lines it held back once the window passes", () => {
    const stat = {
      slowLoggedAt: Number.NEGATIVE_INFINITY,
      slowSuppressed: 0,
      shape: { fingerprint: "f", text: "SELECT ?" },
    };
    const site = { model: "memo", op: "find" };
    const log = new SlowStatementLog();
    const slow = { durationMs: 250, waitMs: 4, rows: 3, trace: undefined };
    log.log(stat as never, site as never, slow, 0);
    log.log(stat as never, site as never, slow, 1_000);
    log.log(stat as never, site as never, slow, 2_000);
    log.log(stat as never, site as never, slow, SlowStatementLog.repeatWindowMs + 1);

    expect(records.map((record) => record.attrs)).toEqual([
      { fingerprint: "f", model: "memo", op: "find", ms: 250, waitMs: 4, rows: 3, sentBy: "none" },
      { fingerprint: "f", model: "memo", op: "find", ms: 250, waitMs: 4, rows: 3, sentBy: "none", suppressed: 2 },
    ]);
  });
});
