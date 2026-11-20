import { type DictionaryOwnNeed, DictionaryOwnParts } from "./dictionaryOwnParts";
import { DictionaryPackState } from "./dictionaryPackState";

export interface DictionaryPack {
  //? Each file's groups. A group no route names sits in the last file, which only a translation miss asks for.
  parts: string[][];
  //? Files past `parts` in `partsByRoute`: each holds, for the routes naming it, the groups of their files past the bound.
  ownParts: string[][];
  partsByRoute: Record<string, number[]>;
}

export interface DictionaryPackOptions {
  bound?: number;
  requestBytes?: number;
  overfetchBytes?: number;
}

//* Packs a page dictionary's groups into files so that a route loads at most `bound` of them. It starts from the
//* groups every route takes or leaves together and merges two files while the requests saved outweigh the bytes added,
//* never past a route's `overfetchBytes` of texts it does not show; a route past the bound takes the rest in its own file.
export class DictionaryPacking {
  static readonly bound = 4;
  //? What one more request costs a route in bytes of text: headers, a round trip's share, and the brotli window a
  //? small file compresses without.
  static readonly requestBytes = 1024;
  //? About 2 KB brotli: what other routes showing other texts can add to a route's dictionary at most.
  static readonly overfetchBytes = 8192;

  static pack(
    routes: ReadonlyMap<string, readonly string[]>,
    bytesOf: (group: string) => number,
    groups: readonly string[],
    {
      bound = DictionaryPacking.bound,
      requestBytes = DictionaryPacking.requestBytes,
      overfetchBytes = DictionaryPacking.overfetchBytes,
    }: DictionaryPackOptions = {},
  ): DictionaryPack {
    const known = new Set(groups);
    const routeIds = [...routes.keys()].sort();
    const needs = routeIds.map((routeId) => [...new Set(routes.get(routeId))].filter((group) => known.has(group)));
    const bySignature = new Map<string, string[]>();
    for (const group of [...known].sort()) {
      const signature = needs.flatMap((need, idx) => (need.includes(group) ? [idx] : [])).join(",");
      if (signature) bySignature.set(signature, [...(bySignature.get(signature) ?? []), group]);
    }
    const signed = [...bySignature].map(([signature, held]) => [held, signature.split(",").map(Number)] as const);
    const state = new DictionaryPackState(routeIds.length, signed, bytesOf, overfetchBytes);
    while (state.mergeCheapest(requestBytes));
    const parts = state.parts().sort((a, b) => ((a[0] ?? "") < (b[0] ?? "") ? -1 : 1));
    const used = new Set(parts.flat());
    const rest = [...known].filter((group) => !used.has(group)).sort((a, b) => (a < b ? -1 : 1));
    if (rest.length) parts.push(rest);
    const partOf = new Map(parts.flatMap((part, idx) => part.map((group) => [group, idx] as const)));
    const filesByRoute = new Map<string, number[]>();
    const ownNeeds: DictionaryOwnNeed[] = [];
    for (const [idx, routeId] of routeIds.entries()) {
      const need = needs[idx] ?? [];
      const files = [...new Set(need.map((group) => partOf.get(group) as number))].sort((a, b) => a - b);
      if (files.length <= Math.max(1, bound)) {
        filesByRoute.set(routeId, files);
        continue;
      }
      const { kept, own, overfetch } = DictionaryPacking.#keepWithin(files, parts, new Set(need), bytesOf, bound);
      filesByRoute.set(routeId, kept);
      ownNeeds.push({ routeId, groups: own, left: overfetchBytes - overfetch });
    }
    const own = DictionaryOwnParts.share(ownNeeds, bytesOf);
    const partsByRoute = Object.fromEntries(
      routeIds.map((routeId) => {
        const files = filesByRoute.get(routeId) ?? [];
        const ownIdx = own.partOf.get(routeId);
        return [routeId, ownIdx === undefined ? files : [...files, parts.length + ownIdx]];
      }),
    );
    return { parts, ownParts: own.parts, partsByRoute };
  }

