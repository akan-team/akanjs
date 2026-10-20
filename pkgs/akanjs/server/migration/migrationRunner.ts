import { Logger } from "akanjs/common";
import { createDocumentId, sanitizeJson } from "akanjs/document";
import { type DatabaseAdaptor, descriptorHash, stableJson } from "akanjs/service";
import { MigrationChangeLog } from "./migrationChangeLog";
import { MigrationChanges, type MigrationSkip } from "./migrationChanges";
import { MigrationContext, type MigrationGet } from "./migrationContext";
import { MigrationDefinition, type MigrationPlan } from "./migrationDefinition";
import { MigrationError } from "./migrationError";
import { MigrationLedger, type MigrationRun, type MigrationRunKind } from "./migrationLedger";
import { MigrationLock } from "./migrationLock";
import type { MigrationParamSpec } from "./migrationParams";
import { MigrationScope } from "./migrationScope";

export interface MigrationEntry {
  id: string;
  /** sha256 of the script's source: the ledger keeps which version of a script ran. */
  checksum: string;
  load: () => Promise<{ default?: unknown }>;
}

export interface MigrationRunnerOption {
  database: DatabaseAdaptor;
  get?: MigrationGet;
  buildId?: string | null;
  logger?: Logger;
}

export type MigrationStatus = "pending" | "applied" | "partial";

export interface MigrationListItem {
  id: string;
  title: string | null;
  checksum: string;
  /** `partial`: an apply outside one transaction failed after committing some of its batches. */
  status: MigrationStatus;
  appliedRunId: string | null;
  appliedAt: number | null;
  /** The applied run ran another version of the script than this build carries. */
  checksumMismatch: boolean;
  params: MigrationParamSpec[];
  error?: string;
}

export interface MigrationPlanResult {
  id: string;
  runId: string;
  planHash: string;
  params: Record<string, unknown>;
  summary: unknown;
  items: unknown[];
  itemCount: number;
}

export interface MigrationApplyResult {
  id: string;
  runId: string;
  planHash: string;
  summary: unknown;
  changes: number;
  problems: string[];
}

export interface MigrationVerifyResult {
  id: string;
  runId: string;
  problems: string[];
}

export interface MigrationRollbackRun {
  runId: string;
  target: string;
  reverted: number;
  skipped: MigrationSkip[];
}

export interface MigrationRollbackResult {
  id: string;
  runs: MigrationRollbackRun[];
}

export class MigrationRunner {
  static readonly defaultItemNum = 100;
  //* SQLite's busy_timeout: past it the live server's writes fail rather than wait for the run's transaction.
  static readonly sqliteHoldWarnMs = 5_000;
  readonly #entries: MigrationEntry[];
  readonly #database: DatabaseAdaptor;
  readonly #get: MigrationGet;
  readonly #buildId: string | null;
  readonly #logger: Logger;
  readonly #ledger: MigrationLedger;

  constructor(entries: MigrationEntry[], { database, get, buildId = null, logger }: MigrationRunnerOption) {
    this.#entries = entries;
    this.#database = database;
    this.#get =
      get ??
      (() => {
        throw new Error("ctx.get needs a booted server; run migrations through akan migrate or ops migrate");
      });
    this.#buildId = buildId;
    this.#logger = logger ?? new Logger("Migration");
    this.#ledger = new MigrationLedger(() => database.getConnection());
  }

