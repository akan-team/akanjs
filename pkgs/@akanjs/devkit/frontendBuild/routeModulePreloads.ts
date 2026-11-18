import type { ClientManifest } from "akanjs/server";
import { ModulePreloadPlan, type ModulePreloadTable } from "akanjs/server/artifact/modulePreloadPlan";
import { toClientReferencePath } from "../transforms/rscUseClientTransform";
import type { AskedExports } from "./clientBuildTypes";

export type RuntimeChunks = Pick<ModulePreloadTable, "runtime" | "vendors">;

export interface RouteModulePreloadsInput {
  runtimeChunks: RuntimeChunks;
  entriesByRoute: Map<string, string[]>;
  /** The exports each route asks of its entries; an entry left out, or null, is preloaded with all of them. */
  askedByRoute?: ReadonlyMap<string, AskedExports>;
  clientManifest: ClientManifest;
  externalsByChunkUrl: Record<string, string[]>;
  workspaceRoot: string;
}

export class RouteModulePreloads {
  readonly table: ModulePreloadTable;
  #input: RouteModulePreloadsInput;
  #chunksByReferenceId = new Map<string, Map<string, string[]>>();

  constructor(input: RouteModulePreloadsInput) {
    this.#input = input;
    for (const [key, row] of Object.entries(input.clientManifest)) {
      const hash = key.lastIndexOf("#");
      this.#chunksByReferenceId.getOrInsert(key.slice(0, hash), new Map()).set(key.slice(hash + 1), row.chunks);
    }
    this.table = {
      ...input.runtimeChunks,
      chunkVendors: Object.fromEntries(
        Object.entries(input.externalsByChunkUrl)
          .map(([url, specifiers]): [string, string[]] => [
            url,
            specifiers.filter((specifier) => specifier in input.runtimeChunks.vendors),
          ])
          .filter(([, specifiers]) => specifiers.length > 0),
      ),
    };
  }

  modulesByRoute(): Record<string, string[]> {
    const plan = new ModulePreloadPlan(this.table);
    return Object.fromEntries(
      [...this.#input.entriesByRoute].map(([routeId, entries]) => {
        const asked = this.#input.askedByRoute?.get(routeId);
        return [
          routeId,
          plan.urlsOf([...new Set(entries.flatMap((entry) => this.#chunksOf(entry, asked?.get(entry))))]),
        ];
      }),
    );
  }

  #chunksOf(entry: string, names?: readonly string[] | null): string[] {
    const chunksByName = this.#chunksByReferenceId.get(toClientReferencePath(entry, this.#input.workspaceRoot));
    if (!chunksByName) return [];
    const rows = names ? names.map((name) => chunksByName.get(name) ?? []) : [...chunksByName.values()];
    return rows.flat();
  }
}
