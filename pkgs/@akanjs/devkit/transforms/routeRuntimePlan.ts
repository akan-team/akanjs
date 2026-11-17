import type { RouteRuntimeGraph } from "./routeRuntimeGraph";

//? `file` is the one an author can change, as a workspace path, or a path under `akanjs/` for a framework component.
export interface RouteRuntimeWhy {
  file: string;
  line?: number;
  message: string;
}

export type RouteRuntimeKeep =
  | ({ rule: "reader"; path: string } & RouteRuntimeWhy)
  | { rule: "store-side"; file: string; message: string }
  | { rule: "lazy"; file: string; asks: string }
  | { rule: "majority"; whole: number; others: number }
  | { rule: "asked" }
  | { rule: "unheld" }
  | { rule: "not-smaller"; route: string; whole: number; perModule: number }
  //? The build every page is measured against, in which every root keeps the whole runtime.
  | { rule: "reference" };

//? One reason roots keep the whole runtime, with every root and route it holds whole.
export interface RouteRuntimeCause {
  rule: RouteRuntimeKeep["rule"];
  file?: string;
  line?: number;
  message: string;
  entries: string[];
  routes: string[];
  //? For a file a root reaches: the imports from a root down to it, one chain per file importing it.
  chains: string[][];
}

const ruleMessages = {
  majority:
    "more pages keeping the whole runtime hold it than pages loading per module, whose pieces those pages would carry on top",
  asked: "only files keeping the whole runtime ask for it with import()",
  unheld: "no page loading per module holds it",
  reference: "the build measured every page with the whole runtime",
} as const;

export interface RouteRuntimePlanInput {
  graph: RouteRuntimeGraph;
  entries: ReadonlySet<string>;
  //? Null where no route was told: an entry of no route is then narrowed like any other.
  routes: ReadonlyMap<string, readonly string[]> | null;
  //? Why the file needs every module, or null where it loads only the modules it names.
  readsWhole: (file: string) => RouteRuntimeWhy | null;
  //? Why an entry a store file imports cannot be narrowed, or null.
  storeSide: (root: string) => string | null;
  bringsPieces: (file: string) => boolean;
  nameOf: (file: string) => string;
}

//* Which roots of a `clientRuntime: "route"` build keep the whole runtime, each with the reason it does. A root is only
//* ever added: every rule keeps more as others keep more, so replaying them after a new keep ends and cannot undo one.
export class RouteRuntimePlan {
  static readonly chainsShown = 3;
  readonly keeps = new Map<string, RouteRuntimeKeep>();
  readonly roots: string[];
  readonly #input: RouteRuntimePlanInput;
  readonly #closures: Map<string, Set<string>>;
  readonly #lazyOf: Map<string, string[]>;

