import type { Dirent, Stats } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import { HmrChangeClassifier } from "./hmrChangeClassifier";

interface TrackedFile {
  mtimeMs: number;
  size: number;
}

/**
 * A directory the index could not read, held with this mtime so every subsequent scan sees a mismatch
 * and retries it. `NaN !== NaN`, which is exactly the "always stale" semantics wanted here.
 */
const UNREADABLE = Number.NaN;

export interface SourceMtimeIndexOptions {
  roots: string[];
  classifier?: HmrChangeClassifier;
  /**
   * How close to "now" a directory's mtime may be before this scan's reading of it is treated as
   * possibly stale. Raise it for a filesystem whose timestamps are coarser than the 1ms Linux stamps
   * directories with — some network mounts stamp whole seconds.
   */
  dirSettleMs?: number;
}

/**
 * A snapshot of every interesting source file's mtime under the watch roots, so the watcher can answer
 * "what actually changed" without trusting `fs.watch` event payloads.
 *
 * Bun 1.3.14's recursive `fs.watch` on macOS reports roughly **one path per ~200ms coalescing window**
 * and discards every other path changed in that window. Measured on this repo: saving 5 files together
 * reports 1; saving 20 reports 2; a single unrelated write landing first in the window hides a
 * concurrent save entirely. Node 22 reports all 20 on the same tree, so this is a Bun defect rather
 * than an FSEvents limitation (`local/optimize-resource/06-watcher-dropped-event.md`).
 *
 * Re-stating the tracked set costs ~15ms against ~1300 source files here, where a fresh walk costs
 * ~70ms — the walk has to visit ~40k entries (`ios/`, `android/`, `public/`) to find those 1300. So
 * changes are found by re-stating known files plus re-reading only the directories whose own mtime
 * moved, which is what adding or removing an entry bumps — with one exception for the window in which
 * that mtime cannot be trusted, see `#defaultDirSettleMs`.
 */
export class SourceMtimeIndex {
  /**
   * How close to "now" a directory's mtime may be before this scan's reading of it is treated as
   * possibly stale, and the directory re-read next time regardless of what its mtime says.
   *
   * Linux stamps directory times from a coarse clock. Measured on Bun 1.3.14 under Docker, 400
   * back-to-back `mkdir`s left the parent's mtime unmoved **319 times on overlayfs and 324 times on
   * ext4**, smallest observable step 1ms; macOS APFS (0.042ms) and a virtiofs bind mount (0.29ms) missed
   * none. So a directory mutated in the same millisecond as the value this index recorded — but after the
   * walk that recorded it — leaves no trace at all, and because its files were never tracked, later edits
   * to them go unreported too. That is permanent for the life of the process, which is what makes it worth
   * a second look rather than a note.
   *
   * 20ms covers a 1ms tick with room for a `HZ=100` kernel's 10ms, and costs one extra `readdir` per
   * directory touched in the last 20ms — during a save, a handful.
   */
  static readonly #defaultDirSettleMs = 20;
  readonly #dirSettleMs: number;
  readonly #roots: string[];
  readonly #classifier: HmrChangeClassifier;
  readonly #files = new Map<string, TrackedFile>();
  readonly #dirs = new Map<string, number>();
  readonly #unreadable = new Map<string, string>();
  /** Directories whose recorded mtime was too fresh to trust, re-read on the next scan. */
  readonly #unsettled = new Set<string>();
  #primed = false;
  #queue: Promise<unknown> = Promise.resolve();

  constructor({ roots, classifier, dirSettleMs }: SourceMtimeIndexOptions) {
    this.#roots = SourceMtimeIndex.#pruneNestedRoots(roots);
    this.#classifier = classifier ?? new HmrChangeClassifier();
    this.#dirSettleMs = dirSettleMs ?? SourceMtimeIndex.#defaultDirSettleMs;
  }

  get primed(): boolean {
    return this.#primed;
  }

  get trackedFileCount(): number {
    return this.#files.size;
  }