  static #keepWithin(
    files: number[],
    parts: string[][],
    need: Set<string>,
    bytesOf: (group: string) => number,
    bound: number,
  ): { kept: number[]; own: string[]; overfetch: number } {
    const scored = files.map((idx) => ({
      idx,
      score: (parts[idx] ?? []).reduce((sum, group) => sum + (need.has(group) ? 1 : -1) * bytesOf(group), 0),
    }));
    scored.sort((a, b) => b.score - a.score || a.idx - b.idx);
    const kept = scored
      .slice(0, Math.max(1, bound) - 1)
      .filter(({ score }) => score > 0)
      .map(({ idx }) => idx);
    const keptSet = new Set(kept);
    const own = files
      .filter((idx) => !keptSet.has(idx))
      .flatMap((idx) => (parts[idx] ?? []).filter((group) => need.has(group)))
      .sort();
    const overfetch = kept
      .flatMap((idx) => (parts[idx] ?? []).filter((group) => !need.has(group)))
      .reduce((sum, group) => sum + bytesOf(group), 0);
    return { kept: kept.sort((a, b) => a - b), own, overfetch };
  }

  //? Several files compress worse than one, so a route showing nearly every text is cheaper on the whole dictionary.
  static packUnderWhole(
    routes: ReadonlyMap<string, readonly string[]>,
    bytesOf: (group: string) => number,
    groups: readonly string[],
    servedBytesOf: (groups: readonly string[]) => number,
    options: DictionaryPackOptions = {},
  ): DictionaryPack & { wholeRoutes: string[] } {
    const whole = servedBytesOf([...new Set(groups)].sort());
    const served = new Map<string, number>();
    const servedOf = (part: readonly string[]) => {
      const key = part.join("\n");
      const known = served.get(key) ?? servedBytesOf(part);
      served.set(key, known);
      return known;
    };
    const shownBytesOf = (routeId: string) =>
      [...new Set(routes.get(routeId))].reduce((sum, group) => sum + bytesOf(group), 0);
    const partial = new Map(routes);
    let best: { pack: DictionaryPack; over: string[]; cost: number } | null = null;
    for (;;) {
      const pack = DictionaryPacking.pack(partial, bytesOf, groups, options);
      const files = [...pack.parts, ...pack.ownParts];
      const costs = Object.entries(pack.partsByRoute).map(([routeId, held]) => ({
        routeId,
        cost: held.reduce((sum, idx) => sum + servedOf(files[idx] ?? []), 0),
      }));
      const over = costs.filter(({ cost }) => cost >= whole).map(({ routeId }) => routeId);
      const cost =
        costs.reduce((sum, route) => sum + Math.min(route.cost, whole), 0) + (routes.size - partial.size) * whole;
      if (!best || cost < best.cost) best = { pack, over, cost };
      if (!over.length) break;
      //? Half at a time, the routes showing the most first: without them the rest may come out smaller after all.
      over.sort((a, b) => shownBytesOf(b) - shownBytesOf(a) || (a < b ? -1 : 1));
      for (const routeId of over.slice(0, Math.ceil(over.length / 2))) partial.delete(routeId);
    }
    const dropped = new Set(best.over);
    const kept = Object.entries(best.pack.partsByRoute).filter(([routeId]) => !dropped.has(routeId));
    const { parts, ownParts } = best.pack;
    const ownUsed = [...new Set(kept.flatMap(([, held]) => held.filter((idx) => idx >= parts.length)))].sort(
      (a, b) => a - b,
    );
    const ownMoved = new Map(ownUsed.map((idx, at) => [idx, parts.length + at]));
    const partsByRoute = Object.fromEntries(
      kept.map(([routeId, held]) => [routeId, held.map((idx) => ownMoved.get(idx) ?? idx)]),
    );
    const wholeRoutes = [...routes.keys()].sort().filter((routeId) => !Object.hasOwn(partsByRoute, routeId));
    return {
      parts,
      ownParts: ownUsed.map((idx) => ownParts[idx - parts.length] ?? []),
      partsByRoute,
      wholeRoutes,
    };
  }
}
