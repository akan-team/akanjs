export interface DictionaryPack {
  //? Each file's groups. A group no route names sits in the last file, which only a translation miss asks for.
  parts: string[][];
  partsByRoute: Record<string, number[]>;
}

//* Packs a page dictionary's groups into files so that a route loads at most `bound` of them. It starts from the
//* groups every route takes or leaves together (no route downloads a text it does not show), merges two files while
//* the requests it saves routes needing both outweigh the bytes it adds to routes needing one, then, inside the route
//* needing the most files, merges the two whose merge adds the fewest bytes until every route is within the bound.
export class DictionaryPacking {
  static readonly bound = 4;
  //? What one more request costs a route in bytes of text: headers, a round trip's share, and the brotli window a
  //? small file compresses without.
  static readonly requestBytes = 1024;

  static pack(
    routes: ReadonlyMap<string, readonly string[]>,
    bytesOf: (group: string) => number,
    groups: readonly string[],
    { bound = DictionaryPacking.bound, requestBytes = DictionaryPacking.requestBytes } = {},
  ): DictionaryPack {
    const known = new Set(groups);
    const routeIds = [...routes.keys()].sort();
    const needs = routeIds.map((routeId) => [...new Set(routes.get(routeId))].filter((group) => known.has(group)));
    const bySignature = new Map<string, string[]>();
    for (const group of [...known].sort()) {
      const signature = needs.flatMap((need, idx) => (need.includes(group) ? [idx] : [])).join(",");
      if (signature) bySignature.set(signature, [...(bySignature.get(signature) ?? []), group]);
    }
    const parts = [...bySignature.values()];
    while (DictionaryPacking.#mergeCheapest(parts, needs, bytesOf, requestBytes, null));
    for (let worst = DictionaryPacking.#widest(parts, needs, bound); worst; ) {
      if (!DictionaryPacking.#mergeCheapest(parts, needs, bytesOf, 0, worst)) break;
      worst = DictionaryPacking.#widest(parts, needs, bound);
    }
    parts.sort((a, b) => ((a[0] ?? "") < (b[0] ?? "") ? -1 : 1));
    const used = new Set(parts.flat());
    const rest = [...known].filter((group) => !used.has(group)).sort((a, b) => (a < b ? -1 : 1));
    if (rest.length) parts.push(rest);
    const partOf = new Map(parts.flatMap((part, idx) => part.map((group) => [group, idx] as const)));
    const partsByRoute = Object.fromEntries(
      routeIds.map((routeId, idx) => [
        routeId,
        [...new Set((needs[idx] ?? []).map((group) => partOf.get(group) as number))].sort((a, b) => a - b),
      ]),
    );
    return { parts, partsByRoute };
  }

  static #setsOf(parts: string[][], needs: string[][]) {
    const partOf = new Map(parts.flatMap((part, idx) => part.map((group) => [group, idx] as const)));
    return needs.map((need) => new Set(need.map((group) => partOf.get(group) as number)));
  }

  static #widest(parts: string[][], needs: string[][], bound: number): Set<number> | null {
    let worst: Set<number> | null = null;
    for (const set of DictionaryPacking.#setsOf(parts, needs))
      if (set.size > Math.max(1, bound) && (!worst || set.size > worst.size)) worst = set;
    return worst;
  }

  //? `within` set: any pair of its files merges, the cheapest first; otherwise only a pair whose merge pays for itself.
  static #mergeCheapest(
    parts: string[][],
    needs: string[][],
    bytesOf: (group: string) => number,
    requestBytes: number,
    within: Set<number> | null,
  ): boolean {
    const sets = DictionaryPacking.#setsOf(parts, needs);
    const bytes = parts.map((part) => part.reduce((sum, group) => sum + bytesOf(group), 0));
    const candidates = within ? [...within].sort((a, b) => a - b) : parts.map((_, idx) => idx);
    let best: { p: number; q: number; cost: number } | null = null;
    for (let x = 0; x < candidates.length; x++)
      for (let y = x + 1; y < candidates.length; y++) {
        const [p, q] = [candidates[x] as number, candidates[y] as number];
        let cost = 0;
        for (const set of sets) {
          const [hasP, hasQ] = [set.has(p), set.has(q)];
          if (hasP && hasQ) cost -= requestBytes;
          else if (hasP) cost += bytes[q] ?? 0;
          else if (hasQ) cost += bytes[p] ?? 0;
        }
        if (!best || cost < best.cost) best = { p, q, cost };
      }
    if (!best || (!within && best.cost >= 0)) return false;
    parts[best.p] = [...(parts[best.p] ?? []), ...(parts[best.q] ?? [])].sort();
    parts.splice(best.q, 1);
    return true;
  }
}
