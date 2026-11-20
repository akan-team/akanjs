interface PairCost {
  p: number;
  q: number;
  cost: number;
}

export class DictionaryPackState {
  readonly #routeCount: number;
  readonly #words: number;
  readonly #groups: string[][];
  readonly #bytes: number[];
  readonly #routes: Uint32Array[];
  readonly #alive: boolean[];
  readonly #overfetch: Float64Array;
  readonly #budget: number;
  //? |routes of p ∩ routes of q|, so a merge's cost needs no pass over the routes.
  readonly #shared: Int32Array;

  constructor(
    routeCount: number,
    parts: readonly (readonly [groups: string[], routes: number[]])[],
    bytesOf: (group: string) => number,
    budget: number,
  ) {
    this.#routeCount = routeCount;
    this.#words = Math.ceil(routeCount / 32);
    this.#groups = parts.map(([groups]) => [...groups]);
    this.#bytes = parts.map(([groups]) => groups.reduce((sum, group) => sum + bytesOf(group), 0));
    this.#routes = parts.map(([, routes]) => {
      const bits = new Uint32Array(this.#words);
      for (const route of routes) bits[route >>> 5] = (bits[route >>> 5] ?? 0) | (1 << (route & 31));
      return bits;
    });
    this.#alive = parts.map(() => true);
    this.#overfetch = new Float64Array(routeCount);
    this.#budget = budget;
    this.#shared = new Int32Array(parts.length * parts.length);
    for (let p = 0; p < parts.length; p++) this.#countRow(p);
  }

  parts(): string[][] {
    return this.#groups.filter((_, p) => this.#alive[p]);
  }

  //? Only a pair whose merge pays for itself, the cheapest first, passing over one that puts a route over its budget.
  mergeCheapest(requestBytes: number): boolean {
    const alive = this.#groups.flatMap((_, p) => (this.#alive[p] ? [p] : []));
    const pairs: PairCost[] = [];
    let best: PairCost | null = null;
    for (let x = 0; x < alive.length; x++)
      for (let y = x + 1; y < alive.length; y++) {
        const [p, q] = [alive[x] as number, alive[y] as number];
        const both = this.#count(p, q);
        const cost =
          (this.#bytes[q] ?? 0) * (this.#count(p, p) - both) +
          (this.#bytes[p] ?? 0) * (this.#count(q, q) - both) -
          requestBytes * both;
        if (cost >= 0) continue;
        const pair = { p, q, cost };
        pairs.push(pair);
        if (!best || cost < best.cost) best = pair;
      }
    if (best && this.#fits(best)) return this.#merge(best);
    pairs.sort((a, b) => a.cost - b.cost);
    const fitting = pairs.find((pair) => pair !== best && this.#fits(pair));
    return fitting ? this.#merge(fitting) : false;
  }

  #fits({ p, q }: PairCost): boolean {
    const [rp, rq] = [this.#routes[p] as Uint32Array, this.#routes[q] as Uint32Array];
    const [bp, bq] = [this.#bytes[p] ?? 0, this.#bytes[q] ?? 0];
    for (let word = 0; word < this.#words; word++) {
      const [onlyP, onlyQ] = [(rp[word] ?? 0) & ~(rq[word] ?? 0), (rq[word] ?? 0) & ~(rp[word] ?? 0)];
      if (!this.#within(word, onlyP, bq) || !this.#within(word, onlyQ, bp)) return false;
    }
    return true;
  }

  #within(word: number, bits: number, added: number): boolean {
    for (let set = bits >>> 0; set; set = (set & (set - 1)) >>> 0)
      if ((this.#overfetch[word * 32 + 31 - Math.clz32(set & -set)] ?? 0) + added > this.#budget) return false;
    return true;
  }

  #merge({ p, q }: PairCost): true {
    const [rp, rq] = [this.#routes[p] as Uint32Array, this.#routes[q] as Uint32Array];
    const [bp, bq] = [this.#bytes[p] ?? 0, this.#bytes[q] ?? 0];
    for (let word = 0; word < this.#words; word++) {
      this.#add(word, (rp[word] ?? 0) & ~(rq[word] ?? 0), bq);
      this.#add(word, (rq[word] ?? 0) & ~(rp[word] ?? 0), bp);
      rp[word] = (rp[word] ?? 0) | (rq[word] ?? 0);
    }
    this.#groups[p] = [...(this.#groups[p] ?? []), ...(this.#groups[q] ?? [])].sort();
    this.#bytes[p] = bp + bq;
    this.#alive[q] = false;
    this.#countRow(p);
    return true;
  }

  #add(word: number, bits: number, added: number) {
    for (let set = bits >>> 0; set; set = (set & (set - 1)) >>> 0) {
      const route = word * 32 + 31 - Math.clz32(set & -set);
      if (route < this.#routeCount) this.#overfetch[route] = (this.#overfetch[route] ?? 0) + added;
    }
  }

  #countRow(p: number) {
    const size = this.#groups.length;
    const rp = this.#routes[p] as Uint32Array;
    for (let q = 0; q < size; q++) {
      if (!this.#alive[q]) continue;
      const rq = this.#routes[q] as Uint32Array;
      let count = 0;
      for (let word = 0; word < this.#words; word++)
        count += DictionaryPackState.#popcount((rp[word] ?? 0) & (rq[word] ?? 0));
      this.#shared[p * size + q] = count;
      this.#shared[q * size + p] = count;
    }
  }

  #count(p: number, q: number): number {
    return this.#shared[p * this.#groups.length + q] ?? 0;
  }

  static #popcount(value: number): number {
    let v = value >>> 0;
    v -= (v >>> 1) & 0x55555555;
    v = (v & 0x33333333) + ((v >>> 2) & 0x33333333);
    return (((v + (v >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24;
  }
}