  async list(): Promise<MigrationListItem[]> {
    const runs = await this.#ledger.runsOf();
    return await Promise.all(
      this.#entries.map(async (entry) => {
        const state = await this.#ledger.state(runs.filter((run) => run.migrationId === entry.id));
        const status: MigrationStatus = state.applied ? "applied" : state.partial.length ? "partial" : "pending";
        const item: MigrationListItem = {
          id: entry.id,
          title: null,
          checksum: entry.checksum,
          status,
          appliedRunId: state.applied?.id ?? null,
          appliedAt: state.applied?.finishedAt ?? null,
          checksumMismatch: !!state.applied && state.applied.checksum !== entry.checksum,
          params: [],
        };
        try {
          const definition = await MigrationRunner.#definition(entry);
          item.title = definition.title;
          item.params = definition.params.specs();
        } catch (error) {
          item.error = MigrationError.messageOf(error);
        }
        return item;
      }),
    );
  }

  async plan(
    id: string,
    raw: Record<string, string> = {},
    { actor = null, items = MigrationRunner.defaultItemNum }: { actor?: string | null; items?: number } = {},
  ): Promise<MigrationPlanResult> {
    const { entry, definition } = await this.#load(id);
    const params = definition.params.parse(raw);
    return await this.#locked(async () => {
      const run = await this.#begin("plan", entry, { params, actor });
      try {
        const plan = await this.#plan(definition, id, params);
        const planHash = await MigrationRunner.#planHash(params, plan);
        await this.#ledger.finish(run.id, { status: "done", planHash, summary: { plan: plan.summary } });
        const report = (sanitizeJson(plan.items ?? []) ?? []) as unknown[];
        return {
          id,
          runId: run.id,
          planHash,
          params: MigrationRunner.#json(params),
          summary: sanitizeJson(plan.summary),
          items: report.slice(0, Math.max(0, items)),
          itemCount: report.length,
        };
      } catch (error) {
        throw await this.#failed(run.id, error);
      }
    });
  }

  /**
   * Recomputes the plan inside the run's own transaction and refuses when it no longer hashes to `expect`, the plan a
   * person approved. Verify runs once the writes commit; its problems leave the run applied but the result not ok.
   */
  async apply(
    id: string,
    raw: Record<string, string> = {},
    { expect = null, actor = null }: { expect?: string | null; actor?: string | null } = {},
  ): Promise<MigrationApplyResult> {
    const { entry, definition } = await this.#load(id);
    const applyStage = definition.applyStage;
    if (!applyStage) throw new MigrationError("usage", `${id} declares no .apply()`);
    const params = definition.params.parse(raw);
    const { transaction, batchSize } = definition.settings;
    return await this.#locked(async () => {
      const state = await this.#ledger.state(await this.#ledger.runsOf(id));
      if (state.applied)
        throw new MigrationError("alreadyApplied", `${id} was applied by run ${state.applied.id}; roll it back first`);
      const resumed = transaction ? null : (state.partial[0] ?? null);
      if (resumed && MigrationRunner.#hashable(resumed.params) !== MigrationRunner.#hashable(params))
        throw new MigrationError(
          "invalidParam",
          `run ${resumed.id} stopped partway with other params; apply with the same params to resume it, or roll it back`,
        );
      const run = await this.#begin("apply", entry, { params, actor, checkpoint: resumed?.checkpoint ?? null });
      const log = new MigrationChangeLog(run.id, () => this.#database.getConnection());
      const scope = new MigrationScope({
        database: this.#database,
        readOnly: false,
        batchSize,
        log,
        checkpoints: transaction ? null : { runId: run.id, ledger: this.#ledger, resumed: resumed?.checkpoint ?? {} },
      });
      const planned: { hash: string; summary: unknown } = { hash: "", summary: null };
      const warning = this.#warnOnLongHold(id, transaction);
      try {
        await this.#run(transaction, async () => {
          //* Postgres: the plan and the writes read one snapshot, and a row the live server changed since fails the run.
          if (transaction && scope.dialect.name === "postgres")
            await scope.connection().execute("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ");
          const plan = await this.#plan(definition, id, params);
          planned.hash = await MigrationRunner.#planHash(params, plan);
          planned.summary = sanitizeJson(plan.summary);
          if (expect && expect !== planned.hash)
            throw new MigrationError("planChanged", `${id}'s plan changed since it was approved; plan it again`);
          await applyStage(this.#context(id, params, scope), plan);
        });
      } catch (error) {
        const changes = await MigrationChangeLog.count(this.#database.getConnection(), run.id);
        throw await this.#failed(run.id, error, {
          status: MigrationError.codeOf(error) === "planChanged" ? "aborted" : "failed",
          planHash: planned.hash || null,
          summary: { plan: planned.summary, changes },
        });
      } finally {
        if (warning) clearTimeout(warning);
      }
      const changes = await MigrationChangeLog.count(this.#database.getConnection(), run.id);
      const problems = await this.#verify(definition, id, params);
      await this.#ledger.finish(run.id, {
        status: "done",
        planHash: planned.hash,
        summary: { plan: planned.summary, changes, problems },
      });
      return { id, runId: run.id, planHash: planned.hash, summary: planned.summary, changes, problems };
    });
  }

  async verify(id: string, raw: Record<string, string> = {}, { actor = null }: { actor?: string | null } = {}) {
    const { entry, definition } = await this.#load(id);
    if (!definition.verifyStage) throw new MigrationError("usage", `${id} declares no .verify()`);
    const params = definition.params.parse(raw);
    return await this.#locked(async (): Promise<MigrationVerifyResult> => {
      const run = await this.#begin("verify", entry, { params, actor });
      const problems = await this.#verify(definition, id, params);
      await this.#ledger.finish(run.id, { status: "done", summary: { problems } });
      return { id, runId: run.id, problems };
    });
  }

  /**
   * `target` is an apply run, or a migration id for every run of it not yet rolled back, newest first. Works for a
   * script this build no longer carries: the change log alone is enough for the default rollback.
   */
  async rollback(target: string, { actor = null }: { actor?: string | null } = {}): Promise<MigrationRollbackResult> {
    return await this.#locked(async () => {
      const applies = await this.#rollbackTargets(target);
      const runs: MigrationRollbackRun[] = [];
      for (const apply of applies) runs.push(await this.#rollbackRun(apply, actor));
      return { id: applies[0]?.migrationId ?? target, runs };
    });
  }

  async #rollbackTargets(target: string) {
    const run = await this.#ledger.get(target);
    if (run) {
      if (run.kind !== "apply") throw new MigrationError("usage", `run ${target} is a ${run.kind}, not an apply`);
      const runs = await this.#ledger.runsOf(run.migrationId);
      const state = await this.#ledger.state(runs);
      if (state.applied?.id !== run.id && !state.partial.some(({ id }) => id === run.id))
        throw new MigrationError("notApplied", `run ${target} has nothing left to roll back`);
      return [run];
    }
    const state = await this.#ledger.state(await this.#ledger.runsOf(target));
    const applies = [state.applied, ...state.partial]
      .filter((apply): apply is MigrationRun => !!apply)
      .sort((a, b) => b.startedAt - a.startedAt);
    if (!applies.length) {
      if (!this.#entries.some(({ id }) => id === target))
        throw new MigrationError("notFound", `${target} is neither a migration of this build nor a run in the ledger`);
      throw new MigrationError("notApplied", `${target} has no applied run to roll back`);
    }
    return applies;
  }

  async #rollbackRun(apply: MigrationRun, actor: string | null): Promise<MigrationRollbackRun> {
    const entry = this.#entries.find(({ id }) => id === apply.migrationId) ?? null;
    const definition = entry ? await MigrationRunner.#definition(entry) : null;
    if (entry && entry.checksum !== apply.checksum)
      this.#logger.warn(
        `${apply.migrationId} changed since run ${apply.id} applied it; rolling back with this build's`,
      );
    const params = apply.params ?? {};
    const run = await this.#begin("rollback", entry ?? { id: apply.migrationId, checksum: apply.checksum }, {
      params,
      actor,
      target: apply.id,
    });
    const { transaction, batchSize } = definition?.settings ?? { transaction: true, batchSize: 500 };
    const log = new MigrationChangeLog(run.id, () => this.#database.getConnection());
    const scope = new MigrationScope({ database: this.#database, readOnly: false, batchSize, log });
    const ctx = this.#context(apply.migrationId, params, scope);
    const entries = await MigrationChangeLog.entries(this.#database.getConnection(), apply.id);
    const changes = new MigrationChanges(entries, (name) => ctx.table(name));
    const rollbackStage = definition?.rollbackStage;
    try {
      await this.#run(transaction, async () => {
        if (rollbackStage) await rollbackStage(ctx, changes);
        else await changes.revertAll();
      });
    } catch (error) {
      throw await this.#failed(run.id, error, { summary: { reverted: changes.reverted, skipped: changes.skipped } });
    }
    await this.#ledger.finish(run.id, {
      status: "done",
      summary: { reverted: changes.reverted, skipped: changes.skipped },
    });
    return { runId: run.id, target: apply.id, reverted: changes.reverted, skipped: changes.skipped };
  }

  async #plan(definition: MigrationDefinition<Record<string, unknown>>, id: string, params: Record<string, unknown>) {
    const scope = new MigrationScope({
      database: this.#database,
      readOnly: true,
      batchSize: definition.settings.batchSize,
    });
    const plan = definition.planStage ? await definition.planStage(this.#context(id, params, scope)) : { summary: {} };
    return plan as MigrationPlan;
  }

  async #verify(definition: MigrationDefinition<Record<string, unknown>>, id: string, params: Record<string, unknown>) {
    if (!definition.verifyStage) return [];
    const scope = new MigrationScope({
      database: this.#database,
      readOnly: true,
      batchSize: definition.settings.batchSize,
    });
    try {
      return (await definition.verifyStage(this.#context(id, params, scope))).map(String);
    } catch (error) {
      this.#logger.error(
        `${id} verify threw: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`,
      );
      return [`verify threw: ${MigrationError.messageOf(error)}`];
    }
  }

  #context(id: string, params: Record<string, unknown>, scope: MigrationScope) {
    return new MigrationContext({ id, params, logger: new Logger(`Migration:${id}`), get: this.#get, scope });
  }

  async #run(transaction: boolean, fn: () => Promise<void>) {
    if (transaction) await this.#database.transaction(fn);
    else await fn();
  }

  #warnOnLongHold(id: string, transaction: boolean) {
    if (!transaction || this.#database.dialect?.name !== "sqlite") return null;
    const timer = setTimeout(() => {
      this.#logger.warn(
        `${id} has held the SQLite write lock for ${MigrationRunner.sqliteHoldWarnMs / 1000}s; the live server's writes fail until it commits. A long run belongs in .config({ transaction: false })`,
      );
    }, MigrationRunner.sqliteHoldWarnMs);
    timer.unref?.();
    return timer;
  }

  async #locked<T>(fn: () => Promise<T>) {
    const lock = new MigrationLock(() => this.#database.getConnection());
    if (!(await lock.acquire()))
      throw new MigrationError("locked", "Another migration run holds the lock; try again once it finishes");
    try {
      await this.#ledger.interruptRunning();
      return await fn();
    } finally {
      await lock.release();
    }
  }

  async #begin(
    kind: MigrationRunKind,
    entry: Pick<MigrationEntry, "id" | "checksum">,
    {
      params,
      actor,
      target = null,
      checkpoint = null,
    }: {
      params: Record<string, unknown>;
      actor: string | null;
      target?: string | null;
      checkpoint?: Record<string, string> | null;
    },
  ) {
    return await this.#ledger.insert({
      id: createDocumentId(),
      migrationId: entry.id,
      kind,
      status: "running",
      target,
      checksum: entry.checksum,
      buildId: this.#buildId,
      params: MigrationRunner.#json(params),
      planHash: null,
      summary: null,
      actor,
      checkpoint,
      startedAt: Date.now(),
      finishedAt: null,
      error: null,
    });
  }

  async #failed(
    runId: string,
    error: unknown,
    {
      status = "failed",
      planHash = null,
      summary = null,
    }: { status?: "failed" | "aborted"; planHash?: string | null; summary?: Record<string, unknown> | null } = {},
  ) {
    if (status === "failed")
      this.#logger.error(
        `run ${runId} failed: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`,
      );
    await this.#ledger.finish(runId, { status, planHash, summary, error: MigrationError.messageOf(error) });
    return MigrationError.recorded(error, runId);
  }

  async #load(id: string) {
    const entry = this.#entries.find((entry) => entry.id === id);
    if (!entry) throw new MigrationError("notFound", `This build carries no migration "${id}"`);
    return { entry, definition: await MigrationRunner.#definition(entry) };
  }

  static async #definition(entry: MigrationEntry) {
    const definition = (await entry.load()).default;
    if (!MigrationDefinition.is(definition))
      throw new MigrationError("usage", `script/migration/${entry.id}.ts must export default migration(...)`);
    return definition;
  }

  static async #planHash(params: Record<string, unknown>, plan: MigrationPlan) {
    return await descriptorHash({ params: sanitizeJson(params), plan: sanitizeJson(plan) });
  }

  static #hashable(params: Record<string, unknown> | null) {
    return stableJson(sanitizeJson(params ?? {}));
  }

  static #json(params: Record<string, unknown>) {
    return (sanitizeJson(params) ?? {}) as Record<string, unknown>;
  }
}
