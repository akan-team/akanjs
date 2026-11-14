import { spyOn } from "bun:test";
import type { SqlDriver } from "../../../test/conformance";
import type { AkanSqlClient, AkanSqlStatement } from "./types";

/** The SQL text of each statement a store sends through `driver` while `run` runs, in order, once per execution. */
export const sentStatements = async (driver: SqlDriver, run: () => Promise<unknown>) => {
  const sent: string[] = [];
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
          sent.push(sql);
          return statement.run(...params);
        },
        get<Row = Record<string, unknown>>(...params: unknown[]) {
          sent.push(sql);
          return statement.get<Row>(...params);
        },
        all<Row = Record<string, unknown>>(...params: unknown[]) {
          sent.push(sql);
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
