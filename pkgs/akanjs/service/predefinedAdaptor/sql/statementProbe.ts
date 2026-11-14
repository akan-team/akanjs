import { AsyncLocalStorage } from "node:async_hooks";
import { StatementFingerprint, type StatementShape } from "./statementFingerprint";

export interface StatementSite {
  /** Empty outside a model call: the statement is then named by its table and verb. */
  readonly model: string;
  readonly op: string;
  readonly planned: boolean;
}

export interface StatementCall {
  readonly site: StatementSite;
  /** Statements the drivers sent during the call, a nested call's included. */
  sent: number;
}

export interface StatementPlanner {
  explain(sql: string, params: readonly unknown[]): Promise<string[]>;
  rowsUpTo(table: string, limit: number): Promise<number>;
  isModelTable(table: string): boolean;
}

export interface SentStatement {
  readonly shape: StatementShape;
  readonly sql: string;
  readonly planner: StatementPlanner | null;
}

export interface StatementSink {
  sent(
    statement: SentStatement,
    site: StatementSite | undefined,
    params: readonly unknown[],
    durationMs: number,
    waitMs: number,
    rows: number,
  ): void;
}

interface ProbeSlot {
  sink: StatementSink | null;
  calls: AsyncLocalStorage<StatementCall>;
  schemaEpoch: number;
}

// Pinned to `process`, as the trace ALS is: the driver may load in the app bundle and the sink in the framework runtime.
const probeStore = process as unknown as { __akanStatementProbe?: ProbeSlot };
probeStore.__akanStatementProbe ??= { sink: null, calls: new AsyncLocalStorage<StatementCall>(), schemaEpoch: 0 };
const probe = probeStore.__akanStatementProbe;

export class StatementProbe {
  static readonly #sites = [
    new Map<string, Map<string, StatementSite>>(),
    new Map<string, Map<string, StatementSite>>(),
  ];

  static install(sink: StatementSink | null) {
    probe.sink = sink;
  }

  static get schemaEpoch() {
    return probe.schemaEpoch;
  }

  static schemaChanged() {
    probe.schemaEpoch += 1;
  }

  static sent(statement: SentStatement, params: readonly unknown[], durationMs: number, waitMs: number, rows: number) {
    if (statement.shape.changesSchema) probe.schemaEpoch += 1;
    const call = probe.calls.getStore();
    if (call) call.sent += 1;
    probe.sink?.sent(statement, call?.site, params, durationMs, waitMs, rows);
  }

  static siteOf(model: string, op: string, planned = true): StatementSite {
    const byModel = StatementProbe.#sites[planned ? 0 : 1];
    let byOp = byModel.get(model);
    if (!byOp) {
      byOp = new Map();
      byModel.set(model, byOp);
    }
    let site = byOp.get(op);
    if (!site) {
      site = { model, op, planned };
      byOp.set(op, site);
    }
    return site;
  }

  static call(model: string, op: string): StatementCall {
    const planned = probe.calls.getStore()?.site.planned ?? true;
    return { site: StatementProbe.siteOf(model, op, planned), sent: 0 };
  }

  static within<T>(call: StatementCall, fn: () => Promise<T>): Promise<T> {
    const parent = probe.calls.getStore();
    if (!parent) return probe.calls.run(call, fn);
    return Promise.resolve(probe.calls.run(call, fn)).finally(() => {
      parent.sent += call.sent;
    });
  }

  static async unplanned<T>(fn: () => Promise<T>): Promise<T> {
    return await StatementProbe.within({ site: StatementProbe.siteOf("", "", false), sent: 0 }, fn);
  }

  static fixed(sql: string): SentStatement {
    return { shape: StatementFingerprint.of(sql), sql, planner: null };
  }
}
