import path from "node:path";
import type { Logger } from "akanjs/common";
import type { BuilderMessage, ChangeBatch, DevBuildStatus } from "akanjs/server";
import type { App } from "../commandDecorators";
import type { BackendImportGraph } from "./BackendImportGraph";
import type { BuilderGap } from "./builderGap";
import type { BuilderRssRecycler } from "./builderRssRecycler";
import type { DevBackend } from "./devBackend";
import type { BuilderRecoveryReason, DevBuilder } from "./devBuilder";
import type { DevBuildStatusBoard } from "./devBuildStatusBoard";
import {
  backendRestartReasonFromMessage,
  isLegacyBackendFallbackFile,
  mergeInvalidateMessages,
  shouldRefreshConfigOnIdleWake,
  shouldRestartBackendByDevPlan,
  shouldRestartBuilderByDevPlan,
  shouldRestartDevHostByDevPlan,
} from "./devHostPolicy";

type InvalidateMessage = Extract<BuilderMessage, { type: "invalidate" }>;

export class DevRecycler {
  readonly #app: App;
  readonly #env: Record<string, string>;
  readonly #logger: Logger;
  readonly #isStopping: () => boolean;
  readonly #graph: BackendImportGraph;
  readonly #statuses: DevBuildStatusBoard;
  readonly #backend: DevBackend;
  readonly #builder: DevBuilder;
  readonly #gap: BuilderGap;
  readonly #rss: BuilderRssRecycler;
  #pending: {
    message: InvalidateMessage;
    refreshConfig: boolean;
    failed?: boolean;
    failedGeneration?: number;
  } | null = null;
  //? A restart that failed after its change applied (the builder or backend did not come up): the builder's return is
  //? its recovery, reported past the failure's generation so the scan overlay clears.
  #restartFailedAfterApply: number | null = null;

  constructor(
    app: App,
    parts: {
      env: Record<string, string>;
      logger: Logger;
      isStopping: () => boolean;
      graph: BackendImportGraph;
      statuses: DevBuildStatusBoard;
      backend: DevBackend;
      builder: DevBuilder;
      gap: BuilderGap;
      rss: BuilderRssRecycler;
    },
  ) {
    this.#app = app;
    this.#env = parts.env;
    this.#logger = parts.logger;
    this.#isStopping = parts.isStopping;
    this.#graph = parts.graph;
    this.#statuses = parts.statuses;
    this.#backend = parts.backend;
    this.#builder = parts.builder;
    this.#gap = parts.gap;
    this.#rss = parts.rss;
  }

  get pending(): boolean {
    return !!this.#pending;
  }

  drop(): void {
    this.#pending = null;
  }

  async handleInvalidate(message: InvalidateMessage) {
    this.#logDevPlan(message);
    this.#rss.rearm();
    // Checked first: a dev-host restart also recycles the builder and backend.
    const wantsDevHostRestart = shouldRestartDevHostByDevPlan(message);
    const pending = this.#pending;
    // A deferred recycle resumes on the next code batch; a css-only batch cannot heal a compile error.
    const resumes = !!pending && message.kinds.includes("code") && this.#touchesFailedRecycle(message.files);
    if (wantsDevHostRestart || shouldRestartBuilderByDevPlan(message) || resumes) {
      const refreshConfig = wantsDevHostRestart || (pending?.refreshConfig ?? false);
      const merged = pending ? mergeInvalidateMessages(pending.message, message) : message;
      const generation = message.devPlan?.generation ?? message.generation;
      if (this.#statuses.failedAt(generation)) {
        this.#defer(merged, { refreshConfig, generation });
        return;
      }
      await this.apply(merged, refreshConfig);
      return;
    }
    if (await this.#shouldRestartBackend(message)) {
      this.#backend.scheduleRestart(backendRestartReasonFromMessage(message));
      return;
    }
    this.#backend.send(message);
  }

  async apply(message: InvalidateMessage, refreshConfig: boolean): Promise<void> {
    if (this.#isStopping()) return;
    this.#pending = null;
    const progress = { applied: !refreshConfig };
    try {
      if (refreshConfig) await this.#restartDevHost(message, progress);
      else await this.#restartDevChildren(message);
    } catch (err) {
      const kind = refreshConfig ? "Config" : "Runtime metadata";
      const generation = this.#recordRestartFailure(message, err, kind, { applied: progress.applied });
      //? Kept only when the change itself did not apply: a builder that booted degraded (a broken akan.config.ts)
      //? takes the fixing save itself and sends no invalidate, so without this the old config would keep running.
      if (progress.applied) this.#restartFailedAfterApply = generation;
      else this.#pending = { message, refreshConfig, failed: true, failedGeneration: generation };
      this.#resurrectDevChildren(message);
    }
  }

  //? The first green pages build after a failed restart that touches its change is the fix: the change applies then. A
  //? cause no save fixes (an env value) waits for the next change of those files, not for every green save.
  async resumeFailed(status: DevBuildStatus): Promise<void> {
    const pending = this.#pending;
    if (!pending?.failed || !status.ok || status.phase !== "pages" || !this.#touchesFailedRecycle(status.files)) return;
    //? Newer than the failure: the batch that carried the change reports its own pages ok while the restart runs.
    if (status.generation <= (pending.failedGeneration ?? -1)) return;
    await this.apply(pending.message, pending.refreshConfig);
  }

  async applyIdleWake(batch: ChangeBatch | null): Promise<void> {
    const files = batch?.files ?? [];
    if (shouldRefreshConfigOnIdleWake(batch)) {
      this.#logger.verbose("[idle-suspend] config changed while suspended; restarting the dev host");
      // Replaces the backend too, and a baseline kept past its own gap costs a restart at the next one.
      this.#gap.discard("config change replaces the backend anyway");
      //? Through the same path as a save's: a failure is reported and stays pending, as one would be awake.
      await this.apply({ type: "invalidate", kinds: [...(batch?.kinds ?? [])], files }, true);
      return;
    }
    // Refresh before deciding: a file created while suspended is not in the graph yet.
    if (files.length > 0) await this.#graph.refresh();
    await this.#builder.start({ announceBootState: true });
    // Merged: the watcher's batch and the stamps overlap on the ordinary one-save-during-suspend case.
    const missed = await this.#gap.take();
    const backendFiles = [...new Set([...files.filter((file) => this.#graph.has(file)), ...missed])];
    if (backendFiles.length === 0) return;
    this.#logger.verbose(`[idle-suspend] ${backendFiles.length} backend file(s) changed while suspended`);
    this.#backend.scheduleRestart({ files: backendFiles, roles: [] });
  }

  builderRecovered(reason: BuilderRecoveryReason): void {
    void this.#gap.restartBackendForChanges();
    const failedAfterApply = this.#restartFailedAfterApply;
    this.#restartFailedAfterApply = null;
    const status: DevBuildStatus = {
      generation:
        failedAfterApply !== null
          ? this.#statuses.nextBackendGeneration(failedAfterApply + 1)
          : (reason.generation ?? this.#statuses.nextBackendGeneration()),
      phase: "scan",
      ok: true,
      files: reason.files,
      message: "Builder recovered",
    };
    this.#statuses.record(status);
    this.#backend.sendOrQueueStatus(status);
    if (!this.#backend.running && !this.#backend.recovering) {
      this.#backend.start({ generation: reason.generation, files: reason.files });
    }
  }

  #touchesFailedRecycle(files: string[]): boolean {
    const pending = this.#pending;
    if (!pending?.failed) return true;
    const changed = new Set(pending.message.files);
    return files.some((file) => changed.has(file));
  }

  #defer(message: InvalidateMessage, { refreshConfig, generation }: { refreshConfig: boolean; generation?: number }) {
    this.#pending = { message, refreshConfig };
    const kind = refreshConfig ? "Config" : "Runtime metadata";
    this.#logger.warn(
      `[dev-host] ${kind.toLowerCase()} restart deferred generation=${generation ?? "(unknown)"}; keeping the running dev server until the build error is fixed`,
    );
    const status: DevBuildStatus = {
      generation: generation ?? this.#statuses.nextBackendGeneration(),
      phase: "scan",
      ok: false,
      files: message.files,
      message: `${kind} change is on hold while the build is failing; it will apply automatically once the error is fixed.`,
    };
    this.#statuses.record(status);
    this.#backend.sendOrQueueStatus(status);
  }

  // The backend returns on the last-good artifact so the error overlay stays reachable.
  #resurrectDevChildren(message: InvalidateMessage): void {
    const generation = message.devPlan?.generation ?? message.generation;
    if (!this.#backend.running) this.#backend.start({ generation, files: message.files });
    this.#builder.scheduleRecovery({ generation, files: message.files });
  }

  async #restartDevChildren(message: InvalidateMessage): Promise<void> {
    const generation = message.devPlan?.generation ?? message.generation;
    this.#logger.warn(
      `[dev-host] recycling builder/backend for runtime metadata generation=${generation ?? "(unknown)"} files=${message.files.length}`,
    );
    await this.#recycleDevChildren(message);
  }

  // The config is re-imported with a cache-busting query, but modules it imports stay cached: a change inside an
  // imported plugin file still needs a manual `akan start` restart.
  async #restartDevHost(message: InvalidateMessage, progress?: { applied: boolean }): Promise<void> {
    const generation = message.devPlan?.generation ?? message.generation;
    this.#logger.warn(
      `[dev-host] config change detected; restarting dev host generation=${generation ?? "(unknown)"} files=${message.files.length}`,
    );
    await this.#recycleDevChildren(message, { refreshConfig: true, progress });
  }

  async #recycleDevChildren(
    message: InvalidateMessage,
    { refreshConfig = false, progress }: { refreshConfig?: boolean; progress?: { applied: boolean } } = {},
  ): Promise<void> {
    const generation = message.devPlan?.generation ?? message.generation;
    this.#backend.cancelTimers();
    this.#builder.cancelRecovery();
    this.#builder.resetRecovery();
    this.#backend.dropPendingRestart();
    await this.#backend.restarting;
    this.#statuses.reset();
    this.#backend.dropQueuedStatuses();
    await this.#backend.stop();
    this.#builder.stop();
    this.#builder.clearPatcherOff();
    if (refreshConfig) {
      await this.#app.getConfig({ refresh: true });
      // Merge, not replace: `start()` added values prepare does not produce (REDIS_HOST from the tunnel).
      const { env } = await this.#app.prepareCommand("start");
      Object.assign(this.#env, env);
      if (progress) progress.applied = true;
    }
    await this.#graph.refresh();
    await this.#builder.start();
    this.#backend.start({ generation, files: message.files });
  }

  #recordRestartFailure(
    message: InvalidateMessage,
    err: unknown,
    kind: "Config" | "Runtime metadata",
    { applied }: { applied: boolean },
  ): number {
    const generation = message.devPlan?.generation ?? message.generation ?? this.#statuses.nextBackendGeneration();
    const detail = err instanceof Error ? err.message : String(err);
    this.#logger.warn(`[dev-host] ${kind.toLowerCase()} restart failed generation=${generation}: ${detail}`);
    const names = message.files.slice(0, 3).map((file) => path.basename(file));
    const saved = names.length > 0 ? names.join(", ") : "the changed file";
    const status: DevBuildStatus = {
      generation,
      phase: "scan",
      ok: false,
      files: message.files,
      message: applied
        ? `${kind} change applied, but the dev server failed to restart: ${detail}. It is recovering on its own.`
        : `${kind} change failed to apply: ${detail}. The dev server keeps running on the previous ${kind.toLowerCase()}; once it is fixed, save ${saved} again or restart the dev server to apply it.`,
    };
    this.#statuses.record(status);
    this.#backend.sendOrQueueStatus(status);
    return generation;
  }

  #logDevPlan(message: InvalidateMessage): void {
    if (!message.devPlan) return;
    const { generation, roles, actions, reasonByFile } = message.devPlan;
    this.#logger.verbose(
      `[dev-plan] generation=${generation} roles=${roles.join(",") || "(none)"} actions=${actions.join(",") || "(none)"} reasons=${Object.keys(reasonByFile).length}`,
    );
  }

  async #shouldRestartBackend(message: InvalidateMessage): Promise<boolean> {
    if (message.kinds.length === 1 && message.kinds[0] === "css") return false;
    if (message.devPlan) {
      const shouldRestart = shouldRestartBackendByDevPlan(message) ?? false;
      if (shouldRestart && message.kinds.includes("code")) await this.#graph.refresh();
      return shouldRestart;
    }
    if (message.kinds.includes("code")) await this.#graph.refresh();
    if (message.files.some((file) => this.#graph.has(file))) return true;
    if (!this.#graph.lastRefreshSucceeded) {
      const fallbackFiles = message.files.filter((file) =>
        isLegacyBackendFallbackFile(file, this.#app.workspace.workspaceRoot),
      );
      if (fallbackFiles.length > 0) {
        this.#logger.warn(
          `[backend-graph] using path-role fallback for legacy invalidate; restart files=${fallbackFiles.length}`,
        );
        return true;
      }
    }
    return false;
  }
}
