import type { Sql, TransactionSql } from "postgres";

/** `unsafe` takes its own parameter union; everything reaching here was already SQL-encoded upstream. */
const bindings = (params: unknown[] | Record<string, unknown>) => {
  const values = Array.isArray(params) ? params : Object.values(params);
  return values as NonNullable<Parameters<Sql["unsafe"]>[1]>;
};

import type { AkanSqlClient, AkanSqlStatement } from "../types";
import { toPostgresSql } from "../values";

// `unsafe` skips statement preparation unless asked, and an unprepared query with parameters costs two round trips:
// postgres.js describes it first to learn the parameter types. Asking here still yields to the connection's own
// `prepare` (`?prepare=false` in the URL), which a PgBouncer in transaction mode needs.
const prepared = { prepare: true } as const;

export class PostgresStatement implements AkanSqlStatement {
  constructor(
    private readonly client: Sql | TransactionSql,
    private readonly sql: string,
  ) {}
  async run(...params: unknown[]) {
    const { sql, params: positionalParams } = toPostgresSql(this.sql, params);
    return await this.client.unsafe(sql, bindings(positionalParams), prepared);
  }
  async get<Row = Record<string, unknown>>(...params: unknown[]): Promise<Row | null> {
    const rows = await this.all<Row>(...params);
    return rows[0] ?? null;
  }
  async all<Row = Record<string, unknown>>(...params: unknown[]): Promise<Row[]> {
    const { sql, params: positionalParams } = toPostgresSql(this.sql, params);
    return (await this.client.unsafe(sql, bindings(positionalParams), prepared)) as Row[];
  }
}

export class PostgresAkanClient implements AkanSqlClient {
  constructor(readonly client: Sql | TransactionSql) {}
  // Without parameters the text goes as written: DDL may hold a `?` inside a literal, which renumbering would break.
  async execute(sql: string, params: unknown[] | Record<string, unknown> = []) {
    const positional = Array.isArray(params) ? params : [params];
    if (!positional.length) return await this.client.unsafe(sql, [], prepared);
    const { sql: text, params: values } = toPostgresSql(sql, positional);
    return await this.client.unsafe(text, bindings(values), prepared);
  }
  prepare(sql: string): AkanSqlStatement {
    return new PostgresStatement(this.client, sql);
  }
  async close() {
    if ("end" in this.client) await this.client.end();
  }
}
