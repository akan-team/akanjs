import { Logger } from "akanjs/common";
import type { SignalTrace } from "akanjs/signal";
import type { SiteSeries, StatementStat } from "./statementMetrics";

interface SlowStatement {
  durationMs: number;
  waitMs: number;
  rows: number;
  trace: SignalTrace | undefined;
}

const round = (ms: number) => Math.round(ms * 10) / 10;

export class SlowStatementLog {
  static readonly defaultThresholdMs = 200;
  static readonly repeatWindowMs = 60_000;
  #thresholdMs: number | null = null;

  get thresholdMs(): number {
    this.#thresholdMs ??= SlowStatementLog.thresholdOf(process.env.AKAN_LOG_SLOW_STATEMENT_MS);
    return this.#thresholdMs;
  }

  set thresholdMs(ms: number | null) {
    this.#thresholdMs = ms;
  }

  static thresholdOf(value: string | undefined): number {
    if (value === undefined || value.trim() === "") return SlowStatementLog.defaultThresholdMs;
    if (value.trim().toLowerCase() === "off") return Number.POSITIVE_INFINITY;
    const ms = Number(value);
    if (!Number.isFinite(ms) || ms < 0) return SlowStatementLog.defaultThresholdMs;
    return ms === 0 ? Number.POSITIVE_INFINITY : ms;
  }

  //? Security: the line carries the normalized text only, every value a `?`; bound parameters never reach it.
  log(stat: StatementStat, site: SiteSeries, { durationMs, waitMs, rows, trace }: SlowStatement, now = Date.now()) {
    if (now - stat.slowLoggedAt < SlowStatementLog.repeatWindowMs) {
      stat.slowSuppressed += 1;
      return;
    }
    const suppressed = stat.slowSuppressed;
    stat.slowLoggedAt = now;
    stat.slowSuppressed = 0;
    const sentBy = trace ? trace.endpoint : "none";
    const { fingerprint, text } = stat.shape;
    Logger.emit({
      level: "warn",
      name: "SlowStatement",
      message: `${site.model}.${site.op} statement ${fingerprint} took ${round(durationMs)}ms (waited ${round(waitMs)}ms, ${rows} rows), sent by ${sentBy}: ${text}`,
      attrs: {
        fingerprint,
        model: site.model,
        op: site.op,
        ms: round(durationMs),
        waitMs: round(waitMs),
        rows,
        sentBy,
        ...(trace ? { traceId: trace.traceId } : {}),
        ...(suppressed ? { suppressed } : {}),
      },
    });
  }
}
