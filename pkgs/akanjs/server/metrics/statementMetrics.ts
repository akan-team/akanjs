import type { AkanStatementStat, SentStatement, StatementShape, StatementSink, StatementSite } from "akanjs/service";
import { StatementProbe } from "akanjs/service";
import { getCurrentTrace, type SignalTrace } from "akanjs/signal";
import type { CounterSeries, HistogramSeries } from "./metricRegistry";
import { metricRegistry, OVERFLOW_LABEL_VALUE } from "./metricRegistry";
import { SlowStatementLog } from "./slowStatementLog";
import { StatementPlanCheck } from "./statementPlanCheck";
import { STATEMENT_BUCKETS_SECONDS, StatementReport } from "./statementReport";

const LABELS = ["model", "op"] as const;
const MAX_SENDERS = 16;
const MAX_PLAN_VARIANTS = 8;

const statements = metricRegistry.counter(
  "akan_db_statements_total",
  "Statements sent to the database, by the model call that sent them.",
  LABELS,
);
const seconds = metricRegistry.counter(
  "akan_db_statement_seconds_total",
  "Time statements ran in the database, not counting the wait before they could start.",
  LABELS,
);
const waits = metricRegistry.counter(
  "akan_db_statement_wait_seconds_total",
  "Time statements waited for the SQLite write turn or a pooled Postgres connection before they ran.",
  LABELS,
);
const rowCounts = metricRegistry.counter(
  "akan_db_statement_rows_total",
  "Rows statements returned, or for a write, changed.",
  LABELS,
);
const durations = metricRegistry.histogram(
  "akan_db_statement_duration_seconds",
  "Time a statement ran in the database.",
  LABELS,
  STATEMENT_BUCKETS_SECONDS,
);

const bucketOf = (value: number) => {
  let idx = 0;
  while (idx < STATEMENT_BUCKETS_SECONDS.length && value > STATEMENT_BUCKETS_SECONDS[idx]) idx++;
  return idx;
};

export class SiteSeries {
  readonly model: string;
  readonly op: string;
  totalMs = 0;
  readonly #count: CounterSeries;
  readonly #seconds: CounterSeries;
  readonly #wait: CounterSeries;
  readonly #rows: CounterSeries;
  readonly #duration: HistogramSeries;

  constructor(model: string, op: string) {
    this.model = model;
    this.op = op;
    const labels = { model, op };
    this.#count = statements.series(labels);
    this.#seconds = seconds.series(labels);
    this.#wait = waits.series(labels);
    this.#rows = rowCounts.series(labels);
    this.#duration = durations.series(labels);
  }

  observe(bucket: number, durationMs: number, waitMs: number, rows: number) {
    const durationSeconds = durationMs / 1000;
    this.totalMs += durationMs;
    this.#count.inc();
    this.#seconds.inc(durationSeconds);
    if (waitMs) this.#wait.inc(waitMs / 1000);
    this.#rows.inc(rows);
    this.#duration.counts[bucket] += 1;
    this.#duration.sum += durationSeconds;
    this.#duration.count += 1;
  }
}

export interface PlanState {
  epoch: number;
  pending: boolean;
  dueAt: number;
}

interface Sender {
  count: number;
  totalMs: number;
}

export class StatementStat {
  readonly shape: StatementShape;
  count = 0;
  totalMs = 0;
  waitMs = 0;
  rows = 0;
  readonly buckets = new Float64Array(STATEMENT_BUCKETS_SECONDS.length + 1);
  slowLoggedAt = Number.NEGATIVE_INFINITY;
  slowSuppressed = 0;
  readonly #plans = new Map<string, PlanState>();
  readonly #sites = new Map<StatementSite, SiteSeries>();
  #outside: SiteSeries | null = null;
  readonly #senders = new Map<string, Map<string, Sender>>();
  #senderCount = 0;

  constructor(shape: StatementShape) {
    this.shape = shape;
  }

