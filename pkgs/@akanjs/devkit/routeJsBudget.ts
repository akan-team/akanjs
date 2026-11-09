import path from "node:path";
import { toError } from "akanjs/common";
import { FontPruner } from "./frontendBuild/fontPruner";
import { JsonFormatter } from "./jsonFormatter";

export interface RouteJsSize {
  routeId: string;
  files: number;
  rawBytes: number;
  brotliBytes: number;
}

export interface RouteJsOverage {
  routeId: string;
  brotliBytes: number;
  budgetKB: number;
  limitBytes: number;
}

export type RouteJsBudgetMode = "enforce" | "update" | "report" | "off";

export interface RouteJsBudgetCheck {
  mode: Exclude<RouteJsBudgetMode, "off">;
  budgetPath: string;
  source: string;
  environment: string;
}

//* Each entry is the brotli KB of every client module statically reachable from a route's page and layouts, plus
//* their vendors. `--update-budget` adds a new route and lowers an entry its route now fits under; only a hand edit
//* raises one. The check allows the larger of 1% and 4KB over an entry, as BundleSizeGate does: the bundles inline
//* `AKAN_PUBLIC_*`, so a budget recorded on a local build can measure over a kilobyte off a `--env main` one.
export class RouteJsBudget {
  static readonly fileName = "akan.budget.json";
  static readonly section = "routeJsBrotliKB";
  static readonly tableRows = 10;
  static readonly #relativeSlack = 0.01;
  static readonly #absoluteSlack = 4096;

