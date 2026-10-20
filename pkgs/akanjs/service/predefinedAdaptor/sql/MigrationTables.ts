import type { AkanSqlClient, SqlDialect } from "./types";
import { quoteIdent } from "./values";

export interface MigrationLedgerTable {
  name: string;
  key: readonly string[];
  columns: readonly string[];
}

/** The data-migration ledger, kept beside the rows it describes so each environment records what was applied to it. */
export class MigrationTables {
  static readonly run = "_akan_migration_run";
  static readonly change = "_akan_migration_change";
  static readonly ledger: readonly MigrationLedgerTable[] = [
    {
      name: MigrationTables.run,
      key: ["id"],
      columns: [
        "id",
        "migrationId",
        "kind",
        "status",
        "target",
        "checksum",
        "buildId",
        "params",
        "planHash",
        "summary",
        "actor",
        "checkpoint",
        "startedAt",
        "finishedAt",
        "error",
      ],
    },
    {
      name: MigrationTables.change,
      key: ["runId", "seq"],
      columns: ["runId", "seq", "tableName", "docId", "op", "before", "after"],
    },
  ];

  static schema(dialect: Pick<SqlDialect, "timestampType">) {
    const ts = dialect.timestampType();
    const run = quoteIdent(MigrationTables.run);
    return [
      `CREATE TABLE IF NOT EXISTS ${run} ("id" TEXT PRIMARY KEY NOT NULL, "migrationId" TEXT NOT NULL, "kind" TEXT NOT NULL, "status" TEXT NOT NULL, "target" TEXT, "checksum" TEXT NOT NULL, "buildId" TEXT, "params" TEXT, "planHash" TEXT, "summary" TEXT, "actor" TEXT, "checkpoint" TEXT, "startedAt" ${ts} NOT NULL, "finishedAt" ${ts}, "error" TEXT)`,
      `CREATE INDEX IF NOT EXISTS ${quoteIdent(`${MigrationTables.run}_migrationId`)} ON ${run} ("migrationId", "startedAt")`,
      `CREATE TABLE IF NOT EXISTS ${quoteIdent(MigrationTables.change)} ("runId" TEXT NOT NULL, "seq" INTEGER NOT NULL, "tableName" TEXT NOT NULL, "docId" TEXT NOT NULL, "op" TEXT NOT NULL, "before" TEXT NOT NULL, "after" TEXT NOT NULL, PRIMARY KEY ("runId", "seq"))`,
    ];
  }

  /** Up to `limit` rows after the key of `after`, in key order. */
  static async exportRows(
    client: AkanSqlClient,
    table: MigrationLedgerTable,
    after: Record<string, unknown> | null,
    limit: number,
  ) {
    const keyset = MigrationTables.#after(table, after);
    return await client
      .prepare(
        `SELECT ${table.columns.map(quoteIdent).join(", ")} FROM ${quoteIdent(table.name)} WHERE ${keyset.sql} ORDER BY ${table.key.map(quoteIdent).join(", ")} LIMIT ${Math.trunc(limit)}`,
      )
      .all<Record<string, unknown>>(...keyset.params);
  }

  static async importRows(client: AkanSqlClient, table: MigrationLedgerTable, rows: Record<string, unknown>[]) {
    const columns = table.columns.map(quoteIdent);
    const updates = table.columns
      .filter((column) => !table.key.includes(column))
      .map((column) => `${quoteIdent(column)} = excluded.${quoteIdent(column)}`);
    const statement = client.prepare(
      `INSERT INTO ${quoteIdent(table.name)} (${columns.join(", ")}) VALUES (${columns.map(() => "?").join(", ")}) ON CONFLICT (${table.key.map(quoteIdent).join(", ")}) DO UPDATE SET ${updates.join(", ")}`,
    );
    for (const row of rows) await statement.run(...table.columns.map((column) => row[column] ?? null));
  }

  static #after(table: MigrationLedgerTable, after: Record<string, unknown> | null) {
    if (!after) return { sql: "1 = 1", params: [] as unknown[] };
    const terms = table.key.map((column, idx) => {
      const equal = table.key.slice(0, idx);
      return {
        sql: `(${[...equal.map((prefix) => `${quoteIdent(prefix)} = ?`), `${quoteIdent(column)} > ?`].join(" AND ")})`,
        params: [...equal.map((prefix) => after[prefix]), after[column]],
      };
    });
    return { sql: `(${terms.map((term) => term.sql).join(" OR ")})`, params: terms.flatMap((term) => term.params) };
  }
}
