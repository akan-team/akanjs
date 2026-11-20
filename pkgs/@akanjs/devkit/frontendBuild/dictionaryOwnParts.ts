export interface DictionaryOwnNeed {
  routeId: string;
  groups: string[];
  //? What the route may still download of texts it does not show, after the shared files it keeps.
  left: number;
}

interface OwnCluster {
  groups: Set<string>;
  bytes: number;
  members: { routeId: string; left: number }[];
}

//? Two own files become one where that adds their routes fewer bytes than the files share, so neighbouring pages reuse it.
export class DictionaryOwnParts {
  static share(
    needs: readonly DictionaryOwnNeed[],
    bytesOf: (group: string) => number,
  ): { parts: string[][]; partOf: Map<string, number> } {
    const byKey = new Map<string, OwnCluster>();
    for (const { routeId, groups, left } of needs) {
      const key = groups.join("\n");
      const cluster = byKey.get(key) ?? {
        groups: new Set(groups),
        bytes: groups.reduce((sum, group) => sum + bytesOf(group), 0),
        members: [],
      };
      cluster.members.push({ routeId, left });
      byKey.set(key, cluster);
    }
    const clusters = [...byKey.values()];
    const shared = clusters.map((a) => clusters.map((b) => DictionaryOwnParts.#sharedBytes(a, b, bytesOf)));
    for (;;) {
      const pair = DictionaryOwnParts.#bestPair(clusters, shared);
      if (!pair) break;
      DictionaryOwnParts.#merge(clusters, shared, pair, bytesOf);
    }
    const live = clusters.filter(({ members }) => members.length);
    const parts = live.map(({ groups }) => [...groups].sort());
    const partOf = new Map(live.flatMap(({ members }, idx) => members.map(({ routeId }) => [routeId, idx] as const)));
    return { parts, partOf };
  }

  static #bestPair(clusters: OwnCluster[], shared: number[][]): { p: number; q: number } | null {
    let best: { p: number; q: number; saved: number } | null = null;
    for (let p = 0; p < clusters.length; p++)
      for (let q = p + 1; q < clusters.length; q++) {
        const [a, b] = [clusters[p] as OwnCluster, clusters[q] as OwnCluster];
        if (!a.members.length || !b.members.length) continue;
        const both = shared[p]?.[q] ?? 0;
        const [toA, toB] = [b.bytes - both, a.bytes - both];
        if (a.members.some(({ left }) => left < toA) || b.members.some(({ left }) => left < toB)) continue;
        if (toA * a.members.length + toB * b.members.length >= both) continue;
        if (!best || both > best.saved) best = { p, q, saved: both };
      }
    return best;
  }

  static #merge(
    clusters: OwnCluster[],
    shared: number[][],
    { p, q }: { p: number; q: number },
    bytesOf: (group: string) => number,
  ) {
    const [a, b] = [clusters[p] as OwnCluster, clusters[q] as OwnCluster];
    const both = shared[p]?.[q] ?? 0;
    const [toA, toB] = [b.bytes - both, a.bytes - both];
    for (const member of a.members) member.left -= toA;
    for (const member of b.members) member.left -= toB;
    for (const group of b.groups) a.groups.add(group);
    a.bytes += toA;
    a.members.push(...b.members);
    b.members = [];
    b.groups = new Set();
    b.bytes = 0;
    clusters.forEach((other, idx) => {
      const bytes = DictionaryOwnParts.#sharedBytes(a, other, bytesOf);
      (shared[p] as number[])[idx] = bytes;
      (shared[idx] as number[])[p] = bytes;
    });
  }

  static #sharedBytes(a: OwnCluster, b: OwnCluster, bytesOf: (group: string) => number): number {
    let bytes = 0;
    for (const group of a.groups) if (b.groups.has(group)) bytes += bytesOf(group);
    return bytes;
  }
}
