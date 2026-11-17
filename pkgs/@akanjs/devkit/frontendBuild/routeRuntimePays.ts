import type { BundleClientEntriesResult } from "./clientBuildTypes";
import { chunkBrotliBytesOf } from "./precompressArtifacts";

export interface RoutePaysInput {
  //? Every entry a route may load: one of them kept makes the route load the whole runtime.
  entriesByRoute: ReadonlyMap<string, readonly string[]>;
  isKept: (entry: string) => boolean;
  //? An entry a build already tried keeping whole, where a page it holds came out larger: it is never tried again.
  isRefused?: (entry: string) => boolean;
  //? Brotli bytes of the chunks a route loads first, in a build where every entry keeps the whole runtime.
  whole: ReadonlyMap<string, number>;
  //? The same in the build being judged.
  measured: ReadonlyMap<string, number>;
}

export interface RoutePaysVerdict {
  entry: string;
  route: string;
  whole: number;
  perModule: number;
}

export interface RoutePaidInput {
  entriesByRoute: ReadonlyMap<string, readonly string[]>;
  wasKept: (entry: string) => boolean;
  isKept: (entry: string) => boolean;
  before: ReadonlyMap<string, number>;
  after: ReadonlyMap<string, number>;
}

export class RouteRuntimePays {
  readonly #sizes = new Map<string, number>();

  //* An entry only pages that got no smaller hold is kept. One shared with a page that did get smaller is kept only
  //* where the pages it would spare lose more bytes than the pages it takes the whole runtime to had gained.
  static decide({ entriesByRoute, isKept, isRefused, whole, measured }: RoutePaysInput): RoutePaysVerdict[] {
    const lossOf = (route: string) => (measured.get(route) ?? 0) - (whole.get(route) ?? 0);
    const perModule = [...entriesByRoute].filter(([, entries]) => entries.length > 0 && !entries.some(isKept));
    const gaining = new Map(perModule.filter(([route]) => lossOf(route) < 0));
    const losing = new Map(perModule.filter(([route]) => lossOf(route) >= 0));
    const verdicts = new Map<string, RoutePaysVerdict>();
    const keep = (entry: string, route: string) => {
      if (verdicts.has(entry) || isRefused?.(entry)) return;
      verdicts.set(entry, { entry, route, whole: whole.get(route) ?? 0, perModule: measured.get(route) ?? 0 });
      for (const [other, entries] of gaining) if (entries.includes(entry)) gaining.delete(other);
      for (const [other, entries] of losing) if (entries.includes(entry)) losing.delete(other);
    };
    const heldByGaining = () => new Set([...gaining.values()].flat());
    const shared = heldByGaining();
    for (const [route, entries] of [...losing]) for (const entry of entries) if (!shared.has(entry)) keep(entry, route);
    for (;;) {
      const scores = new Map<string, { score: number; route: string }>();
      for (const [route, entries] of losing)
        for (const entry of entries) {
          const known = scores.get(entry) ?? { score: 0, route };
          scores.set(entry, { score: known.score + lossOf(route), route: known.route });
        }
      for (const [route, entries] of gaining)
        for (const entry of entries) {
          const known = scores.get(entry);
          if (known) known.score += lossOf(route);
        }
      const [best] = [...scores]
        .filter(([entry, { score }]) => score > 0 && !isRefused?.(entry))
        .sort(([a, x], [b, y]) => y.score - x.score || a.localeCompare(b));
      if (!best) break;
      keep(best[0], best[1].route);
    }
    return [...verdicts.values()];
  }

  //* The all-whole build only nominates: among pages that share chunks, a page kept whole is not the size it has
  //* where every page is. So the build keeping the nominated entries is measured too, and this names the routes it
  //* moved to the whole runtime that came out no smaller than they were, all of them where the routes together did.
  static larger({ entriesByRoute, wasKept, isKept, before, after }: RoutePaidInput): string[] {
    const sizeIn = (sizes: ReadonlyMap<string, number>, route: string) => sizes.get(route) ?? 0;
    const moved = [...entriesByRoute]
      .filter(([, entries]) => !entries.some(wasKept) && entries.some(isKept))
      .map(([route]) => route);
    const larger = moved.filter((route) => sizeIn(after, route) >= sizeIn(before, route));
    if (larger.length > 0) return larger;
    const total = (sizes: ReadonlyMap<string, number>) =>
      [...entriesByRoute.keys()].reduce((sum, route) => sum + sizeIn(sizes, route), 0);
    return total(after) >= total(before) ? moved : [];
  }

  //? Only what a route's entries import statically counts: a chunk asked for with `import()` is not its first load.
  async sizesOf(
    bundle: Pick<BundleClientEntriesResult, "entryOutputAbsByAbsPath" | "graph">,
    buildEntriesByRoute: ReadonlyMap<string, readonly string[]>,
  ): Promise<Map<string, number>> {
    const sizes = new Map<string, number>();
    for (const [route, buildEntries] of buildEntriesByRoute) {
      const chunks = new Set<string>();
      for (const entry of buildEntries) {
        const output = bundle.entryOutputAbsByAbsPath.get(entry);
        if (output) chunks.add(output);
      }
      for (const chunk of chunks)
        for (const imported of bundle.graph.importsByChunk.get(chunk) ?? []) chunks.add(imported);
      let total = 0;
      for (const chunk of chunks) total += await this.#sizeOf(chunk);
      sizes.set(route, total);
    }
    return sizes;
  }

  async #sizeOf(chunk: string): Promise<number> {
    const bytes = await Bun.file(chunk).bytes();
    const key = `${bytes.byteLength}:${Bun.hash(bytes).toString(36)}`;
    const known = this.#sizes.get(key);
    if (known !== undefined) return known;
    const size = chunkBrotliBytesOf(bytes);
    this.#sizes.set(key, size);
    return size;
  }
}