  /**
   * Paths the index currently cannot read, as `{ path, code }`. Non-empty means change detection has a
   * blind spot right now: anything edited underneath one of these is not reported until it recovers.
   *
   * Worth surfacing rather than swallowing, because the failure is silent by nature — a walk cannot tell
   * how much it did not see. Each entry is retried on every scan and clears itself on success.
   */
  get coverageGaps(): { path: string; code: string }[] {
    return [...this.#unreadable].map(([file, code]) => ({ path: file, code }));
  }

  /**
   * Whether the last scan left a directory whose mtime was too fresh to trust. The caller should scan
   * again once the timestamp has settled, since nothing else will look at that directory until something
   * moves its mtime — and on a coarse clock the change that should have moved it already happened.
   */
  get hasUnsettledDirs(): boolean {
    return this.#unsettled.size > 0;
  }

  /** Record the current state as the baseline. Reports nothing; call before the first `collectChanges`. */
  async prime(): Promise<void> {
    await this.#serialize(async () => {
      this.#files.clear();
      this.#dirs.clear();
      this.#unreadable.clear();
      this.#unsettled.clear();
      await Promise.all(this.#roots.map((root) => this.#walk(root, null)));
      this.#primed = true;
    });
  }

  /**
   * Absolute paths whose content changed (or which disappeared) since the last call, with the baseline
   * advanced to match. Returns an empty list until primed, so a failed prime degrades to watcher events
   * rather than reporting the entire tree as changed.
   */
  async collectChanges(): Promise<string[]> {
    return this.#serialize(async () => {
      if (!this.#primed) return [];
      const changed = new Set<string>();
      await this.#collectFileChanges(changed);
      await this.#collectDirChanges(changed);
      return [...changed];
    });
  }

  /**
   * Every scan runs to completion before the next begins.
   *
   * Overlapping scans corrupt each other rather than merely racing: one advances the baseline and prunes
   * entries while the other is midway through a key snapshot it took earlier, so a path the first has
   * already accounted for reads back as missing and is reported as a change that never happened. Observed
   * directly — a file nothing had written was reported, which downstream is a wasted rebuild.
   */
  async #serialize<T>(work: () => Promise<T>): Promise<T> {
    const run = this.#queue.then(work, work);
    // Swallowed on the chain only; the caller still sees the rejection through `run`.
    this.#queue = run.catch(() => undefined);
    return run;
  }

  /**
   * Adopt writes the caller made itself — regenerated barrels, inserted imports — into the baseline so
   * the next `collectChanges` does not report them as a user edit.
   *
   * Narrow race worth knowing: a user save of the same path landing between the caller's write and this
   * call is baselined too, and therefore lost. It is sub-millisecond and no wider than the window the
   * event-based watcher already had.
   */
  async absorb(paths: string[]): Promise<void> {
    await this.#serialize(async () => {
      if (!this.#primed) return;
      await Promise.all(
        paths.map(async (file) => {
          const abs = path.resolve(file);
          const stats = await stat(abs).catch(() => null);
          if (!stats?.isFile()) {
            this.#files.delete(abs);
            return;
          }
          this.#files.set(abs, { mtimeMs: stats.mtimeMs, size: stats.size });
        }),
      );
    });
  }

  async #collectFileChanges(changed: Set<string>): Promise<void> {
    await Promise.all(
      [...this.#files.keys()].map(async (abs) => {
        const { stats, err } = await SourceMtimeIndex.#statPath(abs);
        if (!stats) {
          // Unreadable is not deleted. Dropping it here would both invent a change nobody made and stop
          // tracking the file, so a later real edit would go unreported.
          if (err && !SourceMtimeIndex.#isMissing(err)) {
            this.#unreadable.set(abs, err.code ?? "EUNKNOWN");
            return;
          }
          this.#files.delete(abs);
          this.#unreadable.delete(abs);
          changed.add(abs);
          return;
        }
        this.#unreadable.delete(abs);
        if (!stats.isFile()) {
          this.#files.delete(abs);
          changed.add(abs);
          return;
        }
        const known = this.#files.get(abs);
        if (known && known.mtimeMs === stats.mtimeMs && known.size === stats.size) return;
        this.#files.set(abs, { mtimeMs: stats.mtimeMs, size: stats.size });
        changed.add(abs);
      }),
    );
  }

  /**
   * A directory's own mtime moves when an entry is added or removed but not when a tracked file's
   * content changes, so this finds creations and deletions the file pass cannot see.
   */
  async #collectDirChanges(changed: Set<string>): Promise<void> {
    const moved = new Set<string>();
    const gone: string[] = [];
    await Promise.all(
      [...this.#dirs.entries()].map(async ([dir, mtimeMs]) => {
        const { stats, err } = await SourceMtimeIndex.#statPath(dir);
        if (!stats?.isDirectory()) {
          if (err && !SourceMtimeIndex.#isMissing(err)) {
            this.#markUnreadable(dir, err);
            return;
          }
          gone.push(dir);
          return;
        }
        // `UNREADABLE` is NaN, so a directory retained from a failed read always mismatches and is
        // rewalked here — that retry is what lets a transient failure recover on its own.
        if (stats.mtimeMs !== mtimeMs) moved.add(dir);
      }),
    );
    // An unsettled directory is re-read whether or not its mtime moved: on a coarse clock a mutation
    // that landed in the same tick as the recorded value leaves it identical, so the mtime is exactly
    // the signal that cannot be trusted here.
    for (const dir of this.#unsettled) if (this.#dirs.has(dir)) moved.add(dir);
    for (const dir of gone) this.#forget(dir);
    // Sequential: a moved directory can reveal a new subtree, and walking those in order keeps the
    // number of concurrent `readdir` calls proportional to the change rather than to the tree.
    for (const dir of moved) await this.#walk(dir, changed);
  }

  /**
   * Re-read one directory, tracking entries that are new or changed. Recurses only into subdirectories
   * that are new to the index; known ones are covered by their own mtime check in `#collectDirChanges`.
   */
  async #walk(dir: string, changed: Set<string> | null): Promise<void> {
    const [listing, dirStat] = await Promise.all([SourceMtimeIndex.#readdirPath(dir), SourceMtimeIndex.#statPath(dir)]);
    const entries = listing.entries;
    const dirStats = dirStat.stats;
    if (!entries || !dirStats?.isDirectory()) {
      // A directory that cannot be read is not a directory that is gone. Forgetting it here is
      // unrecoverable: nothing re-stats a dir the index has dropped, and the parent's own mtime does not
      // move when a child merely becomes unreadable, so the whole subtree stays invisible for the life of
      // the process. Measured: one `EACCES` at prime silently hid 2 of 3 files, permanently.
      const err = listing.err ?? dirStat.err;
      if (err && !SourceMtimeIndex.#isMissing(err)) {
        this.#markUnreadable(dir, err);
        return;
      }
      this.#forget(dir);
      return;
    }
    const known = this.#dirs.has(dir);
    this.#dirs.set(dir, dirStats.mtimeMs);
    this.#unreadable.delete(dir);
    if (this.#isUnsettled(dirStats.mtimeMs)) this.#unsettled.add(dir);
    else this.#unsettled.delete(dir);
    const descend: string[] = [];
    const present = new Set<string>();
    let blind = false;
    for (const entry of entries) {
      if (SourceMtimeIndex.#skipDirent(entry.name)) continue;
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        descend.push(abs);
        continue;
      }
      if (!entry.isFile()) continue;
      if (this.#classifier.classify(abs) === "ignore") continue;
      present.add(abs);
      const { stats, err } = await SourceMtimeIndex.#statPath(abs);
      if (!stats?.isFile()) {
        // A file listed but not stat-able has no baseline, so an edit to it would compare against nothing.
        // Leaving the directory stale is what brings it back; the file pass cannot, since it only revisits
        // paths already tracked.
        if (err && !SourceMtimeIndex.#isMissing(err)) {
          this.#unreadable.set(abs, err.code ?? "EUNKNOWN");
          blind = true;
        }
        continue;
      }
      this.#unreadable.delete(abs);
      const previous = this.#files.get(abs);
      if (previous && previous.mtimeMs === stats.mtimeMs && previous.size === stats.size) continue;
      this.#files.set(abs, { mtimeMs: stats.mtimeMs, size: stats.size });
      changed?.add(abs);
    }
    // Entries this directory used to hold and no longer does. Only worth scanning for a directory the
    // index already knew, which during `prime` is none of them.
    if (known) {
      for (const abs of [...this.#files.keys()]) {
        if (present.has(abs) || path.dirname(abs) !== dir) continue;
        this.#files.delete(abs);
        changed?.add(abs);
      }
    }
    // `UNREADABLE` already forces a re-walk every scan, so the freshness retry would only duplicate it.
    if (blind) {
      this.#dirs.set(dir, UNREADABLE);
      this.#unsettled.delete(dir);
    }
    // Known subdirectories carry their own mtime check, so only unseen ones need walking. Concurrent
    // because `prime` reaches every directory through here.
    await Promise.all(descend.filter((sub) => !this.#dirs.has(sub)).map((sub) => this.#walk(sub, changed)));
  }

  /**
   * Keep a directory the index could not read, flagged for retry on every scan, and keep whatever it
   * already knows underneath it — those files stay tracked so a real edit is still caught the moment
   * access returns.
   */
  #markUnreadable(dir: string, err: NodeJS.ErrnoException): void {
    this.#dirs.set(dir, UNREADABLE);
    this.#unreadable.set(dir, err.code ?? "EUNKNOWN");
    this.#unsettled.delete(dir);
  }

  /** Drop a directory and everything the index holds beneath it. */
  #forget(dir: string): void {
    const prefix = `${dir}${path.sep}`;
    this.#dirs.delete(dir);
    this.#unreadable.delete(dir);
    this.#unsettled.delete(dir);
    for (const known of [...this.#dirs.keys()]) if (known.startsWith(prefix)) this.#dirs.delete(known);
    // Otherwise a gap under a deleted directory is reported forever, since nothing revisits it to clear.
    for (const known of [...this.#unreadable.keys()]) if (known.startsWith(prefix)) this.#unreadable.delete(known);
    // Left behind, this would re-walk a path that no longer exists on every scan.
    for (const known of [...this.#unsettled]) if (known.startsWith(prefix)) this.#unsettled.delete(known);
  }

  /**
   * Whether a directory's mtime is recent enough that another mutation could share its timestamp tick.
   *
   * Symmetric so a filesystem clock running *ahead* of this process — a network mount, a container with a
   * skewed host — does not read as permanently fresh and re-walk the whole tree on every scan.
   */
  #isUnsettled(mtimeMs: number): boolean {
    return Math.abs(Date.now() - mtimeMs) < this.#dirSettleMs;
  }

  /** `null` stats with the errno kept, so callers can tell "not there" from "could not look". */
  static async #statPath(abs: string): Promise<{ stats: Stats | null; err: NodeJS.ErrnoException | null }> {
    try {
      return { stats: await stat(abs), err: null };
    } catch (err) {
      return { stats: null, err: err as NodeJS.ErrnoException };
    }
  }

  static async #readdirPath(dir: string): Promise<{ entries: Dirent[] | null; err: NodeJS.ErrnoException | null }> {
    try {
      return { entries: await readdir(dir, { withFileTypes: true }), err: null };
    } catch (err) {
      return { entries: null, err: err as NodeJS.ErrnoException };
    }
  }

  /**
   * Whether an errno means the path genuinely is not there, which is the only case where dropping it from
   * the baseline is right. Everything else — `EACCES`, `EIO`, `EMFILE`, a stalled network mount — means the
   * index failed to look, and treating that as a deletion both invents a change and blinds it to real ones.
   */
  static #isMissing(err: NodeJS.ErrnoException): boolean {
    return err.code === "ENOENT" || err.code === "ENOTDIR";
  }

  /**
   * Mirrors `HmrChangeClassifier`'s path rules for directory names — dotted names cover `.git` and
   * `.akan`, which is where every build artifact lands. Symlinked entries are neither `isFile` nor
   * `isDirectory` and so are skipped, matching `fs.watch`, which does not follow them either.
   */
  static #skipDirent(name: string): boolean {
    return !name || name.startsWith(".") || name === "node_modules";
  }

  /** `WatchRootResolver` can return `apps/<app>/page` alongside `apps/`; walking both doubles the work. */
  static #pruneNestedRoots(roots: string[]): string[] {
    const resolved = [...new Set(roots.map((root) => path.resolve(root)))].sort();
    return resolved.filter(
      (root) => !resolved.some((other) => other !== root && root.startsWith(`${other}${path.sep}`)),
    );
  }
}
