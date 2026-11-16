import type { AkanStatementSender, AkanStatementStat } from "akanjs/service";

export const STATEMENT_BUCKETS_SECONDS: readonly number[] = [
  0.0001, 0.00025, 0.0005, 0.001, 0.0025, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10,
];

export interface StatementReportRow {
  fingerprint: string;
  text: string;
  model: string;
  op: string;
  count: number;
  totalMs: number;
  meanMs: number;
  p95Ms: number;
  waitMs: number;
  rows: number;
  /** The report covers the statements this process lists now, since it first listed them or last admitted them again; not a lifetime total. */
  sinceMs: number;
  sentBy: AkanStatementSender[];
}

export interface StatementReportBody {
  byTotalTime: StatementReportRow[];
  byP95: StatementReportRow[];
}

const round = (ms: number) => Math.round(ms * 1000) / 1000;

export class StatementReport {
  static readonly limit = 20;

  // Linear within a bucket, as Prometheus' `histogram_quantile` reads one; in milliseconds.
  static quantile(counts: readonly number[], q: number): number {
    const total = counts.reduce((sum, count) => sum + count, 0);
    if (!total) return 0;
    const rank = q * total;
    let seen = 0;
    for (const [idx, count] of counts.entries()) {
      if (count > 0 && seen + count >= rank) {
        if (idx >= STATEMENT_BUCKETS_SECONDS.length) return STATEMENT_BUCKETS_SECONDS[idx - 1] * 1000;
        const lower = idx ? STATEMENT_BUCKETS_SECONDS[idx - 1] : 0;
        return (lower + (STATEMENT_BUCKETS_SECONDS[idx] - lower) * ((rank - seen) / count)) * 1000;
      }
      seen += count;
    }
    return 0;
  }

  static merge(lists: readonly (readonly AkanStatementStat[] | undefined)[]): AkanStatementStat[] {
    const merged = new Map<string, AkanStatementStat>();
    for (const stat of lists.flatMap((list) => list ?? [])) {
      const into = merged.get(stat.fingerprint);
      if (!into) {
        merged.set(stat.fingerprint, {
          ...stat,
          buckets: [...stat.buckets],
          sentBy: stat.sentBy.map((s) => ({ ...s })),
        });
        continue;
      }
      if (stat.totalMs > into.totalMs) Object.assign(into, { model: stat.model, op: stat.op });
      into.count += stat.count;
      into.totalMs += stat.totalMs;
      into.waitMs += stat.waitMs;
      into.rows += stat.rows;
      into.sinceMs = Math.max(into.sinceMs, stat.sinceMs);
      if (into.buckets.length === stat.buckets.length)
        for (const [idx, count] of stat.buckets.entries()) into.buckets[idx] += count;
      for (const sender of stat.sentBy) {
        const known = into.sentBy.find((entry) => entry.endpoint === sender.endpoint);
        if (known) {
          known.count += sender.count;
          known.totalMs += sender.totalMs;
        } else into.sentBy.push({ ...sender });
      }
      into.sentBy = into.sentBy.sort((a, b) => b.totalMs - a.totalMs).slice(0, 3);
    }
    return [...merged.values()];
  }

  static view(stats: readonly AkanStatementStat[], limit = StatementReport.limit): StatementReportBody {
    const rows = stats.map((stat) => StatementReport.#row(stat));
    return {
      byTotalTime: [...rows].sort((a, b) => b.totalMs - a.totalMs).slice(0, limit),
      byP95: [...rows].sort((a, b) => b.p95Ms - a.p95Ms).slice(0, limit),
    };
  }

  static #row({ buckets, ...stat }: AkanStatementStat): StatementReportRow {
    return {
      fingerprint: stat.fingerprint,
      text: stat.text,
      model: stat.model,
      op: stat.op,
      count: stat.count,
      totalMs: round(stat.totalMs),
      meanMs: round(stat.count ? stat.totalMs / stat.count : 0),
      p95Ms: round(StatementReport.quantile(buckets, 0.95)),
      waitMs: round(stat.waitMs),
      rows: stat.rows,
      sinceMs: Math.round(stat.sinceMs),
      sentBy: stat.sentBy.map((sender) => ({ ...sender, totalMs: round(sender.totalMs) })),
    };
  }
}
