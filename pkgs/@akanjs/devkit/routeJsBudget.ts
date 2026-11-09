import path from "node:path";
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
}

//* Each entry is the brotli KB of JS a route can load before it hydrates. `--update-budget` adds a new route and
//* lowers an entry its route now fits under; only a hand edit raises one.
export class RouteJsBudget {
  static readonly fileName = "akan.budget.json";
  static readonly section = "routeJsBrotliKB";
  static readonly tableRows = 10;

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
      .sort((a, b) => b.brotliBytes - a.brotliBytes || a.routeId.localeCompare(b.routeId));
  }

  static async load(filePath: string): Promise<RouteJsBudget | null> {
    const file = Bun.file(filePath);
    if (!(await file.exists())) return null;
    return RouteJsBudget.parse(await file.text(), filePath);
  }

  static parse(text: string, source = RouteJsBudget.fileName): RouteJsBudget {
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      throw new Error(`${source} is not valid JSON.`);
    }
    const section = (json as Record<string, unknown> | null)?.[RouteJsBudget.section];
    const entries = typeof section === "object" && section !== null && !Array.isArray(section) ? section : null;
    if (!entries || !Object.values(entries).every((kb) => Number.isInteger(kb) && (kb as number) > 0))
      throw new Error(`${source}: "${RouteJsBudget.section}" maps each route id to a whole number of KB.`);
    return new RouteJsBudget(new Map(Object.entries(entries as Record<string, number>)));
  }

  static kbOf(bytes: number) {
    return Math.ceil(bytes / 1024);
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

  static formatOverages(overages: RouteJsOverage[], source: string): string {
    return [
      `${overages.length} route${overages.length === 1 ? "" : "s"} over the JS budget in ${source}:`,
      ...overages.map(
        ({ routeId, brotliBytes, budgetKB }) =>
          `  ${routeId}: ${FontPruner.formatBytes(brotliBytes)} brotli, over its ${budgetKB}KB`,
      ),
      "Shrink what the route loads. If the growth is intended, raise its entry by hand in the same change.",
    ].join("\n");
  }

  constructor(readonly kbByRoute: ReadonlyMap<string, number> = new Map()) {}

  overages(sizes: RouteJsSize[]): RouteJsOverage[] {
    return sizes.flatMap(({ routeId, brotliBytes }) => {
      const budgetKB = this.kbByRoute.get(routeId);
      return budgetKB !== undefined && brotliBytes > budgetKB * 1024 ? [{ routeId, brotliBytes, budgetKB }] : [];
    });
  }

  unbudgeted(sizes: RouteJsSize[]): string[] {
    return sizes.filter(({ routeId }) => !this.kbByRoute.has(routeId)).map(({ routeId }) => routeId);
  }

  tightenedBy(sizes: RouteJsSize[]): RouteJsBudget {
    return new RouteJsBudget(
      new Map(
        sizes.map(({ routeId, brotliBytes }) => {
          const measured = RouteJsBudget.kbOf(brotliBytes);
          return [routeId, Math.min(this.kbByRoute.get(routeId) ?? measured, measured)];
        }),
      ),
    );
  }

  stringify(): string {
    const entries = [...this.kbByRoute].sort(([a], [b]) => a.localeCompare(b));
    return JsonFormatter.stringify({ [RouteJsBudget.section]: Object.fromEntries(entries) }, RouteJsBudget.fileName);
  }
}
