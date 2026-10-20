import { rm, rmdir, stat } from "node:fs/promises";
import path from "node:path";
import { isFontOptimizationEnabled } from "akanjs/client";
import type { App } from "../commandDecorators";
import { FontOptimizer } from "./fontOptimizer";

const FONT_GLOB = "**/*.{woff2,woff,ttf,otf,ttc,eot}";
const REFERRER_GLOB = "**/*.{css,js,mjs,cjs,json,html,htm,svg,xml,webmanifest}";

export type FontKeepReason =
  | { kind: "unoptimized" }
  | { kind: "declared"; glob: string }
  | { kind: "referenced"; referrer: string };

export interface FontPruneResult {
  removed: { file: string; bytes: number }[];
  kept: { file: string; bytes: number; reason: FontKeepReason }[];
  freedBytes: number;
}

/** Deletes the fonts in the build's `dist/…/public` that nothing reads; source `public/` trees are never touched. */
export class FontPruner {
  #app: App;
  #keepGlobs: string[];
  #publicRoot: string;
  #artifactRoot: string;

  constructor(app: App, { keepFonts = [] }: { keepFonts?: string[] } = {}) {
    this.#app = app;
    this.#keepGlobs = keepFonts;
    this.#publicRoot = path.join(app.dist.cwdPath, "public");
    this.#artifactRoot = path.join(app.dist.cwdPath, ".akan/artifact");
  }