  //? Filters that differ only by a field path share one fingerprint, so a plan is kept per sent text, a few of them.
  planOf(variant: string): PlanState {
    let plan = this.#plans.get(variant);
    if (!plan) {
      if (this.#plans.size >= MAX_PLAN_VARIANTS) return this.planOf("");
      plan = { epoch: -1, pending: false, dueAt: 0 };
      this.#plans.set(variant, plan);
    }
    return plan;
  }

  siteOf(site: StatementSite | undefined): SiteSeries {
    if (!site?.model) {
      this.#outside ??= this.#series(this.shape.table ?? "none", this.shape.verb);
      return this.#outside;
    }
    let series = this.#sites.get(site);
    if (!series) {
      series = this.#series(site.model, site.op);
      this.#sites.set(site, series);
    }
    return series;
  }

  observe(site: SiteSeries, durationMs: number, waitMs: number, rows: number) {
    const bucket = bucketOf(durationMs / 1000);
    this.count += 1;
    this.totalMs += durationMs;
    this.waitMs += waitMs;
    this.rows += rows;
    this.buckets[bucket] += 1;
    site.observe(bucket, durationMs, waitMs, rows);
  }

  sentBy(trace: SignalTrace | undefined, durationMs: number) {
    const sender = this.#senderOf(trace?.endpointType ?? "", trace?.endpointKey ?? "none");
    sender.count += 1;
    sender.totalMs += durationMs;
  }

  #senderOf(type: string, key: string): Sender {
    let byKey = this.#senders.get(type);
    if (!byKey) {
      if (this.#senderCount >= MAX_SENDERS) return this.#senderOf("", OVERFLOW_LABEL_VALUE);
      byKey = new Map();
      this.#senders.set(type, byKey);
    }
    let sender = byKey.get(key);
    if (!sender) {
      if (this.#senderCount >= MAX_SENDERS && key !== OVERFLOW_LABEL_VALUE)
        return this.#senderOf("", OVERFLOW_LABEL_VALUE);
      sender = { count: 0, totalMs: 0 };
      byKey.set(key, sender);
      this.#senderCount += 1;
    }
    return sender;
  }

  toStat(): AkanStatementStat {
    const sites = [...this.#sites.values(), ...(this.#outside ? [this.#outside] : [])];
    const top = sites.reduce((best, site) => (site.totalMs > best.totalMs ? site : best), sites[0]);
    const sentBy = [...this.#senders].flatMap(([type, byKey]) =>
      [...byKey].map(([key, { count, totalMs }]) => ({
        endpoint: type ? `${type}:${key}` : key,
        count,
        totalMs,
      })),
    );
    return {
      fingerprint: this.shape.fingerprint,
      text: this.shape.text,
      model: top?.model ?? "none",
      op: top?.op ?? "none",
      count: this.count,
      totalMs: this.totalMs,
      waitMs: this.waitMs,
      rows: this.rows,
      buckets: [...this.buckets],
      sentBy: sentBy.sort((a, b) => b.totalMs - a.totalMs).slice(0, 3),
    };
  }

  #series(model: string, op: string) {
    return new SiteSeries(model, op);
  }
}

export class StatementMetrics implements StatementSink {
  static readonly maxStatements = 500;
  readonly #stats = new Map<string, StatementStat>();
  readonly slowLog = new SlowStatementLog();
  planCheck: StatementPlanCheck | null | undefined = undefined;

  sent(
    statement: SentStatement,
    site: StatementSite | undefined,
    params: readonly unknown[],
    durationMs: number,
    waitMs: number,
    rows: number,
  ) {
    const stat = this.#stats.get(statement.shape.fingerprint) ?? this.#admit(statement.shape);
    const series = stat.siteOf(site);
    const elapsedMs = durationMs + waitMs;
    stat.observe(series, durationMs, waitMs, rows);
    const trace = getCurrentTrace();
    stat.sentBy(trace, elapsedMs);
    if (trace?.mode === "full") trace.recordDbQuery(series.model, series.op, elapsedMs);
    if (elapsedMs >= this.slowLog.thresholdMs) this.slowLog.log(stat, series, { durationMs, waitMs, rows, trace });
    if (this.planCheck === undefined) this.planCheck = StatementPlanCheck.fromEnv();
    this.planCheck?.consider(stat, statement, params, site, series, trace);
  }

  top(limit: number): AkanStatementStat[] {
    const stats = [...this.#stats.values()];
    const byTime = [...stats].sort((a, b) => b.totalMs - a.totalMs).slice(0, limit);
    const bySlowest = stats
      .map((stat) => ({ stat, p95: StatementReport.quantile([...stat.buckets], 0.95) }))
      .sort((a, b) => b.p95 - a.p95)
      .slice(0, limit)
      .map(({ stat }) => stat);
    return [...new Set([...byTime, ...bySlowest])].map((stat) => stat.toStat());
  }

  reset() {
    this.#stats.clear();
  }

  //? The cheapest go first, past the bound: an app sending ad-hoc text would otherwise push out its costliest statements.
  #admit(shape: StatementShape) {
    if (this.#stats.size >= StatementMetrics.maxStatements) {
      const kept = [...this.#stats.values()]
        .sort((a, b) => b.totalMs - a.totalMs)
        .slice(0, Math.floor(StatementMetrics.maxStatements * 0.9));
      this.#stats.clear();
      for (const stat of kept) this.#stats.set(stat.shape.fingerprint, stat);
    }
    const stat = new StatementStat(shape);
    this.#stats.set(shape.fingerprint, stat);
    return stat;
  }
}

// Pinned to `process`, as the registry is: the report route and the driver's sink must read one set of statements.
const statementProcessStore = process as unknown as { __akanStatementMetrics?: StatementMetrics };
statementProcessStore.__akanStatementMetrics ??= new StatementMetrics();
export const statementMetrics: StatementMetrics = statementProcessStore.__akanStatementMetrics;
StatementProbe.install(statementMetrics);