  //? A file under 1 KB has no `.br` sidecar (precompressArtifacts skips it), so it is served, and counted, raw.
  static async measure(artifactDir: string, modulesByRoute: Record<string, string[]>): Promise<RouteJsSize[]> {
    const sizeByUrl = new Map<string, { raw: number; brotli: number }>();
    const sizeOf = async (url: string) => {
      const file = path.join(artifactDir, url.replace(/^\/_akan\//, ""));
      const raw = Bun.file(file).size;
      const sidecar = Bun.file(`${file}.br`);
      return { raw, brotli: (await sidecar.exists()) ? sidecar.size : raw };
    };
    for (const url of new Set(Object.values(modulesByRoute).flat())) sizeByUrl.set(url, await sizeOf(url));
    return Object.entries(modulesByRoute)
      .map(([routeId, urls]) => ({
        routeId,
        files: urls.length,
        rawBytes: urls.reduce((total, url) => total + (sizeByUrl.get(url)?.raw ?? 0), 0),
        brotliBytes: urls.reduce((total, url) => total + (sizeByUrl.get(url)?.brotli ?? 0), 0),
      }))
      .sort((a, b) => b.brotliBytes - a.brotliBytes || RouteJsBudget.#byCodeUnit(a.routeId, b.routeId));
  }

  static async load(filePath: string, source = filePath): Promise<RouteJsBudget | null> {
    const file = Bun.file(filePath);
    if (!(await file.exists())) return null;
    return RouteJsBudget.parse(await file.text(), source);
  }

  //? `report` runs inside `akan verify`, where an overage or a broken file is no code error to fix in the edit loop.
  static async check(sizes: RouteJsSize[], { mode, budgetPath, source, environment }: RouteJsBudgetCheck) {
    const { committed, unreadable } = await RouteJsBudget.#loadFor(mode, budgetPath, source);
    const budget = mode === "update" ? (committed ?? new RouteJsBudget()).tightenedBy(sizes, environment) : committed;
    if (mode === "update" && budget) await Bun.write(budgetPath, budget.stringify());
    const overages = budget?.overages(sizes) ?? [];
    const envNote = committed?.envNote(environment) ?? "";
    if (overages.length && mode !== "report") throw new Error(RouteJsBudget.formatOverages(overages, source, envNote));
    const unbudgeted = budget?.unbudgeted(sizes).length ?? 0;
    if (mode === "update") return `${source} ${unreadable ? `rewritten (${unreadable})` : "updated"}`;
    if (!budget) return unreadable ? `${unreadable}, not checked` : `no ${RouteJsBudget.fileName}`;
    if (overages.length)
      return `${overages.length} route(s) over ${source}${envNote}, reported only: ${overages.map(({ routeId }) => routeId).join(", ")}`;
    return `within ${source}${envNote}${unbudgeted ? `, ${unbudgeted} route(s) without an entry` : ""}`;
  }

  static async #loadFor(mode: RouteJsBudgetCheck["mode"], budgetPath: string, source: string) {
    try {
      return { committed: await RouteJsBudget.load(budgetPath, source), unreadable: null };
    } catch (error) {
      if (mode === "enforce") throw error;
      return { committed: null, unreadable: toError(error).message.replace(/\.$/, "") };
    }
  }

  static parse(text: string, source = RouteJsBudget.fileName): RouteJsBudget {
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      throw new Error(`${source} is not valid JSON.`);
    }
    const record =
      typeof json === "object" && json !== null && !Array.isArray(json) ? (json as Record<string, unknown>) : {};
    const section = record[RouteJsBudget.section];
    const entries = typeof section === "object" && section !== null && !Array.isArray(section) ? section : null;
    if (!entries || !Object.values(entries).every((kb) => Number.isInteger(kb) && (kb as number) > 0))
      throw new Error(`${source}: "${RouteJsBudget.section}" maps each route id to a whole number of KB.`);
    if (record.env !== undefined && typeof record.env !== "string")
      throw new Error(`${source}: "env" names the environment the entries were measured for.`);
    return new RouteJsBudget(new Map(Object.entries(entries as Record<string, number>)), record.env);
  }

  static kbOf(bytes: number) {
    return Math.ceil(bytes / 1024);
  }

  static limitOf(budgetKB: number) {
    const bytes = budgetKB * 1024;
    return bytes + Math.max(Math.ceil(bytes * RouteJsBudget.#relativeSlack), RouteJsBudget.#absoluteSlack);
  }

  static formatTable(sizes: RouteJsSize[]): string[] {
    const shown = sizes.slice(0, RouteJsBudget.tableRows);
    const width = Math.max(...shown.map(({ routeId }) => routeId.length));
    const { formatBytes } = FontPruner;
    return [
      "Route JS, largest first (brotli / raw):",
      ...shown.map(
        ({ routeId, brotliBytes, rawBytes }) =>
          `  ${routeId.padEnd(width)}  ${formatBytes(brotliBytes).padStart(8)}  ${formatBytes(rawBytes).padStart(8)}`,
      ),
      ...(sizes.length > shown.length ? [`  …and ${sizes.length - shown.length} more`] : []),
    ];
  }

  static formatOverages(overages: RouteJsOverage[], source: string, envNote = ""): string {
    const bytes = (value: number) => value.toLocaleString("en-US");
    return [
      `${overages.length} route${overages.length === 1 ? "" : "s"} over the JS budget in ${source}${envNote}:`,
      ...overages.map(
        ({ routeId, brotliBytes, budgetKB, limitBytes }) =>
          `  ${routeId}: ${bytes(brotliBytes)} bytes brotli, over its limit of ${bytes(limitBytes)} (${budgetKB}KB + the larger of 1% and 4KB)`,
      ),
      "Shrink what the route loads. If the growth is intended, raise its entry by hand in the same change.",
    ].join("\n");
  }

  static #byCodeUnit(a: string, b: string) {
    return a < b ? -1 : a > b ? 1 : 0;
  }

  constructor(
    readonly kbByRoute: ReadonlyMap<string, number> = new Map(),
    readonly env?: string,
  ) {}

  overages(sizes: RouteJsSize[]): RouteJsOverage[] {
    return sizes.flatMap(({ routeId, brotliBytes }) => {
      const budgetKB = this.kbByRoute.get(routeId);
      if (budgetKB === undefined) return [];
      const limitBytes = RouteJsBudget.limitOf(budgetKB);
      return brotliBytes > limitBytes ? [{ routeId, brotliBytes, budgetKB, limitBytes }] : [];
    });
  }

  envNote(environment: string) {
    return this.env && this.env !== environment ? ` (recorded for ${this.env}, built for ${environment})` : "";
  }

  unbudgeted(sizes: RouteJsSize[]): string[] {
    return sizes.filter(({ routeId }) => !this.kbByRoute.has(routeId)).map(({ routeId }) => routeId);
  }

  tightenedBy(sizes: RouteJsSize[], env?: string): RouteJsBudget {
    return new RouteJsBudget(
      new Map(
        sizes.map(({ routeId, brotliBytes }) => {
          const measured = RouteJsBudget.kbOf(brotliBytes);
          return [routeId, Math.min(this.kbByRoute.get(routeId) ?? measured, measured)];
        }),
      ),
      env ?? this.env,
    );
  }

  stringify(): string {
    const entries = [...this.kbByRoute].sort(([a], [b]) => RouteJsBudget.#byCodeUnit(a, b));
    return JsonFormatter.stringify(
      { ...(this.env ? { env: this.env } : {}), [RouteJsBudget.section]: Object.fromEntries(entries) },
      RouteJsBudget.fileName,
    );
  }
}
