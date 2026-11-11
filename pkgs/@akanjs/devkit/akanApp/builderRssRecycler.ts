import type { Logger } from "akanjs/common";
import type { BuilderMetrics } from "akanjs/server";
import { IncrementalBuilderHost } from "../incrementalBuilder";
import type { DevBuildStatusBoard } from "./devBuildStatusBoard";
import {
  BUILDER_MIN_RSS_RECYCLE_INTERVAL_MS,
  decideBuilderRssRecycle,
  decideBuilderRssSettle,
  isRssCeilingUnreachable,
  shouldWarnBuilderRssCeilingTight,
} from "./devHostPolicy";
import { ProcessRss } from "./processRss";

const asMib = (bytes: number) => Math.round(bytes / 1024 / 1024);

// Recycling mid-burst of saves would drop watcher events still on their way to the builder.
const BUILDER_RSS_RECYCLE_QUIET_MS = 750;

// Linux returns about half of the bundler arenas after ~10-15s idle (macOS none), so re-read the peak before recycling.
const BUILDER_RSS_SETTLE_MS = 20_000;

interface BuilderRssRecyclerLinks {
  builder: () => IncrementalBuilderHost | null;
  away: () => boolean;
  restartQueued: () => boolean;
  onRecycle: () => void;
}

export class BuilderRssRecycler {
  readonly #logger: Logger;
  readonly #statuses: DevBuildStatusBoard;
  readonly #links: BuilderRssRecyclerLinks;
  #timer: ReturnType<typeof setTimeout> | null = null;
  #reason: string | null = null;
  #lastRecycleAtMono: number | null = null;
  #ceilingTightReports = 0;
  #ceilingTightWarned = false;
  #settleToken = 0;
  #over: { rssBytes: number; ceilingBytes: number } | null = null;
  #ceilingAbandoned = false;

  constructor({ logger, statuses }: { logger: Logger; statuses: DevBuildStatusBoard }, links: BuilderRssRecyclerLinks) {
    this.#logger = logger;
    this.#statuses = statuses;
    this.#links = links;
  }

  get armed(): boolean {
    return !!this.#reason;
  }

