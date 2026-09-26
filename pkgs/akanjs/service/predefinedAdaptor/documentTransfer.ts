import { mkdir, readdir } from "node:fs/promises";
import path from "node:path";
import { Logger } from "akanjs/common";
import type { DatabaseAdaptor, TransferRow } from "./sql/types";

export interface TransferReport {
  table: string;
  rows: number;
}

/**
 * Copies an app's model tables to one NDJSON file each and back, every row as it is stored — how a single-mode app's
 * data moves onto cluster. `_akan_meta` and the search mirror stay behind: the target's boot writes its own meta, and
 * the mirror is rebuilt from the imported rows. The cache and the queue are not model tables, so refresh sessions and
 * pending jobs do not move.
 */
export class DocumentTransfer {
  static readonly #chunk = 1000;
  readonly #database: DatabaseAdaptor;
  readonly #logger = new Logger("DocumentTransfer");

  constructor(database: DatabaseAdaptor) {
    this.#database = database;
  }

  async exportTo(dir: string): Promise<TransferReport[]> {
    await mkdir(dir, { recursive: true });
    const reports: TransferReport[] = [];
    for (const store of this.#stores()) {
      const writer = Bun.file(path.join(dir, `${store.table}.ndjson`)).writer();
      let rows = 0;
      let after = "";
      for (;;) {
        const chunk = await store.exportRows(after, DocumentTransfer.#chunk);
        for (const row of chunk) writer.write(`${JSON.stringify(row)}\n`);
        rows += chunk.length;
        const last = chunk.at(-1);
        if (!last || chunk.length < DocumentTransfer.#chunk) break;
        after = last.id;
      }
      await writer.end();
      reports.push({ table: store.table, rows });
    }
    return reports;
  }

  async importFrom(dir: string): Promise<TransferReport[]> {
    const files = new Set((await readdir(dir)).filter((file) => file.endsWith(".ndjson")));
    const search = this.#database.getSearchIndex();
    const reports: TransferReport[] = [];
    for (const store of this.#stores()) {
      const file = `${store.table}.ndjson`;
      if (!files.delete(file)) continue;
      // Through the triggers the mirror would be rewritten once per row; suspended, it is rebuilt once at the end.
      await search?.suspend(store.database);
      let rows = 0;
      let chunk: TransferRow[] = [];
      for await (const line of DocumentTransfer.#lines(path.join(dir, file))) {
        chunk.push(JSON.parse(line) as TransferRow);
        if (chunk.length < DocumentTransfer.#chunk) continue;
        await store.importRows(chunk);
        rows += chunk.length;
        chunk = [];
      }
      if (chunk.length) await store.importRows(chunk);
      rows += chunk.length;
      if (search && !(await search.resume(store.constant, store.database)))
        this.#logger.warn(`Another process holds the search rebuild of ${store.table}; it catches up once that ends`);
      reports.push({ table: store.table, rows });
    }
    for (const file of files) this.#logger.warn(`${file} matches no model of this app; skipped`);
    return reports;
  }

  #stores() {
    const stores = this.#database.stores?.();
    if (!stores) throw new Error("This database adaptor keeps no model stores to transfer.");
    return stores;
  }

  static async *#lines(file: string) {
    let buffered = "";
    for await (const chunk of Bun.file(file).stream().pipeThrough(new TextDecoderStream())) {
      buffered += chunk;
      const lines = buffered.split("\n");
      buffered = lines.pop() ?? "";
      for (const line of lines) if (line.trim()) yield line;
    }
    if (buffered.trim()) yield buffered;
  }
}
