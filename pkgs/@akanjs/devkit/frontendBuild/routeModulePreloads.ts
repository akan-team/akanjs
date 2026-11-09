import type { ClientManifest } from "akanjs/server";
import { ModulePreloadPlan, type ModulePreloadTable } from "akanjs/server/artifact/modulePreloadPlan";
import { toClientReferencePath } from "../transforms/rscUseClientTransform";

export type RuntimeChunks = Pick<ModulePreloadTable, "runtime" | "vendors">;

export interface RouteModulePreloadsInput {
  runtimeChunks: RuntimeChunks;
  entriesByRoute: Map<string, string[]>;
  clientManifest: ClientManifest;
  externalsByChunkUrl: Record<string, string[]>;
  workspaceRoot: string;
}

export class RouteModulePreloads {
  readonly table: ModulePreloadTable;
  #input: RouteModulePreloadsInput;
  #chunksByReferenceId = new Map<string, Set<string>>();

  constructor(input: RouteModulePreloadsInput) {
    this.#input = input;
    for (const [key, row] of Object.entries(input.clientManifest)) {
      const chunks = this.#chunksByReferenceId.getOrInsert(key.slice(0, key.lastIndexOf("#")), new Set());
      for (const url of row.chunks) chunks.add(url);
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

  //* What a route can load, whether or not a render reaches it; a page preloads only what its flight names.
  modulesByRoute(): Record<string, string[]> {
    const plan = new ModulePreloadPlan(this.table);
    return Object.fromEntries(
      [...this.#input.entriesByRoute].map(([routeId, entries]) => [
        routeId,
        plan.urlsOf(
          entries.flatMap((entry) => [
            ...(this.#chunksByReferenceId.get(toClientReferencePath(entry, this.#input.workspaceRoot)) ?? []),
          ]),
        ),
      ]),
    );
  }
}
