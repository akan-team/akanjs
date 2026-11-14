import { stat } from "node:fs/promises";
import { FileSys } from "../util/fileSys";
import { type BuildCacheStamp, buildCacheStamp, isBuildCacheStamp } from "./buildCacheStamp";

// The leading `[` alternation keeps arbitrary variants (`[&_td]:px-3`) whole, and a bracket may hold one nested
// bracket (`[&_[data-slot=x]]:p-2`, `has-[[aria-expanded=true]]:x`), or the candidate is cut at the inner `]` and the
// rule silently never compiles. Brackets hold no whitespace: a labelled tuple type scanned as a class compiles to a
// rule lightningcss cannot parse, and it then drops every variant rule. Parentheses pass only as Tailwind v4's
// variable shorthand, `(--x)` or `(length:--x)`, so `cn("flex")` still yields `flex` on its own.
const CANDIDATE_RE =
  /-?(?:[\w@]|\[(?:[^[\]\s]|\[[^[\]\s]+\])+\])[\w:/.-]*(?:(?:\[(?:[^[\]\s]|\[[^[\]\s]+\])+\]|\((?:[a-z-]+:)?--[^)\s]+\))[\w:/.-]*)*/g;

interface CachedFile {
  mtimeMs: number;
  size: number;
  candidates: string[];
}

interface CacheFile extends BuildCacheStamp {
  version: number;
  files: Record<string, CachedFile>;
}

/** Tailwind candidates per source file, on disk: the batch worker that compiles CSS exits before the next save. */
export class CssCandidateCache {
  // Bump when the token regex or the entry shape changes, so stale extractions are not reused.
  static readonly #version = 6;
  readonly #path: string;
  readonly #stamp: BuildCacheStamp;
  readonly #entries = new Map<string, CachedFile>();
  #dirty = false;
  #reused = 0;
  #rescanned = 0;

  constructor(cachePath: string, stamp = buildCacheStamp()) {
    this.#path = cachePath;
    this.#stamp = stamp;
  }

  get reused(): number {
    return this.#reused;
  }

  get rescanned(): number {
    return this.#rescanned;
  }

  async load(): Promise<this> {
    const raw = (await Bun.file(this.#path)
      .json()
      .catch(() => null)) as Partial<CacheFile> | null;
    if (raw?.version !== CssCandidateCache.#version || !isBuildCacheStamp(raw, this.#stamp) || !raw.files) return this;
    for (const [file, entry] of Object.entries(raw.files)) {
      if (typeof entry?.mtimeMs !== "number" || !Array.isArray(entry.candidates)) continue;
      this.#entries.set(file, entry);
    }
    return this;
  }

  // A read error propagates: an unreadable source is a broken build, not a cache miss.
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
    // An unwritable cache is a slow build, not a failed one: a read-only checkout must still compile.
    await FileSys.writeTextAtomic(
      this.#path,
      JSON.stringify({ version: CssCandidateCache.#version, ...this.#stamp, files } satisfies CacheFile),
    ).catch(() => undefined);
  }
}
