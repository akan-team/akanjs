import { Database, type SQLQueryBindings } from "bun:sqlite";
import { spyOn } from "bun:test";
import type { SqlDriver } from "../../../test/conformance";
import type { AkanSqlClient, AkanSqlStatement } from "./types";

export interface SentQuery {
  sql: string;
  params: unknown[];
}

/** Each statement a store sends through `driver` while `run` runs, in order, once per execution. */
export const sentQueries = async (driver: SqlDriver, run: () => Promise<unknown>) => {
  const sent: SentQuery[] = [];
  const database = driver.database as unknown as { getConnection: () => AkanSqlClient };
  const connect = database.getConnection.bind(driver.database);
  // One recorder per connection: the store keeps its prepared statements by the connection object it was handed.
  const recorders = new WeakMap<AkanSqlClient, AkanSqlClient>();
  const recorderOf = (client: AkanSqlClient): AkanSqlClient => ({
    execute: (sql, params) => client.execute(sql, params),
    close: () => client.close(),
    prepare: (sql) => {
      const statement = client.prepare(sql);
      const recorded: AkanSqlStatement = {
        run(...params) {
          sent.push({ sql, params });
          return statement.run(...params);
        },
        get<Row = Record<string, unknown>>(...params: unknown[]) {
          sent.push({ sql, params });
          return statement.get<Row>(...params);
        },
        all<Row = Record<string, unknown>>(...params: unknown[]) {
          sent.push({ sql, params });
          return statement.all<Row>(...params);
        },
      };
      return recorded;
    },
  });
  const spy = spyOn(database, "getConnection").mockImplementation(() => {
    const client = connect();
    const recorder = recorders.get(client) ?? recorderOf(client);
    recorders.set(client, recorder);
    return recorder;
  });
  try {
    await run();
  } finally {
    spy.mockRestore();
  }
  return sent;
};

export const sentStatements = async (driver: SqlDriver, run: () => Promise<unknown>) =>
  (await sentQueries(driver, run)).map(({ sql }) => sql);

export const queryPlanOf = async (driver: SqlDriver, { sql, params }: SentQuery) => {
  const connection = driver.database.getConnection();
  if (driver.kind === "postgres")
    return await driver.database.transaction(async () => {
      // A small table is cheaper to read whole; with that ruled out, an index the condition can use is used.
      await driver.database.getConnection().execute("SET LOCAL enable_seqscan = off");
      const rows = await driver.database
        .getConnection()
        .prepare(`EXPLAIN ${sql}`)
        .all(...params);
      return rows.map((row) => String(row["QUERY PLAN"])).join("\n");
    });
  //? On a connection of its own, closed after: bun:sqlite leaves an EXPLAIN open once another statement follows it,
  //? and the adaptor's checkpoint at shutdown then fails with "database table is locked".
  const main = await connection
    .prepare(`SELECT "file" FROM pragma_database_list WHERE "name" = 'main'`)
    .get<{ file: string }>();
  const reader = new Database(main?.file ?? "", { readonly: true });
  try {
    const statement = reader.prepare(`EXPLAIN QUERY PLAN ${sql}`);
    const rows = statement.all(...(params as SQLQueryBindings[])) as { detail: string }[];
    statement.finalize();
    return rows.map(({ detail }) => detail).join("\n");
  } finally {
    reader.close();
  }
};
