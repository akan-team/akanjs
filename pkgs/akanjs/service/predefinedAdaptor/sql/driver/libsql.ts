import type { Client as LibsqlClient, Transaction as LibsqlTransaction } from "@libsql/client";
import type { AkanSqlClient, AkanSqlStatement } from "../types";
import { toLibsqlArgs } from "../values";
import { isReadOnlyStatement, type SqliteWriteTurn } from "./bunSqlite";

const openTurn: SqliteWriteTurn = () => null;

export class LibsqlStatement implements AkanSqlStatement {
  readonly #writes: boolean;
  constructor(
    private readonly client: LibsqlClient | LibsqlTransaction,
    private readonly sql: string,
    private readonly writeTurn: SqliteWriteTurn = openTurn,
  ) {
    this.#writes = !isReadOnlyStatement(sql);
  }
  async #turn() {
    if (!this.#writes) return;
    for (let turn = this.writeTurn(); turn; turn = this.writeTurn()) await turn;
  }
  async run(...params: unknown[]) {
    await this.#turn();
    return await this.client.execute({ sql: this.sql, args: toLibsqlArgs(params) });
  }
  async get<Row = Record<string, unknown>>(...params: unknown[]): Promise<Row | null> {
    await this.#turn();
    const result = await this.client.execute({ sql: this.sql, args: toLibsqlArgs(params) });
    return (result.rows[0] as Row | undefined) ?? null;
  }
  async all<Row = Record<string, unknown>>(...params: unknown[]): Promise<Row[]> {
    await this.#turn();
    const result = await this.client.execute({ sql: this.sql, args: toLibsqlArgs(params) });
    return result.rows as Row[];
  }
}

export class LibsqlAkanClient implements AkanSqlClient {
  constructor(
    readonly client: LibsqlClient | LibsqlTransaction,
    private readonly writeTurn: SqliteWriteTurn = openTurn,
  ) {}
  async execute(sql: string, params: unknown[] | Record<string, unknown> = []) {
    return await this.prepare(sql).run(...(Array.isArray(params) ? params : [params]));
  }
  prepare(sql: string): AkanSqlStatement {
    return new LibsqlStatement(this.client, sql, this.writeTurn);
  }
  async close() {
    this.client.close();
  }
}
