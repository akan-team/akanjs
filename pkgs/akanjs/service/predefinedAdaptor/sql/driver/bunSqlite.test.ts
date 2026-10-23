import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { BunSqliteClient, type SqliteWriteTurn } from "./bunSqlite";

class HeldTurn {
  #release = () => {};
  #done: Promise<void> | null = new Promise<void>((resolve) => {
    this.#release = resolve;
  });
  readonly turn: SqliteWriteTurn = () => this.#done;
  release() {
    this.#done = null;
    this.#release();
  }
}

const settles = async (pending: Promise<unknown>) =>
  await Promise.race([pending.then(() => true), Bun.sleep(10).then(() => false)]);

const openClient = (turn: SqliteWriteTurn) => {
  const db = new Database(":memory:", { strict: true });
  db.run(`CREATE TABLE "person" ("id" INTEGER PRIMARY KEY, "name" TEXT NOT NULL)`);
  db.run(`INSERT INTO "person" ("name") VALUES ('Kenny')`);
  return new BunSqliteClient(db, turn);
};

describe("BunSqliteClient write turn", () => {
  test("lets a statement that only reads rows skip a held turn, however it is spelled", async () => {
    const held = new HeldTurn();
    const client = openClient(held.turn);
    for (const sql of [
      `SELECT "name" FROM "person"`,
      `/* list */ SELECT "name" FROM "person"`,
      `WITH "named" AS (SELECT "name" FROM "person") SELECT * FROM "named"`,
      "VALUES (1)",
      `PRAGMA table_info("person")`,
    ])
      expect(await settles(client.prepare(sql).all())).toBe(true);
    held.release();
  });

  test("holds every statement that writes, or changes the transaction or the connection, until the turn is free", async () => {
    let held = new HeldTurn();
    const client = openClient(() => held.turn());
    for (const [sql, read] of [
      [`INSERT INTO "person" ("name") VALUES ('Lee') RETURNING "id"`, "get"],
      [`WITH "old" AS (SELECT "id" FROM "person") UPDATE "person" SET "name" = 'Park' WHERE "id" IN "old"`, "run"],
      ["BEGIN", "run"],
      ["SAVEPOINT inner_write", "run"],
      ["RELEASE inner_write", "run"],
      ["/* done */ COMMIT", "run"],
      ["ATTACH ':memory:' AS other", "run"],
      ["DETACH other", "run"],
      ["PRAGMA foreign_keys = ON", "run"],
    ] as const) {
      held = new HeldTurn();
      const statement = client.prepare(sql);
      const pending = read === "get" ? statement.get() : statement.run();
      expect(await settles(pending)).toBe(false);
      held.release();
      expect(await settles(pending)).toBe(true);
    }
  });
});
