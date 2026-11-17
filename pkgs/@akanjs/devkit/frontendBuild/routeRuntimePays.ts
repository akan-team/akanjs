import type { BundleClientEntriesResult } from "./clientBuildTypes";
import { chunkBrotliBytesOf } from "./precompressArtifacts";

export interface RoutePaysInput {
  //? Every entry a route may load: one of them kept makes the route load the whole runtime.
  entriesByRoute: ReadonlyMap<string, readonly string[]>;
  isKept: (entry: string) => boolean;
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

//* Which entries a `clientRuntime: "route"` build keeps whole because loading per module made a page no smaller.
export class RouteRuntimePays {
  readonly #sizes = new Map<string, number>();

  //* An entry only pages that got no smaller hold is kept. One shared with a page that did get smaller is kept only
  //* where the pages it would spare lose more bytes than the pages it takes the whole runtime to had gained.
  static decide({ entriesByRoute, isKept, whole, measured }: RoutePaysInput): RoutePaysVerdict[] {
    const lossOf = (route: string) => (measured.get(route) ?? 0) - (whole.get(route) ?? 0);
    const perModule = [...entriesByRoute].filter(([, entries]) => entries.length > 0 && !entries.some(isKept));
    const gaining = new Map(perModule.filter(([route]) => lossOf(route) < 0));
    const losing = new Map(perModule.filter(([route]) => lossOf(route) >= 0));
    const verdicts = new Map<string, RoutePaysVerdict>();
    const keep = (entry: string, route: string) => {
      if (verdicts.has(entry)) return;
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
        .filter(([, { score }]) => score > 0)
        .sort(([a, x], [b, y]) => y.score - x.score || a.localeCompare(b));
      if (!best) break;
      keep(best[0], best[1].route);
    }
    return [...verdicts.values()];
  }

  //* Each route's chunks are the ones its entries import statically, a chunk shared by two entries counted once.
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
