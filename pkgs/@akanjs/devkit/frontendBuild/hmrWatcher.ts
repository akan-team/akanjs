import fs from "node:fs";
import path from "node:path";
import type { Logger } from "akanjs/common";
import type { ChangeBatch, ChangeKind } from "akanjs/server";
import { HmrChangeClassifier } from "./hmrChangeClassifier";
import { SourceMtimeIndex } from "./sourceMtimeIndex";

export type { ChangeBatch, ChangeKind };

export interface WatcherOptions {
  roots: string[];
  debounceMs?: number;
  logger: Logger;
  onBatch: (batch: ChangeBatch) => void | Promise<void>;
  /**
   * Delay before re-checking mtimes for changes `fs.watch` never reported. Must clear Bun's ~200ms
   * coalescing window, or a write late in the same window as a delivered event stays invisible.
   */
  verifyDelayMs?: number;
}

/**
 * Recursive filesystem watcher with debounced batching. We deliberately keep
 * classification coarse (`code` / `css` / `config`) so the orchestrator can
 * decide whether a full rebuild-and-reload or a narrower action (e.g. CSS
 * hot-swap) is sufficient.
 *
 * Bun's event payloads are treated as a hint, not the answer: its recursive `fs.watch` reports about one
 * path per coalescing window and silently discards the rest, so what changed is resolved against a
 * `SourceMtimeIndex` instead (see that class for the measurements). Events still drive *when* to look,
 * which is what keeps this cheap — Bun does reliably deliver at least one event per window.
 */
export class HmrWatcher {
  readonly #roots: string[];
  readonly #debounceMs: number;
  readonly #verifyDelayMs: number;
  readonly #onBatch: WatcherOptions["onBatch"];
  readonly #logger: Logger;
  readonly #watchers: fs.FSWatcher[] = [];
  readonly #pending = new Map<string, Exclude<ChangeKind, "ignore">>();
  /** Paths the watcher's own events named since the last batch — diagnostics only, see `#queue`. */
  readonly #hinted = new Set<string>();
  readonly #classifier = new HmrChangeClassifier();
  readonly #index: SourceMtimeIndex;
  #timer: ReturnType<typeof setTimeout> | null = null;
  #verifyTimer: ReturnType<typeof setTimeout> | null = null;
  #stopped = false;
  #flushing = false;
  #unreportedChanges = 0;
  #reportedCompensating = false;
  #reportedGaps = "";

  constructor(opts: WatcherOptions) {
    this.#roots = [...new Set(opts.roots.map((r) => path.resolve(r)))];
    this.#debounceMs = opts.debounceMs ?? 80;
    this.#verifyDelayMs = opts.verifyDelayMs ?? 250;
    this.#onBatch = opts.onBatch;
    this.#logger = opts.logger;
    this.#index = new SourceMtimeIndex({ roots: this.#roots, classifier: this.#classifier });
  }

  /**
   * How many changes the mtime scan found that `fs.watch` never reported. Non-zero means this watcher is
   * compensating for the Bun defect rather than the defect being absent, which is the number to watch if
   * it is ever fixed upstream.
   */
  get unreportedChanges(): number {
    return this.#unreportedChanges;
  }

