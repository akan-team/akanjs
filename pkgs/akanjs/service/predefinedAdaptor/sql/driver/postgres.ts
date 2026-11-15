import type { MaybeRow, PendingQuery, Sql, TransactionSql } from "postgres";

/** `unsafe` takes its own parameter union; everything reaching here was already SQL-encoded upstream. */
const bindings = (params: unknown[] | Record<string, unknown>) => {
  const values = Array.isArray(params) ? params : Object.values(params);
  return values as NonNullable<Parameters<Sql["unsafe"]>[1]>;
};

import { StatementFingerprint, type StatementShape } from "../statementFingerprint";
import { type SentStatement, type StatementPlanner, StatementProbe } from "../statementProbe";
import type { AkanSqlClient, AkanSqlStatement } from "../types";
import { toPostgresSql } from "../values";

// Unprepared, a parameterized `unsafe` costs two round trips; the URL's `?prepare=false` (PgBouncer) still wins.
const prepared = { prepare: true } as const;

//? postgres.js sets a query's `state` when a pooled connection takes it, so the time before that is the pool wait.
const timed = async <T extends readonly MaybeRow[]>(
  statement: SentStatement,
  params: readonly unknown[],
  query: PendingQuery<T>,
) => {
  const sentAt = performance.now();
  let takenAt = sentAt;
  let state: unknown = null;
  Object.defineProperty(query, "state", {
    configurable: true,
    enumerable: true,
    get: () => state,
    set: (backend: unknown) => {
      state = backend;
      takenAt = performance.now();
    },
  });
  let rows = 0;
  try {
    const result = await query;
    rows = result.count ?? result.length;
    return result;
  } finally {
    StatementProbe.sent(statement, params, performance.now() - takenAt, takenAt - sentAt, rows);
  }
};

class PostgresStatement implements AkanSqlStatement, SentStatement {
  readonly shape: StatementShape;
  constructor(
    private readonly client: Sql | TransactionSql,
    readonly sql: string,
    readonly planner: StatementPlanner | null = null,
  ) {
    this.shape = StatementFingerprint.of(sql);
  }
  async run(...params: unknown[]) {
    const { sql, params: positionalParams } = toPostgresSql(this.sql, params);
    return await timed(this, params, this.client.unsafe(sql, bindings(positionalParams), prepared));
  }
  async get<Row = Record<string, unknown>>(...params: unknown[]): Promise<Row | null> {
    const rows = await this.all<Row>(...params);
    return rows[0] ?? null;
  }
  async all<Row = Record<string, unknown>>(...params: unknown[]): Promise<Row[]> {
    const { sql, params: positionalParams } = toPostgresSql(this.sql, params);
    return (await timed(this, params, this.client.unsafe(sql, bindings(positionalParams), prepared))) as Row[];
  }
}

export class PostgresAkanClient implements AkanSqlClient {
  constructor(
    readonly client: Sql | TransactionSql,
    readonly planner: StatementPlanner | null = null,
  ) {}
  // Without parameters the text goes as written: DDL may hold a `?` inside a literal, which renumbering would break.
  async execute(sql: string, params: unknown[] | Record<string, unknown> = []) {
    const positional = Array.isArray(params) ? params : [params];
    const statement = StatementProbe.fixed(sql);
    if (!positional.length) return await timed(statement, positional, this.client.unsafe(sql, [], prepared));
    const { sql: text, params: values } = toPostgresSql(sql, positional);
    return await timed(statement, positional, this.client.unsafe(text, bindings(values), prepared));
  }
  prepare(sql: string): AkanSqlStatement {
    return new PostgresStatement(this.client, sql, this.planner);
  }
  async close() {
    if ("end" in this.client) await this.client.end();
  }
}
