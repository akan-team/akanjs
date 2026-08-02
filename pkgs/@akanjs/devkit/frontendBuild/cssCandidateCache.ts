import { stat } from "node:fs/promises";

/** Every identifier-ish token in a source file is a potential tailwind class. */
const CANDIDATE_RE = /-?[\w@][\w:/.-]*(?:\[[^\]]+\][\w:/.-]*)*/g;

interface CachedFile {
  mtimeMs: number;
  size: number;
  candidates: string[];
}

interface CacheFile {
  version: number;
  files: Record<string, CachedFile>;
}

/**
 * Tailwind candidate tokens per source file, cached on disk across builds.
 *
 * The scan reads the **full text** of every source file on every CSS rebuild — measured at 385-508ms
 * per save on `apps/akan`. Phase 2 moved css compilation into a per-generation batch worker, so an
 * in-memory cache (what `03-phase3-topology-and-trim.md` §3.4 originally proposed) buys nothing: the
 * process that would hold it exits before the next save. Disk is what survives the worker, a builder
 * recycle and a dev-host restart alike, which is the same reasoning §3.3 used for the font cache.
 *
 * Keyed on (mtime, size) per file, so a save re-reads only the files in that batch.
 */
export class CssCandidateCache {
  /** Bump when the token regex or the entry shape changes, so stale extractions are not reused. */
  static readonly #version = 1;
  readonly #path: string;
  readonly #entries = new Map<string, CachedFile>();
  #dirty = false;
  #reused = 0;
  #rescanned = 0;

  constructor(cachePath: string) {
    this.#path = cachePath;
  }

  get reused(): number {
    return this.#reused;
  }

  get rescanned(): number {
    return this.#rescanned;
  }

  /** A cache that cannot be read or is a version behind simply starts empty — it is only an optimisation. */
  async load(): Promise<this> {
    const raw = (await Bun.file(this.#path)
      .json()
      .catch(() => null)) as CacheFile | null;
    if (!raw || raw.version !== CssCandidateCache.#version || typeof raw.files !== "object") return this;
    for (const [file, entry] of Object.entries(raw.files)) {
      if (typeof entry?.mtimeMs !== "number" || !Array.isArray(entry.candidates)) continue;
      this.#entries.set(file, entry);
    }
    return this;
  }

  /**
   * The file's candidate tokens, read from disk only when its (mtime, size) no longer matches.
   *
   * Read errors propagate, as they did before this cache existed: a source file the compiler cannot
   * read is a broken build, not a cache miss to paper over.
   */
  async candidatesFor(file: string): Promise<string[]> {
    const stats = await stat(file).catch(() => null);
    const cached = this.#entries.get(file);
    if (stats && cached && cached.mtimeMs === stats.mtimeMs && cached.size === stats.size) {
      this.#reused += 1;
      return cached.candidates;
    }
    const content = await Bun.file(file).text();
    const candidates = [...new Set(Array.from(content.matchAll(CANDIDATE_RE), (m) => m[0]))];
    this.#rescanned += 1;
    if (stats) {
      this.#entries.set(file, { mtimeMs: stats.mtimeMs, size: stats.size, candidates });
      this.#dirty = true;
    }
    return candidates;
  }

  /**
   * Persist, dropping files the scan no longer reaches so a renamed or deleted module does not keep
   * feeding its classes to the compiler forever.
   *
   * A rebuild that re-read nothing writes nothing: the boot double-build and any CSS rebuild triggered
   * by something other than a source edit would otherwise rewrite the whole file for no change.
   */
  async save(present: Set<string>): Promise<void> {
    for (const file of [...this.#entries.keys()]) {
      if (present.has(file)) continue;
      this.#entries.delete(file);
      this.#dirty = true;
    }
    if (!this.#dirty) return;
    this.#dirty = false;
    const files: Record<string, CachedFile> = {};
    for (const [file, entry] of this.#entries) files[file] = entry;
    // A cache that cannot be written is a slow build, not a failed one — a read-only checkout must
    // still compile.
    await Bun.write(
      this.#path,
      JSON.stringify({ version: CssCandidateCache.#version, files } satisfies CacheFile),
    ).catch(() => undefined);
  }
}