  constructor(input: RouteRuntimePlanInput) {
    this.#input = input;
    const { graph, entries } = input;
    this.roots = [...new Set([...entries, ...graph.lazyRoots])];
    this.#closures = new Map(this.roots.map((root) => [root, graph.closureOf([root])]));
    this.#lazyOf = new Map(
      this.roots.map((root) => [root, [...this.closureOf(root)].flatMap((file) => graph.lazyImportsOf(file))]),
    );
    this.#keepReaders();
    this.#keepAskers();
    this.#keepMajority(true);
    this.#settle();
  }

  get routes(): ReadonlyMap<string, readonly string[]> {
    return this.#input.routes ?? new Map();
  }

  get told() {
    return this.#input.routes !== null;
  }

  closureOf(root: string): Set<string> {
    return this.#closures.get(root) ?? new Set();
  }

  isWhole(route: readonly string[]) {
    return route.some((entry) => this.keeps.has(entry));
  }

  //? The imports from a root down to a file it reaches, both included.
  chainTo(root: string, target: string): string[] {
    const { graph } = this.#input;
    const parents = new Map<string, string | null>([[root, null]]);
    for (const file of parents.keys()) {
      if (file === target) break;
      for (const imported of graph.importsOf(file)) if (!parents.has(imported)) parents.set(imported, file);
    }
    const chain: string[] = [];
    for (let file: string | null = parents.has(target) ? target : null; file; file = parents.get(file) ?? null)
      chain.unshift(file);
    return chain;
  }

  causes(): RouteRuntimeCause[] {
    const { nameOf } = this.#input;
    const causes = new Map<string, RouteRuntimeCause>();
    const tails = new Map<string, Set<string>>();
    for (const [root, keep] of this.keeps) {
      const said =
        keep.rule === "reader" || keep.rule === "store-side"
          ? { file: keep.file, ...("line" in keep && keep.line ? { line: keep.line } : {}), message: keep.message }
          : keep.rule === "lazy"
            ? { message: `asks with import() for ${keep.asks}, which keeps the whole runtime` }
            : keep.rule === "not-smaller"
              ? {
                  message: `${keep.route} is ${keep.perModule} B loading per module and ${keep.whole} B with the whole runtime`,
                }
              : { message: ruleMessages[keep.rule] };
      const key = JSON.stringify([keep.rule, said]);
      const cause = causes.get(key) ?? { rule: keep.rule, ...said, entries: [], routes: [], chains: [] };
      causes.set(key, cause);
      cause.entries.push(nameOf(root));
      for (const [route, entries] of this.routes)
        if (entries.includes(root) && !cause.routes.includes(route)) cause.routes.push(route);
      if (keep.rule !== "reader") continue;
      const chain = this.chainTo(root, keep.path).map(nameOf);
      const seen = tails.get(key) ?? new Set<string>();
      tails.set(key, seen);
      const tail = chain.slice(-2).join(" ");
      if (!seen.has(tail) && seen.size < RouteRuntimePlan.chainsShown) cause.chains.push(chain);
      seen.add(tail);
    }
    return [...causes.values()].sort(
      (a, b) => b.routes.length - a.routes.length || b.entries.length - a.entries.length,
    );
  }

  keep(roots: Iterable<string>, why: RouteRuntimeKeep) {
    for (const root of roots) if (!this.keeps.has(root)) this.keeps.set(root, why);
    this.#settle();
  }

  #settle() {
    for (let size = -1; size !== this.keeps.size; ) {
      size = this.keeps.size;
      this.#keepAskers();
      this.#keepMajority(false);
      this.#keepAsked();
      this.#keepUnheld();
    }
  }

  #keepReaders() {
    const { readsWhole, storeSide, nameOf } = this.#input;
    for (const root of this.roots) {
      //? Nothing imports an entry, so no importer loads the stores a store-side entry's code names.
      const side = storeSide(root);
      if (side) {
        this.keeps.set(root, { rule: "store-side", file: nameOf(root), message: side });
        continue;
      }
      for (const file of this.closureOf(root)) {
        const why = readsWhole(file);
        if (!why) continue;
        this.keeps.set(root, { rule: "reader", path: file, ...why });
        break;
      }
    }
  }

  //? A module asked for by `import()` gets no entry of its own to load the whole runtime first, so its asker does.
  #keepAskers() {
    const { nameOf } = this.#input;
    for (let more = this.roots; more.length > 0; ) {
      more = this.roots.filter(
        (root) => !this.keeps.has(root) && this.#lazyOf.get(root)?.some((lazy) => this.keeps.has(lazy)),
      );
      for (const root of more) {
        const asks = this.#lazyOf.get(root)?.find((lazy) => this.keeps.has(lazy)) ?? root;
        this.keeps.set(root, { rule: "lazy", file: nameOf(root), asks: nameOf(asks) });
      }
    }
  }

  //? A narrowed entry's pieces repeat what a whole-runtime page already carries; pages a kept entry makes whole recount.
  //? `guessing` also keeps an entry more whole pages hold than others: once a build has measured its pages, only the
  //? entry no other page holds follows, since a guess there would take the whole runtime to a page measured smaller.
  #keepMajority(guessing: boolean) {
    const { bringsPieces } = this.#input;
    const routes = [...this.routes.values()];
    const brings = new Map<string, boolean>();
    const bringsOf = (root: string) => {
      const known = brings.get(root);
      if (known !== undefined) return known;
      const answer = [...this.closureOf(root)].some(bringsPieces);
      brings.set(root, answer);
      return answer;
    };
    for (let more = this.roots; more.length > 0; ) {
      const count = (held: boolean) => {
        const counts = new Map<string, number>();
        for (const route of routes)
          if (this.isWhole(route) === held) for (const entry of route) counts.set(entry, (counts.get(entry) ?? 0) + 1);
        return counts;
      };
      const [inWhole, inOther] = [count(true), count(false)];
      more = this.roots.filter((root) => {
        const [holding, others] = [inWhole.get(root) ?? 0, inOther.get(root) ?? 0];
        return !this.keeps.has(root) && holding > others && (others === 0 || (guessing && bringsOf(root)));
      });
      for (const root of more)
        this.keeps.set(root, { rule: "majority", whole: inWhole.get(root) ?? 0, others: inOther.get(root) ?? 0 });
    }
  }

  #keepAsked() {
    const { entries } = this.#input;
    const askers = new Map<string, string[]>();
    for (const [root, lazies] of this.#lazyOf)
      for (const lazy of lazies) askers.set(lazy, [...(askers.get(lazy) ?? []), root]);
    for (let more = [...askers]; more.length > 0; ) {
      more = [...askers].filter(
        ([lazy, askedBy]) =>
          !this.keeps.has(lazy) && !entries.has(lazy) && askedBy.every((root) => this.keeps.has(root)),
      );
      for (const [lazy] of more) this.keeps.set(lazy, { rule: "asked" });
    }
  }

  //? A root no page loading pieces holds or asks for would be narrowed for no page: the files it shares with a whole
  //? page would then load pieces of what that page's whole runtime already holds. With no whole page there is none to
  //? carry both, and a root keeping the whole runtime would split every page's chunks from the stores it reaches.
  #keepUnheld() {
    const routes = [...this.routes.values()];
    if (!this.told || !routes.some((route) => this.isWhole(route))) return;
    const live = new Set<string>();
    for (const route of routes) if (!this.isWhole(route)) for (const entry of route) live.add(entry);
    for (const root of live) for (const lazy of this.#lazyOf.get(root) ?? []) if (!this.keeps.has(lazy)) live.add(lazy);
    for (const root of this.roots)
      if (!this.keeps.has(root) && !live.has(root)) this.keeps.set(root, { rule: "unheld" });
  }
}
