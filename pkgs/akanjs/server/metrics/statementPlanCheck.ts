import { Logger } from "akanjs/common";
import {
  type SentStatement,
  StatementFingerprint,
  type StatementPlanner,
  StatementProbe,
  type StatementSite,
} from "akanjs/service";
import { isLocalDevRuntime, type SignalTrace } from "akanjs/signal";
import type { SiteSeries, StatementStat } from "./statementMetrics";

interface PlanFinding {
  scans: string | null;
  sorts: boolean;
}

const SCAN = /^(?:SCAN (?:TABLE )?"?([^"\s]+)"?$|\s*(?:->\s+)?(?:Parallel )?Seq Scan on "?([^"\s]+)"?)/;
const SORT = /^(?:USE TEMP B-TREE FOR ORDER BY|\s*(?:->\s+)?Sort)$/;
const SEARCH_TABLES = /"search_(?:fts|doc)"|\bsearch_(?:fts|doc)\b/;
const AGGREGATE_OPS = new Set(["count", "insight"]);
const MAX_WARNINGS = 500;

export class StatementPlanCheck {
  static readonly minRows = 1_000;
  readonly #ignored: ReadonlySet<string>;
  readonly #warned = new Set<string>();
  readonly #logger = new Logger("QueryPlan");

  constructor(ignored: Iterable<string> = []) {
    this.#ignored = new Set(ignored);
  }

  static fromEnv(): StatementPlanCheck | null {
    if (!isLocalDevRuntime()) return null;
    const ignored = (process.env.AKAN_QUERY_PLAN_IGNORE ?? "")
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean);
    if (ignored.includes("all")) return null;
    return new StatementPlanCheck(ignored);
  }

  consider(
    stat: StatementStat,
    statement: SentStatement,
    params: readonly unknown[],
    site: StatementSite | undefined,
    series: SiteSeries,
    trace: SignalTrace | undefined,
  ) {
    if (stat.planPending || stat.planEpoch === StatementProbe.schemaEpoch || stat.count < stat.planDueAt) return;
    const { planner, sql } = statement;
    if (!planner || !this.#checks(stat, planner, params, site, series)) {
      stat.planEpoch = StatementProbe.schemaEpoch;
      return;
    }
    stat.planPending = true;
    const sentBy = trace ? trace.endpoint : "none";
    void this.#check(stat, planner, sql, [...params], series, sentBy).finally(() => {
      stat.planPending = false;
    });
  }

  //? An unfiltered count binds nothing (its filter compiles to `1 = 1`), and a count must read every row to answer.
  #checks(
    stat: StatementStat,
    planner: StatementPlanner,
    params: readonly unknown[],
    site: StatementSite | undefined,
    series: SiteSeries,
  ) {
    const { fingerprint, verb, table, text } = stat.shape;
    if (this.#ignored.has(fingerprint) || site?.planned === false) return false;
    if (verb !== "select" && verb !== "update" && verb !== "delete") return false;
    if (!table || !planner.isModelTable(table) || SEARCH_TABLES.test(text)) return false;
    return params.length > 0 || !AGGREGATE_OPS.has(series.op);
  }

  async #check(
    stat: StatementStat,
    planner: StatementPlanner,
    sql: string,
    params: readonly unknown[],
    series: SiteSeries,
    sentBy: string,
  ) {
    const epoch = StatementProbe.schemaEpoch;
    const table = stat.shape.table ?? "";
    try {
      if ((await planner.rowsUpTo(table, StatementPlanCheck.minRows)) < StatementPlanCheck.minRows) {
        stat.planDueAt = Math.max(stat.count * 2, 16);
        return;
      }
      const plan = await planner.explain(sql, params);
      stat.planEpoch = epoch;
      const finding = StatementPlanCheck.findingOf(plan, table);
      if (finding.scans || finding.sorts) this.#warn(stat, series, sentBy, finding, plan);
    } catch {
      stat.planEpoch = epoch;
    }
  }

  static findingOf(plan: readonly string[], table: string): PlanFinding {
    let scans: string | null = null;
    let sorts = false;
    for (const line of plan) {
      const scan = SCAN.exec(line);
      if (scan && (scan[1] ?? scan[2]) === table) scans = table;
      if (SORT.test(line)) sorts = true;
    }
    return { scans, sorts };
  }

  //? Security: a Postgres plan prints the values it was planned with, so its text is scrubbed of literals first.
  #warn(stat: StatementStat, series: SiteSeries, sentBy: string, finding: PlanFinding, plan: readonly string[]) {
    const planText = plan.map((line) => StatementFingerprint.scrub(line).trim()).join("; ");
    const { fingerprint, text } = stat.shape;
    const key = `${fingerprint}\u0000${planText}`;
    if (this.#warned.has(key) || this.#warned.size >= MAX_WARNINGS) return;
    this.#warned.add(key);
    const found = [
      finding.scans ? `reads every row of "${finding.scans}"` : null,
      finding.sorts ? "sorts its result in a temporary table" : null,
    ]
      .filter(Boolean)
      .join(" and ");
    this.#logger.warn(
      `${series.model}.${series.op} statement ${fingerprint}, sent by ${sentBy}, ${found}: ${text} [plan: ${planText}]. Add an index the filter and sort can use, or list ${fingerprint} in AKAN_QUERY_PLAN_IGNORE to accept it.`,
    );
  }
}