  handleMetrics(metrics: BuilderMetrics): void {
    if (this.#ceilingAbandoned) return;
    const ceilingBytes = IncrementalBuilderHost.maxRssBytes();
    const decision = decideBuilderRssRecycle({
      rssBytes: metrics.rssBytes,
      ceilingBytes,
      buildFailed: this.#statuses.failedAt(metrics.generation),
      msSinceLastRecycle: this.#lastRecycleAtMono === null ? null : performance.now() - this.#lastRecycleAtMono,
    });
    if (decision === "below-ceiling") {
      this.#ceilingTightReports = 0;
      return;
    }
    if (decision === "unbounded") return;
    if (decision === "build-failed") {
      this.#logger.verbose(
        `[builder-recycle] deferred: generation=${metrics.generation} has a failing build, so a replacement would hit the same error`,
      );
      return;
    }
    if (decision === "too-soon") {
      this.#ceilingTightReports += 1;
      if (this.#ceilingTightWarned || !shouldWarnBuilderRssCeilingTight(this.#ceilingTightReports)) return;
      this.#ceilingTightWarned = true;
      // Warn only: the per-interval recycle is the one bound between the bundler's arenas and the sandbox limit.
      this.#logger.warn(
        `[builder-recycle] the builder is back at ${asMib(metrics.rssBytes)}MiB within ${Math.round(BUILDER_MIN_RSS_RECYCLE_INTERVAL_MS / 1000)}s of a recycle, so the ${asMib(ceilingBytes ?? 0)}MiB ceiling costs about one boot build per interval while you keep building. Raise AKAN_BUILDER_MAX_RSS_MB if that trade is wrong for this app, or set it to 0 to leave the builder unbounded.`,
      );
      return;
    }
    this.#arm(`rss=${asMib(metrics.rssBytes)}MiB>=${asMib(ceilingBytes ?? 0)}MiB after ${metrics.workCount} build(s)`, {
      rssBytes: metrics.rssBytes,
      ceilingBytes: ceilingBytes ?? 0,
    });
  }

  // Read from the OS at ready: a metrics report arrives only after a build, measuring the work, not the floor.
  async checkRecycledFloor(): Promise<void> {
    if (this.#ceilingAbandoned || this.#lastRecycleAtMono === null) return;
    const ceilingBytes = IncrementalBuilderHost.maxRssBytes();
    const pid = this.#links.builder()?.pid;
    if (!ceilingBytes || !pid) return;
    const freshRssBytes = await ProcessRss.bytesOf(pid);
    if (!isRssCeilingUnreachable(freshRssBytes, ceilingBytes)) return;
    this.#ceilingAbandoned = true;
    this.#logger.error(
      `[builder-recycle] a freshly recycled builder is already at ${asMib(freshRssBytes ?? 0)}MiB with nothing built on demand, so the ${asMib(ceilingBytes)}MiB ceiling cannot be met for this app; no longer enforcing it this session. Raise AKAN_BUILDER_MAX_RSS_MB, or set it to 0 to leave the builder unbounded.`,
    );
  }

  rearm(): void {
    if (this.#reason) this.#arm(this.#reason);
  }

  cancel(): void {
    this.#reason = null;
    this.#over = null;
    // Also drops any settle check already waiting, which would otherwise recycle after the cancel.
    this.#settleToken += 1;
    if (!this.#timer) return;
    clearTimeout(this.#timer);
    this.#timer = null;
  }

  #arm(reason: string, over?: { rssBytes: number; ceilingBytes: number }): void {
    if (this.#reason !== reason)
      this.#logger.verbose(`[builder-recycle] armed (${reason}); replacing the builder once it stays quiet`);
    this.#reason = reason;
    // A field, not the closure: `rearm` re-arms with the reason alone and must keep the sample.
    if (over) this.#over = over;
    if (this.#timer) clearTimeout(this.#timer);
    this.#timer = setTimeout(() => {
      this.#timer = null;
      const pendingReason = this.#reason;
      const pendingOver = this.#over;
      this.#reason = null;
      this.#over = null;
      if (!pendingReason) return;
      if (!pendingOver) {
        this.#recycle(pendingReason);
        return;
      }
      void this.#recycleWhenStillOver(pendingReason, pendingOver);
    }, BUILDER_RSS_RECYCLE_QUIET_MS);
  }

  async #recycleWhenStillOver(
    reason: string,
    { rssBytes, ceilingBytes }: { rssBytes: number; ceilingBytes: number },
  ): Promise<void> {
    if (decideBuilderRssSettle({ rssBytes, ceilingBytes }) === "recycle-now") {
      this.#recycle(reason);
      return;
    }
    const pid = this.#links.builder()?.pid;
    if (!pid) {
      this.#recycle(reason);
      return;
    }
    this.#settleToken += 1;
    const token = this.#settleToken;
    this.#logger.verbose(
      `[builder-recycle] holding ${Math.round(BUILDER_RSS_SETTLE_MS / 1000)}s to see whether the allocator returns it (${reason})`,
    );
    await Bun.sleep(BUILDER_RSS_SETTLE_MS);
    if (token !== this.#settleToken || this.#links.builder()?.pid !== pid || this.#links.away()) {
      this.#logger.verbose("[builder-recycle] settle check abandoned; the builder moved on");
      return;
    }
    const settledBytes = await ProcessRss.bytesOf(pid);
    if (settledBytes !== null && settledBytes < ceilingBytes) {
      this.#logger.info(
        `[builder-recycle] skipped: the builder fell to ${asMib(settledBytes)}MiB (ceiling ${asMib(ceilingBytes)}MiB) on its own, so a recycle would have cost a boot build for nothing`,
      );
      return;
    }
    this.#recycle(settledBytes === null ? reason : `${reason}; still ${asMib(settledBytes)}MiB after settling`);
  }

  #recycle(reason: string): void {
    // Dropping the recycle costs nothing: the next build re-reports an over-ceiling rss and re-arms it.
    if (this.#links.restartQueued()) {
      this.#logger.verbose(`[builder-recycle] skipped (${reason}); a dev restart is already pending`);
      return;
    }
    if (!this.#links.builder()?.recycle(reason)) return;
    this.#lastRecycleAtMono = performance.now();
    // Stamped at the request, not the exit: a draining builder has already stopped taking work.
    this.#links.onRecycle();
  }
}
