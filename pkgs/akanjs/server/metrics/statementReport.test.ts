import { describe, expect, test } from "bun:test";
import type { AkanStatementStat } from "akanjs/service";
import { STATEMENT_BUCKETS_SECONDS, StatementReport } from "./statementReport";

const bucketsWith = (entries: Record<number, number>) =>
  Array.from({ length: STATEMENT_BUCKETS_SECONDS.length + 1 }, (_, idx) => entries[idx] ?? 0);

const stat = (overrides: Partial<AkanStatementStat>): AkanStatementStat => ({
  fingerprint: "aaaaaaaaaaaa",
  text: `SELECT * FROM "memo" WHERE "id" = ?`,
  model: "memo",
  op: "findOne",
  count: 1,
  totalMs: 1,
  waitMs: 0,
  rows: 1,
  sinceMs: 1_000,
  buckets: bucketsWith({ 3: 1 }),
  sentBy: [],
  ...overrides,
});

describe("statement report", () => {
  test("merges the replicas' statements by fingerprint, summing their counts, times and senders", () => {
    const merged = StatementReport.merge([
      [
        stat({
          count: 2,
          totalMs: 4,
          sinceMs: 9_000,
          buckets: bucketsWith({ 3: 2 }),
          sentBy: [{ endpoint: "query:memo", count: 2, totalMs: 4 }],
        }),
      ],
      undefined,
      [
        stat({
          count: 3,
          totalMs: 9,
          rows: 3,
          buckets: bucketsWith({ 4: 3 }),
          sentBy: [{ endpoint: "query:memo", count: 3, totalMs: 9 }],
        }),
        stat({ fingerprint: "bbbbbbbbbbbb", op: "count", totalMs: 50 }),
      ],
    ]);

    expect(merged.find((entry) => entry.fingerprint === "aaaaaaaaaaaa")).toMatchObject({
      count: 5,
      totalMs: 13,
      rows: 4,
      sinceMs: 9_000,
      buckets: bucketsWith({ 3: 2, 4: 3 }),
      sentBy: [{ endpoint: "query:memo", count: 5, totalMs: 13 }],
    });
    const view = StatementReport.view(merged);
    expect(view.byTotalTime.map((row) => row.fingerprint)).toEqual(["bbbbbbbbbbbb", "aaaaaaaaaaaa"]);
  });

  test("shows each row's age, the oldest replica's for a statement several replicas list", () => {
    const view = StatementReport.view(
      StatementReport.merge([[stat({ sinceMs: 1_500.4 })], [stat({ sinceMs: 62_000 })]]),
    );

    expect(view.byTotalTime[0].sinceMs).toBe(62_000);
  });

  test("reads the 95th percentile the way Prometheus reads a histogram", () => {
    expect(StatementReport.quantile(bucketsWith({}), 0.95)).toBe(0);
    expect(StatementReport.quantile(bucketsWith({ 0: 100 }), 0.95)).toBeCloseTo(0.095);
    expect(StatementReport.quantile(bucketsWith({ 0: 50, 9: 50 }), 0.95)).toBeCloseTo(95);
    expect(StatementReport.quantile(bucketsWith({ [STATEMENT_BUCKETS_SECONDS.length]: 1 }), 0.95)).toBe(10_000);
  });
});