  async prune(): Promise<FontPruneResult> {
    const empty: FontPruneResult = { removed: [], kept: [], freedBytes: 0 };
    if (!(await this.#isDirectory(this.#publicRoot))) return empty;
    const candidates = await this.#collectCandidates();
    if (!candidates.length) return empty;

    const fonts = await new FontOptimizer(this.#app, "build").discoverFonts();
    const unoptimizedSrcs = new Set<string>();
    const optimizedSrcs = new Set<string>();
    for (const font of fonts) {
      const target = isFontOptimizationEnabled(font) ? optimizedSrcs : unoptimizedSrcs;
      for (const fontPath of font.paths) target.add(path.posix.basename(fontPath.src));
    }

    const result: FontPruneResult = { removed: [], kept: [], freedBytes: 0 };
    const undecided: typeof candidates = [];
    for (const candidate of candidates) {
      const reason = this.#staticKeepReason(candidate, unoptimizedSrcs);
      if (reason) result.kept.push({ file: candidate.rel, bytes: candidate.bytes, reason });
      else undecided.push(candidate);
    }
    if (undecided.length) {
      const referrers = await this.#findReferrers(undecided, optimizedSrcs);
      for (const candidate of undecided) {
        const referrer = referrers.get(candidate.rel);
        if (referrer)
          result.kept.push({ file: candidate.rel, bytes: candidate.bytes, reason: { kind: "referenced", referrer } });
        else result.removed.push({ file: candidate.rel, bytes: candidate.bytes });
      }
    }

    await this.#remove(result.removed.map(({ file }) => file));
    result.freedBytes = result.removed.reduce((total, { bytes }) => total + bytes, 0);
    this.#report(result);
    return result;
  }

  #staticKeepReason(candidate: { rel: string; basename: string }, unoptimizedSrcs: Set<string>): FontKeepReason | null {
    if (unoptimizedSrcs.has(candidate.basename)) return { kind: "unoptimized" };
    for (const glob of this.#keepGlobs) {
      if (new Bun.Glob(glob).match(candidate.rel)) return { kind: "declared", glob };
    }
    return null;
  }

  async #collectCandidates() {
    const candidates: { rel: string; basename: string; bytes: number }[] = [];
    for await (const rel of new Bun.Glob(FONT_GLOB).scan({ cwd: this.#publicRoot, dot: false })) {
      const entry = await stat(path.join(this.#publicRoot, rel)).catch(() => null);
      if (!entry?.isFile()) continue;
      candidates.push({ rel: rel.split(path.sep).join("/"), basename: path.basename(rel), bytes: entry.size });
    }
    return candidates;
  }

  // Basename match (plain and percent-encoded) covers every url() spelling. The bundles inline each route's `fonts`
  // declaration, so a bundle hit counts only for a font the optimizer did not subset.
  async #findReferrers(
    candidates: { rel: string; basename: string }[],
    optimizedSrcs: Set<string>,
  ): Promise<Map<string, string>> {
    const referrers = new Map<string, string>();
    const authoritative = candidates;
    const bundled = candidates.filter((candidate) => !optimizedSrcs.has(candidate.basename));
    const roots: { dir: string; label: string; needles: typeof candidates }[] = [
      { dir: this.#publicRoot, label: "public", needles: authoritative },
      { dir: path.join(this.#artifactRoot, "styles"), label: ".akan/artifact/styles", needles: authoritative },
      { dir: path.join(this.#artifactRoot, "client"), label: ".akan/artifact/client", needles: bundled },
      { dir: path.join(this.#artifactRoot, "client-ssr"), label: ".akan/artifact/client-ssr", needles: bundled },
      { dir: path.join(this.#artifactRoot, "server"), label: ".akan/artifact/server", needles: bundled },
      { dir: path.join(this.#app.dist.cwdPath, "csr"), label: "csr", needles: bundled },
      { dir: path.join(this.#app.dist.cwdPath, "mcp-apps"), label: "mcp-apps", needles: bundled },
    ];
    for (const root of roots) {
      const pending = root.needles.filter((candidate) => !referrers.has(candidate.rel));
      if (!pending.length || !(await this.#isDirectory(root.dir))) continue;
      await this.#scanRoot(root, pending, referrers);
    }
    return referrers;
  }

  async #scanRoot(
    root: { dir: string; label: string },
    pending: { rel: string; basename: string }[],
    referrers: Map<string, string>,
  ) {
    const needles = pending.map((candidate) => ({
      rel: candidate.rel,
      forms: [...new Set([candidate.basename, encodeURIComponent(candidate.basename)])],
    }));
    for await (const rel of new Bun.Glob(REFERRER_GLOB).scan({ cwd: root.dir, dot: false })) {
      const remaining = needles.filter((needle) => !referrers.has(needle.rel));
      if (!remaining.length) return;
      const text = await Bun.file(path.join(root.dir, rel))
        .text()
        .catch(() => "");
      if (!text) continue;
      for (const needle of remaining) {
        if (needle.forms.some((form) => text.includes(form)))
          referrers.set(needle.rel, `${root.label}/${rel.split(path.sep).join("/")}`);
      }
    }
  }

  async #remove(files: string[]) {
    await Promise.all(files.map((file) => rm(path.join(this.#publicRoot, file), { force: true })));
    const dirs = [...new Set(files.map((file) => path.posix.dirname(file)))]
      .filter((dir) => dir !== "." && dir !== "/")
      .sort((a, b) => b.length - a.length);
    for (const dir of dirs) await rmdir(path.join(this.#publicRoot, dir)).catch(() => undefined);
  }

  // The roll-up is `info`: a precache manifest listing all of public/ keeps every font, which otherwise looks like
  // a build with nothing to prune.
  #report(result: FontPruneResult) {
    if (!result.removed.length && !result.kept.length) return;
    for (const { file, bytes } of result.removed)
      this.#app.verbose(`[font-prune] dropped public/${file} (${FontPruner.formatBytes(bytes)})`);
    for (const { file, reason } of result.kept)
      this.#app.verbose(`[font-prune] kept public/${file} — ${FontPruner.describe(reason)}`);
    const byReferrer = new Map<string, { files: number; bytes: number }>();
    for (const { bytes, reason } of result.kept) {
      if (reason.kind !== "referenced") continue;
      const entry = byReferrer.get(reason.referrer) ?? { files: 0, bytes: 0 };
      entry.files += 1;
      entry.bytes += bytes;
      byReferrer.set(reason.referrer, entry);
    }
    if (!byReferrer.size) return;
    const ranked = [...byReferrer.entries()].sort(([, a], [, b]) => b.bytes - a.bytes);
    const named = ranked
      .slice(0, 3)
      .map(([referrer, { files, bytes }]) => `${referrer} (${files}, ${FontPruner.formatBytes(bytes)})`);
    const rest = ranked.length - named.length;
    this.#app.logger.info(
      `[font-prune] kept ${FontPruner.formatBytes(ranked.reduce((total, [, entry]) => total + entry.bytes, 0))} of fonts in public/ because these reference them: ${named.join(", ")}${rest > 0 ? ` and ${rest} more` : ""}`,
    );
  }

  static describe(reason: FontKeepReason) {
    if (reason.kind === "unoptimized") return "declared with optimize: false, so the runtime CSS serves it";
    if (reason.kind === "declared") return `kept by assets.keepFonts "${reason.glob}"`;
    return `referenced by ${reason.referrer}`;
  }

  static formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
  }

  async #isDirectory(dir: string) {
    return await stat(dir).then(
      (entry) => entry.isDirectory(),
      () => false,
    );
  }
}
