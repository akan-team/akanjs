import { mkdir, readdir } from "node:fs/promises";
import path from "node:path";
import { Logger } from "akanjs/common";
import { type MigrationLedgerTable, MigrationTables } from "./sql/MigrationTables";
import type { DatabaseAdaptor, TransferRow } from "./sql/types";

export interface TransferReport {
  table: string;
  rows: number;
}

/**
 * Model tables to one NDJSON file each and back, rows as stored. `_akan_meta`, the search mirror, the cache and the
 * queue stay behind: the target writes its own meta and rebuilds the mirror; sessions and pending jobs do not move.
 * The migration ledger moves with the rows, or the target would run again the scripts its data already went through.
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
    for (const table of MigrationTables.ledger) {
      const report = await this.#exportLedger(dir, table);
      if (report) reports.push(report);
    }
    return reports;
  }

  async #exportLedger(dir: string, table: MigrationLedgerTable): Promise<TransferReport | null> {
    let writer: Bun.FileSink | null = null;
    let rows = 0;
    let after: Record<string, unknown> | null = null;
    for (;;) {
      const chunk = await MigrationTables.exportRows(
        this.#database.getConnection(),
        table,
        after,
        DocumentTransfer.#chunk,
      );
      if (chunk.length) writer ??= Bun.file(path.join(dir, `${table.name}.ndjson`)).writer();
      for (const row of chunk) writer?.write(`${JSON.stringify(row)}\n`);
      rows += chunk.length;
      const last = chunk.at(-1);
      if (!last || chunk.length < DocumentTransfer.#chunk) break;
      after = last;
    }
    await writer?.end();
    return writer ? { table: table.name, rows } : null;
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
    for (const table of MigrationTables.ledger) {
      const file = `${table.name}.ndjson`;
      if (files.delete(file)) reports.push(await this.#importLedger(path.join(dir, file), table));
    }
    for (const file of files) this.#logger.warn(`${file} matches no model of this app; skipped`);
    return reports;
  }

  async #importLedger(file: string, table: MigrationLedgerTable): Promise<TransferReport> {
    const write = async (chunk: Record<string, unknown>[]) =>
      await this.#database.transaction(
        async () => await MigrationTables.importRows(this.#database.getConnection(), table, chunk),
      );
    let rows = 0;
    let chunk: Record<string, unknown>[] = [];
    for await (const line of DocumentTransfer.#lines(file)) {
      chunk.push(JSON.parse(line) as Record<string, unknown>);
      if (chunk.length < DocumentTransfer.#chunk) continue;
      await write(chunk);
      rows += chunk.length;
      chunk = [];
    }
    if (chunk.length) await write(chunk);
    return { table: table.name, rows: rows + chunk.length };
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
