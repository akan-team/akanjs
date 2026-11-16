import { Database } from "bun:sqlite";
import type { Sql } from "postgres";
import type { StatementPlanner } from "./statementProbe";
import { quoteIdent, toPostgresSql } from "./values";

const rowsUpToSql = (table: string, limit: number) =>
  `SELECT count(*) AS "n" FROM (SELECT 1 FROM ${quoteIdent(table)} LIMIT ${Math.max(1, Math.trunc(limit))}) AS "rows"`;

//? On a read-only connection of its own: bun:sqlite leaves an EXPLAIN open on the connection that ran it, and a
//? transaction or the checkpoint at shutdown on the main one would then fail with "database table is locked".
export class SqlitePlans implements StatementPlanner {
  readonly #file: string;
  readonly #models: ReadonlyMap<string, unknown>;
  #db: Database | null = null;

  constructor(file: string, models: ReadonlyMap<string, unknown>) {
    this.#file = file;
    this.#models = models;
  }

  async explain(sql: string): Promise<string[]> {
    return this.#all<{ detail: string }>(`EXPLAIN QUERY PLAN ${sql}`).map(({ detail }) => detail);
  }

  async rowsUpTo(table: string, limit: number): Promise<number> {
    return Number(this.#all<{ n: number }>(rowsUpToSql(table, limit)).at(0)?.n ?? 0);
  }

  isModelTable(table: string) {
    return this.#models.has(table);
  }

  close() {
    this.#db?.close();
    this.#db = null;
  }

  #all<Row>(sql: string): Row[] {
    this.#db ??= new Database(this.#file, { readonly: true });
    const statement = this.#db.prepare(sql);
    try {
      return statement.all(...new Array(statement.paramsCount).fill(null)) as Row[];
    } finally {
      statement.finalize();
    }
  }
}

export class PostgresPlans implements StatementPlanner {
  readonly #sql: () => Sql;
  readonly #models: ReadonlyMap<string, unknown>;

  constructor(sql: () => Sql, models: ReadonlyMap<string, unknown>) {
    this.#sql = sql;
    this.#models = models;
  }

  async explain(sql: string, params: readonly unknown[]): Promise<string[]> {
    const { sql: text, params: values } = toPostgresSql(sql, [...params]);
    const bindings = values as NonNullable<Parameters<Sql["unsafe"]>[1]>;
    const rows = await this.#sql().unsafe(`EXPLAIN (COSTS OFF) ${text}`, bindings, { prepare: false });
    return rows.map((row) => String(row["QUERY PLAN"]));
  }

  async rowsUpTo(table: string, limit: number): Promise<number> {
    const rows = await this.#sql().unsafe(rowsUpToSql(table, limit), [], { prepare: false });
    return Number(rows.at(0)?.n ?? 0);
  }

  isModelTable(table: string) {
    return this.#models.has(table);
  }
}
