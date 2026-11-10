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

export type RouteJsBudgetMode = "enforce" | "update" | "raise" | "report" | "off";

export interface RouteJsBudgetWarning {
  file: string;
  message: string;
  fix: string;
}

export interface RouteJsBudgetStatus {
  summary: string;
  warnings?: RouteJsBudgetWarning[];
}

export interface RouteJsBudgetFlags {
  checkBudget?: boolean;
  updateBudget?: boolean;
  raiseBudget?: boolean;
}

interface BudgetTarget {
  app: string;
  source: string;
}

export interface RouteJsBudgetCheck {
  mode: Exclude<RouteJsBudgetMode, "off">;
  app: string;
  budgetPath: string;
  source: string;
  environment: string;
}

export class RouteJsBudget {
  static readonly fileName = "akan.budget.json";
  static readonly section = "routeJsBrotliKB";
  static readonly tableRows = 10;
  //? BundleSizeGate's slack: bundles inline `AKAN_PUBLIC_*`, so a local build measures over 1KB off a `--env main` one.
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

  static modeOf({ checkBudget = false, updateBudget = false, raiseBudget = false }: RouteJsBudgetFlags) {
    if ([checkBudget, updateBudget, raiseBudget].filter(Boolean).length > 1)
      throw new Error("Pass at most one of --check-budget, --update-budget and --raise-budget.");
    return checkBudget ? "enforce" : updateBudget ? "update" : raiseBudget ? "raise" : "report";
  }

  static async load(filePath: string, source = filePath): Promise<RouteJsBudget | null> {
    const file = Bun.file(filePath);
    if (!(await file.exists())) return null;
    return RouteJsBudget.parse(await file.text(), source);
  }

  //? A deploy build and `akan verify`'s edit loop only report: `enforce` (`--check-budget`, run by CI) is the gate.
  static async check(sizes: RouteJsSize[], check: RouteJsBudgetCheck): Promise<RouteJsBudgetStatus> {
    const { mode, app, budgetPath, source, environment } = check;
    const { committed, unreadable } = await RouteJsBudget.#loadFor(mode, budgetPath, source);
    if (mode === "enforce" && !committed)
      throw new Error(`--check-budget found no ${source}: record one with \`akan build ${app} --update-budget\`.`);
    const budget =
      mode === "raise"
        ? new RouteJsBudget().tightenedBy(sizes, environment)
        : mode === "update"
          ? (committed ?? new RouteJsBudget()).tightenedBy(sizes, environment)
          : committed;
    if ((mode === "update" || mode === "raise") && budget) await Bun.write(budgetPath, budget.stringify());
    const overages = budget?.overages(sizes) ?? [];
    const unbudgeted = budget?.unbudgeted(sizes) ?? [];
    const envNote = committed?.envNote(environment) ?? "";
    const target = { app, source };
    const failures = [
      ...(overages.length && mode !== "report" ? [RouteJsBudget.formatOverages(overages, target, envNote)] : []),
      ...(unbudgeted.length && mode === "enforce" ? [RouteJsBudget.formatUnbudgeted(unbudgeted, target)] : []),
    ];
    if (failures.length) throw new Error(failures.join("\n"));
    if (mode === "update" || mode === "raise")
      return { summary: RouteJsBudget.#writtenSummary(check, unreadable, committed, budget) };
    if (unreadable)
      return {
        summary: `${unreadable}, not checked`,
        warnings: [
          {
            file: source,
            message: `${unreadable}; akan build --check-budget fails on it`,
            fix: `correct it, or rewrite it with akan build ${app} --update-budget`,
          },
        ],
      };
    if (!budget) return { summary: `no ${RouteJsBudget.fileName}` };
    const warnings = [
      ...overages.map(({ routeId, brotliBytes, limitBytes }) => ({
        file: source,
        message: `${routeId} loads ${RouteJsBudget.#bytes(brotliBytes)} bytes brotli, over its limit of ${RouteJsBudget.#bytes(limitBytes)}${envNote}; akan build --check-budget fails on it`,
        fix: `shrink what the route loads, or raise its entry with akan build ${app} --raise-budget`,
      })),
      ...unbudgeted.map((routeId) => ({
        file: source,
        message: `${routeId} has no entry; akan build --check-budget fails on it`,
        fix: `record it with akan build ${app} --update-budget`,
      })),
    ];
    const verdict = overages.length
      ? `${overages.length} route(s) over ${source}${envNote}, reported only: ${overages.map(({ routeId }) => routeId).join(", ")}`
      : `within ${source}${envNote}`;
    const unbudgetedNote = unbudgeted.length ? `; ${unbudgeted.length} route(s) without an entry` : "";
    return { summary: `${verdict}${unbudgetedNote}`, ...(warnings.length ? { warnings } : {}) };
  }

  static #writtenSummary(
    { mode, source }: RouteJsBudgetCheck,
    unreadable: string | null,
    committed: RouteJsBudget | null,
    written: RouteJsBudget | null,
  ) {
    if (unreadable) return `${source} rewritten (${unreadable})`;
    if (mode === "update") return `${source} updated`;
    const raised = [...(written?.kbByRoute ?? [])].filter(
      ([routeId, kb]) => kb > (committed?.kbByRoute.get(routeId) ?? kb),
    );
    return `${source} re-recorded at each route's measured size${raised.length ? `, raised: ${raised.map(([routeId]) => routeId).join(", ")}` : ""}`;
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

  static formatOverages(overages: RouteJsOverage[], target: BudgetTarget, envNote = ""): string {
    const bytes = RouteJsBudget.#bytes;
    const { source } = target;
    return [
      `${overages.length} route${overages.length === 1 ? "" : "s"} over the JS budget in ${source}${envNote}:`,
      ...overages.map(
        ({ routeId, brotliBytes, budgetKB, limitBytes }) =>
          `  ${routeId}: ${bytes(brotliBytes)} bytes brotli, over its limit of ${bytes(limitBytes)} (${budgetKB}KB + the larger of 1% and 4KB)`,
      ),
      RouteJsBudget.#overageFix(target),
    ].join("\n");
  }

  static formatUnbudgeted(routeIds: string[], { app, source }: BudgetTarget): string {
    return [
      `${routeIds.length} route${routeIds.length === 1 ? "" : "s"} with no entry in ${source}, which --check-budget checks every route against:`,
      ...routeIds.map((routeId) => `  ${routeId}`),
      `Record ${routeIds.length === 1 ? "it" : "them"} in the same change: \`akan build ${app} --update-budget\` adds each new route at its measured size.`,
    ].join("\n");
  }

  static #overageFix({ app, source }: BudgetTarget) {
    return `Shrink what the route loads. If the growth is intended, record it in the same change: \`akan build ${app} --raise-budget\` re-records every route at its measured size, or raise the route's entry under "${RouteJsBudget.section}" in ${source} by hand.`;
  }

  static #bytes(value: number) {
    return value.toLocaleString("en-US");
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
