import fs from "node:fs/promises";
import path from "node:path";
import { Logger } from "akanjs/common";
import type { CssAsset } from "../types";

//* A dev pages build that changes server output writes a new `pages-<hash>.js` (8MB on minimal, 21MB on apps/akan) and
//* a CSS change a new stylesheet, and nothing else removes either before the next `akan start` clears `.akan`.
export class DevArtifactPruner {
  //? Another replica of the same app may still be importing a bundle this one has moved past.
  static readonly #defaultGraceMs = 60_000;
  static readonly #pagesFile = /^pages-[^/\\]+\.js$/;
  readonly #logger = new Logger("DevArtifactPruner");
  readonly #artifactDir: string;
  readonly #graceMs: number;
  #pruning: Promise<void> = Promise.resolve();

  constructor(artifactDir: string, { graceMs = DevArtifactPruner.#defaultGraceMs }: { graceMs?: number } = {}) {
    this.#artifactDir = path.resolve(artifactDir);
    this.#graceMs = graceMs;
  }

  //? Kept: the bundle the worker runs (a respawn imports it again), every bundle written after it (a reload on its way,
  //? or one that failed to load and that the dev host replays to a restarted backend), and the base artifact's, which
  //? a restarted backend boots from.
  prunePages(runningPath: string): Promise<void> {
    return this.#queue(async () => {
      const running = await fs.stat(runningPath).catch(() => null);
      if (!running) return;
      const keep = new Set([path.resolve(runningPath), ...(await this.#baseArtifact()).pages]);
      const serverDir = path.join(this.#artifactDir, "server");
      const before = Math.min(running.mtimeMs, Date.now() - this.#graceMs);
      await this.#removeOlder(serverDir, (name) => DevArtifactPruner.#pagesFile.test(name), keep, before);
    });
  }

  //? The gateway serves `/_akan/styles/*` from disk, and a tab swaps its link on the css update that names the new one.
  pruneStyles(cssAssets: Record<string, CssAsset>): Promise<void> {
    return this.#queue(async () => {
      const current = Object.values(cssAssets).map((asset) => path.join(this.#artifactDir, asset.cssRelPath));
      const keep = new Set([...current, ...(await this.#baseArtifact()).styles]);
      const stylesDir = path.join(this.#artifactDir, "styles");
      await this.#removeOlder(stylesDir, (name) => name.endsWith(".css"), keep, Date.now() - this.#graceMs);
    });
  }

  #queue(prune: () => Promise<void>): Promise<void> {
    this.#pruning = this.#pruning.then(prune).catch((error: unknown) => {
      this.#logger.verbose(`[dev-artifact] prune skipped: ${String(error)}`);
    });
    return this.#pruning;
  }

  async #removeOlder(dir: string, matches: (name: string) => boolean, keep: Set<string>, before: number) {
    const names = await fs.readdir(dir).catch(() => [] as string[]);
    let removed = 0;
    for (const name of names) {
      const file = path.join(dir, name);
      if (!matches(name) || keep.has(file)) continue;
      const stat = await fs.stat(file).catch(() => null);
      if (!stat || stat.mtimeMs >= before) continue;
      //? Windows refuses to unlink a file a reader holds open; the next prune gets it.
      if (
        await fs.rm(file, { force: true }).then(
          () => true,
          () => false,
        )
      )
        removed += 1;
    }
    if (removed > 0) this.#logger.verbose(`[dev-artifact] removed ${removed} superseded file(s) from ${dir}`);
  }

  async #baseArtifact(): Promise<{ pages: string[]; styles: string[] }> {
    const text = await fs.readFile(path.join(this.#artifactDir, "base-artifact.json"), "utf8").catch(() => null);
    const artifact = text
      ? (JSON.parse(text) as { pagesBundlePath?: string; cssAssets?: Record<string, CssAsset> })
      : null;
    return {
      pages: artifact?.pagesBundlePath ? [path.resolve(this.#artifactDir, artifact.pagesBundlePath)] : [],
      styles: Object.values(artifact?.cssAssets ?? {}).map((asset) => path.join(this.#artifactDir, asset.cssRelPath)),
    };
  }
}
