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
  /** Delay (ms, default 250) before the mtime re-check; must outlast Bun's ~200ms fs.watch coalescing window. */
  verifyDelayMs?: number;
}

// Bun delivers at least one fs.watch event per coalescing window but drops the other paths, so events decide
// when to look and the SourceMtimeIndex decides what changed.
export class HmrWatcher {
  readonly #roots: string[];
  readonly #debounceMs: number;
  readonly #verifyDelayMs: number;
  readonly #onBatch: WatcherOptions["onBatch"];
  readonly #logger: Logger;
  readonly #watchers: fs.FSWatcher[] = [];
  readonly #pending = new Map<string, Exclude<ChangeKind, "ignore">>();
  readonly #hinted = new Set<string>();
  readonly #classifier = new HmrChangeClassifier();
  readonly #index: SourceMtimeIndex;
  #timer: ReturnType<typeof setTimeout> | null = null;
  #verifyTimer: ReturnType<typeof setTimeout> | null = null;
  #windowStartedAt: number | null = null;
  #stopped = false;
  #flushing = false;
  #unreportedChanges = 0;
  #reportedCompensating = false;
  #reportedGaps = "";

  constructor(opts: WatcherOptions) {
    this.#roots = [...new Set(opts.roots.map((r) => path.resolve(r)))];
    this.#debounceMs = opts.debounceMs ?? HmrWatcher.#envDebounceMs() ?? 30;
    this.#verifyDelayMs = opts.verifyDelayMs ?? 250;
    this.#onBatch = opts.onBatch;
    this.#logger = opts.logger;
    this.#index = new SourceMtimeIndex({ roots: this.#roots, classifier: this.#classifier });
  }

  /** Changes the mtime scan found that fs.watch never reported; non-zero means it is compensating for Bun. */
  get unreportedChanges(): number {
    return this.#unreportedChanges;
  }

  /** Installs the watchers before priming, so an edit made while priming is still reported by the event side. */
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
      // At boot: edits under an unreadable root never rebuild, so no later save would surface it.
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

  /** Baseline the batch handler's own writes so the verification scan does not rebuild them a second time. */
  async absorb(paths: string[]): Promise<void> {
    if (paths.length === 0) return;
    await this.#index.absorb(paths);
  }

  // Once primed, a payload only schedules a scan: Bun also delivers events for paths the scan already emitted,
  // so adding payloads to the batch double-reports a save.
  #queue(abs: string): void {
    const kind = this.#classifier.classify(abs);
    if (!this.#index.primed) {
      // Still priming, or priming failed: the payload is the only signal there is.
      if (kind === "ignore") return;
      this.#pending.set(abs, kind);
      this.#scheduleFlush();
      return;
    }
    // An ignored path (a build's .akan/ burst) still marks a coalescing window that may hide a real save.
    if (kind === "ignore") {
      this.#scheduleVerify();
      return;
    }
    // Diagnostics only, for `unreportedChanges`; it never decides what is in a batch.
    this.#hinted.add(abs);
    this.#scheduleFlush();
  }

  #scheduleFlush(): void {
    this.#windowStartedAt ??= Date.now();
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
        if (this.#pending.size === 0) {
          this.#windowStartedAt = null;
          break;
        }
        const files = Array.from(this.#pending.keys());
        const kinds = new Set(this.#pending.values());
        const flushAt = Date.now();
        const trace = { eventAt: this.#windowStartedAt ?? flushAt, flushAt };
        this.#windowStartedAt = null;
        this.#pending.clear();
        this.#hinted.clear();
        try {
          await this.#onBatch({ files, kinds, trace });
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
    if (!this.#reportedCompensating) {
      this.#reportedCompensating = true;
      this.#logger.verbose(
        `[hmr] recovered ${unreported} change(s) that fs.watch did not report; Bun coalesces concurrent saves and drops all but one, so changes are resolved by mtime`,
      );
    }
    this.#logger.verbose(
      `[hmr] mtime scan found ${unreported} change(s) fs.watch never reported (${this.#unreportedChanges} total)`,
    );
  }

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

  static #envDebounceMs(): number | null {
    const raw = process.env.AKAN_DEV_WATCH_DEBOUNCE_MS;
    const ms = raw ? Number(raw) : Number.NaN;
    return Number.isInteger(ms) && ms >= 0 ? ms : null;
  }

  // A write in the same window as a delivered event raises no event of its own, so one scan follows each window.
  #scheduleVerify(): void {
    if (this.#stopped || this.#verifyDelayMs <= 0) return;
    if (this.#verifyTimer) clearTimeout(this.#verifyTimer);
    this.#verifyTimer = setTimeout(() => {
      this.#verifyTimer = null;
      void this.#verify();
    }, this.#verifyDelayMs);
  }

  // Terminates: build output lands in ignored .akan/ and codegen writes are content-guarded, so a rebuild moves no
  // tracked mtime; only an unsettled directory schedules another scan.
  async #verify(): Promise<void> {
    if (this.#stopped || this.#flushing) return;
    await this.#mergeDetectedChanges();
    if (this.#pending.size > 0) await this.#drain();
    else if (this.#index.hasUnsettledDirs) this.#scheduleVerify();
  }
}