  /**
   * Watchers are installed before the baseline is taken, so an edit made during priming is reported by
   * the event side even though the baseline already reflects it.
   */
  async start(): Promise<void> {
    for (const root of this.#roots) {
      try {
        const w = fs.watch(root, { recursive: true, persistent: false }, (_event, filename) => {
          if (!filename) return;
          const abs = path.resolve(root, filename.toString());
          this.#queue(abs);
        });
        this.#watchers.push(w);
        this.#logger.verbose(`[hmr] watching ${root}`);
      } catch (err) {
        this.#logger.error(`[hmr] failed to watch ${root}: ${(err as Error).message}`);
      }
    }
    try {
      await this.#index.prime();
      // Before the first batch, because a root that is unreadable at boot blinds the whole session and
      // waiting for a save to surface it means waiting for a save that never rebuilds.
      this.#reportCoverageGaps();
      this.#logger.verbose(`[hmr] tracking ${this.#index.trackedFileCount} source files for change verification`);
    } catch (err) {
      this.#logger.error(
        `[hmr] mtime index unavailable; falling back to watcher events alone, which drop concurrent saves: ${(err as Error).message}`,
      );
    }
  }

  stop(): void {
    this.#stopped = true;
    if (this.#timer) clearTimeout(this.#timer);
    if (this.#verifyTimer) clearTimeout(this.#verifyTimer);
    for (const w of this.#watchers) {
      try {
        w.close();
      } catch {
        // ignore
      }
    }
  }

  /**
   * Adopt writes the batch handler made itself (regenerated barrels, inserted imports) so the
   * verification scan does not spend a second generation rebuilding content this one already consumed.
   */
  async absorb(paths: string[]): Promise<void> {
    if (paths.length === 0) return;
    await this.#index.absorb(paths);
  }

  /**
   * An event says only *that* something happened, never reliably *what*. So with a baseline in hand it is
   * used purely to decide when to look, and the mtime scan names the files.
   *
   * Taking the payload as well would double-report: Bun does deliver a real event for some of the paths a
   * scan has already emitted, and adding it back here produced a second batch for the same save — one more
   * generation and one more build for no change.
   */
  #queue(abs: string): void {
    const kind = this.#classifier.classify(abs);
    if (!this.#index.primed) {
      // Still priming, or priming failed: the payload is the only signal there is.
      if (kind === "ignore") return;
      this.#pending.set(abs, kind);
      this.#scheduleFlush();
      return;
    }
    // An ignored path still means a window happened. That is the shape of the original bug — every build
    // ends in a burst under `.akan/`, and the burst is what Bun reports instead of the save beside it.
    // Rescheduling on each one folds a build's whole burst into a single scan once it goes quiet.
    if (kind === "ignore") {
      this.#scheduleVerify();
      return;
    }
    // Recorded only so `unreportedChanges` can tell which changes the events did name; it never decides
    // what is in a batch.
    this.#hinted.add(abs);
    this.#scheduleFlush();
  }

  #scheduleFlush(): void {
    if (this.#flushing) return;
    if (this.#timer) clearTimeout(this.#timer);
    this.#timer = setTimeout(() => this.#flush(), this.#debounceMs);
  }

  #flush(): void {
    this.#timer = null;
    if (this.#stopped || this.#flushing) return;
    void this.#drain();
  }

  async #drain(): Promise<void> {
    this.#flushing = true;
    try {
      while (!this.#stopped) {
        await this.#mergeDetectedChanges();
        if (this.#pending.size === 0) break;
        const files = Array.from(this.#pending.keys());
        const kinds = new Set(this.#pending.values());
        this.#pending.clear();
        this.#hinted.clear();
        try {
          await this.#onBatch({ files, kinds });
        } catch (e) {
          this.#logger.error(`[hmr] onBatch error: ${(e as Error).message}`);
        }
      }
    } finally {
      this.#flushing = false;
      if (!this.#stopped && this.#pending.size > 0) this.#timer = setTimeout(() => this.#flush(), this.#debounceMs);
      else this.#scheduleVerify();
    }
  }

  /**
   * Fold in everything the mtime index has seen change, since a delivered event names at most one of the
   * paths that moved in its window.
   */
  async #mergeDetectedChanges(): Promise<void> {
    const detected = await this.#index.collectChanges().catch((err) => {
      this.#logger.error(`[hmr] mtime scan failed: ${(err as Error).message}`);
      return [] as string[];
    });
    this.#reportCoverageGaps();
    let unreported = 0;
    for (const abs of detected) {
      const kind = this.#classifier.classify(abs);
      if (kind === "ignore") continue;
      if (!this.#hinted.has(abs)) unreported += 1;
      this.#pending.set(abs, kind);
    }
    if (unreported === 0) return;
    this.#unreportedChanges += unreported;
    // Once at info, so it is visible that the watcher is compensating rather than the defect being absent;
    // per-batch detail stays at verbose because a save-all trips this on every save.
    if (!this.#reportedCompensating) {
      this.#reportedCompensating = true;
      this.#logger.info(
        `[hmr] recovered ${unreported} change(s) that fs.watch did not report; Bun coalesces concurrent saves and drops all but one, so changes are resolved by mtime`,
      );
    }
    this.#logger.verbose(
      `[hmr] mtime scan found ${unreported} change(s) fs.watch never reported (${this.#unreportedChanges} total)`,
    );
  }

  /**
   * Say so when part of the tree cannot be read, and say so again when it recovers.
   *
   * A blind spot here means edits under that path are not rebuilt at all, which is indistinguishable from
   * the dev server being broken. Keyed on the gap list itself so a persistent failure logs once rather than
   * once per save, while a *different* gap appearing still gets its own line.
   */
  #reportCoverageGaps(): void {
    const gaps = this.#index.coverageGaps;
    const key = gaps
      .map((gap) => `${gap.code}:${gap.path}`)
      .sort()
      .join("|");
    if (key === this.#reportedGaps) return;
    this.#reportedGaps = key;
    if (gaps.length === 0) {
      this.#logger.info("[hmr] all watch roots readable again; change detection is complete");
      return;
    }
    const shown = gaps
      .slice(0, 3)
      .map((gap) => `${gap.path} (${gap.code})`)
      .join(", ");
    const rest = gaps.length > 3 ? ` and ${gaps.length - 3} more` : "";
    this.#logger.warn(
      `[hmr] cannot read ${gaps.length} path(s), so edits underneath them will not rebuild: ${shown}${rest}`,
    );
  }

  /**
   * One scan after the coalescing window closes. A write that lands in the same window as an already
   * delivered event produces no further event of its own, so nothing else would ever look for it.
   */
  #scheduleVerify(): void {
    if (this.#stopped || this.#verifyDelayMs <= 0) return;
    if (this.#verifyTimer) clearTimeout(this.#verifyTimer);
    this.#verifyTimer = setTimeout(() => {
      this.#verifyTimer = null;
      void this.#verify();
    }, this.#verifyDelayMs);
  }

  /**
   * Terminates rather than looping: a scan that finds nothing schedules nothing, and the build writes its
   * artifacts under `.akan/` — which the classifier ignores — while codegen writes are content-guarded,
   * so a rebuild does not move a tracked mtime.
   *
   * The one case that does schedule another is a directory the index could not date reliably (Linux stamps
   * directory mtimes on a 1ms clock, see `SourceMtimeIndex`). That still terminates: the next scan is
   * `verifyDelayMs` later, by which point the timestamp has settled unless something is writing to that
   * directory right now — in which case looking again is the right answer anyway.
   */
  async #verify(): Promise<void> {
    if (this.#stopped || this.#flushing) return;
    await this.#mergeDetectedChanges();
    if (this.#pending.size > 0) await this.#drain();
    else if (this.#index.hasUnsettledDirs) this.#scheduleVerify();
  }
}
