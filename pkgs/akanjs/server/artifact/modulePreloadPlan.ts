import type { ClientManifest } from "./ipcTypes";

export interface ModulePreloadTable {
  /** The rsc client and the client references every page renders, each with the chunks it imports statically. */
  runtime: string[];
  /** Each importmap specifier's entry and the chunks it imports statically. */
  vendors: Record<string, string[]>;
  /** The importmap specifiers a browser chunk imports statically, for each chunk that imports any. */
  chunkVendors: Record<string, string[]>;
}

export class ModulePreloadPlan {
  readonly #table: ModulePreloadTable;
  readonly #chunkUrls: ReadonlySet<string>;

  constructor(table: ModulePreloadTable, clientManifest: ClientManifest = {}) {
    this.#table = table;
    this.#chunkUrls = new Set(Object.values(clientManifest).flatMap((row) => row.chunks));
  }

  knows(url: string): boolean {
    return this.#chunkUrls.has(url);
  }

  urlsOf(chunkUrls: Iterable<string>): string[] {
    const chunks = [...chunkUrls];
    const vendorUrls = chunks.flatMap((url) =>
      (this.#table.chunkVendors[url] ?? []).flatMap((specifier) => this.#table.vendors[specifier] ?? []),
    );
    return [...new Set([...this.#table.runtime, ...vendorUrls, ...chunks])];
  }
}
