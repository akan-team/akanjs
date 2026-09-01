import { Database, type SQLQueryBindings } from "bun:sqlite";
import { beforeAll, describe, expect, test } from "bun:test";
import type { AkanSqlClient, AkanSqlStatement } from "./database.adaptor";
import { InsightQuery } from "./insightQuery";

class TestClient implements AkanSqlClient {
  constructor(readonly db: Database) {}
  async execute(sql: string, params: unknown[] | Record<string, unknown> = []) {
    const values = Array.isArray(params) ? params : Object.values(params);
    return this.db.query(sql).run(...(values as SQLQueryBindings[]));
  }
  prepare(sql: string): AkanSqlStatement {
    const statement = this.db.query(sql);
    return {
      run: async (...params: unknown[]) => statement.run(...(params as SQLQueryBindings[])),
      get: async <Row = Record<string, unknown>>(...params: unknown[]) =>
        (statement.get(...(params as SQLQueryBindings[])) as Row | null) ?? null,
      all: async <Row = Record<string, unknown>>(...params: unknown[]) =>
        statement.all(...(params as SQLQueryBindings[])) as Row[],
    };
  }
  async close() {
    this.db.close();
  }
}

let db: Database;
let insight: InsightQuery;

beforeAll(() => {
  db = new Database(":memory:", { strict: true, create: true });
  db.run(
    `CREATE TABLE "insightMember" ("id" TEXT PRIMARY KEY NOT NULL, "createdAt" INTEGER NOT NULL,
      "updatedAt" INTEGER NOT NULL, "removedAt" INTEGER, "_doc" TEXT NOT NULL)`,
  );
  const rows: [string, number, string][] = [
    ["a", 1, JSON.stringify({ nickname: "Ada", password: "hunter2" })],
    ["b", 2, JSON.stringify({ nickname: "Ben", password: "letmein" })],
    ["c", 3, JSON.stringify({ nickname: "Cy", password: "correcthorse" })],
  ];
  for (const [id, at, doc] of rows)
    db.query(`INSERT INTO "insightMember" VALUES (?, ?, ?, NULL, ?)`).run(id, at, at, doc);
  insight = new InsightQuery(new TestClient(db));
});

describe("InsightQuery reads", () => {
  test("answers the shape questions an insight is made of", async () => {
    const { rows, columns, truncated } = await insight.run(
      `SELECT COUNT(*) AS total, MIN("createdAt") AS first FROM "insightMember"`,
    );
    expect(rows).toEqual([{ total: 3, first: 1 }]);
    expect(columns).toEqual(["total", "first"]);
    expect(truncated).toBe(false);
  });

  test("keeps base columns of a bare select and drops the document column", async () => {
    // `SELECT *` never names `_doc`, so the statement check cannot see it — the row filter is what does.
    const { rows, columns } = await insight.run(`SELECT * FROM "insightMember" ORDER BY "id"`);
    expect(columns).toEqual(["id", "createdAt", "updatedAt", "removedAt"]);
    expect(rows[0]).toEqual({ id: "a", createdAt: 1, updatedAt: 1, removedAt: null });
  });

  test("caps the rows and says so, whatever the caller asked for", async () => {
    const capped = await insight.run(`SELECT "id" FROM "insightMember" ORDER BY "id"`, { limit: 2 });
    expect(capped.rows).toHaveLength(2);
    expect(capped.truncated).toBe(true);
    const asked = await insight.run(`SELECT "id" FROM "insightMember"`, { limit: 10_000 });
    expect(asked.rows).toHaveLength(3);
    expect(InsightQuery.maxRows).toBe(1000);
  });

  test("accepts a WITH statement and a trailing semicolon", async () => {
    const { rows } = await insight.run(
      `WITH recent AS (SELECT "id" FROM "insightMember" WHERE "createdAt" > 1) SELECT COUNT(*) AS n FROM recent;`,
    );
    expect(rows).toEqual([{ n: 2 }]);
  });
});

describe("InsightQuery refusals", () => {
  test("refuses anything that is not a read, before it reaches the engine", async () => {
    await expect(insight.run(`DELETE FROM "insightMember"`)).rejects.toThrow("it starts with SELECT or WITH");
    await expect(insight.run(`PRAGMA table_list`)).rejects.toThrow("it starts with SELECT or WITH");
    expect(db.query(`SELECT COUNT(*) AS n FROM "insightMember"`).get()).toEqual({ n: 3 });
  });

  test("refuses a second statement rather than running the first", async () => {
    await expect(insight.run(`SELECT 1; DROP TABLE "insightMember"`)).rejects.toThrow("one statement");
    // Hidden behind a comment and inside a string it is still one `;` too many.
    await expect(insight.run(`SELECT 1 -- ok\n; DROP TABLE "insightMember"`)).rejects.toThrow("one statement");
    expect(db.query(`SELECT COUNT(*) AS n FROM "insightMember"`).get()).toEqual({ n: 3 });
  });

  test("does not mistake a semicolon inside a literal for a second statement", async () => {
    const { rows } = await insight.run(`SELECT 'a;b' AS label`);
    expect(rows).toEqual([{ label: "a;b" }]);
  });

  test("refuses to name the document column, however it is reached", async () => {
    await expect(insight.run(`SELECT "_doc" FROM "insightMember"`)).rejects.toThrow("cannot read `_doc`");
    await expect(insight.run(`SELECT json_extract(_doc, '$.password') AS leaked FROM "insightMember"`)).rejects.toThrow(
      "cannot read `_doc`",
    );
    // Aliasing it away does not help: the statement still has to name it.
    await expect(insight.run(`SELECT * FROM (SELECT _doc AS payload FROM "insightMember")`)).rejects.toThrow(
      "cannot read `_doc`",
    );
  });

  test("refuses a cell that arrives holding an object, whatever the column is called", async () => {
    // The shape a dialect hands back a whole row in. No list of function names would keep up with these.
    await expect(insight.run(`SELECT json_object('password', 'hunter2') AS summary`)).rejects.toThrow(
      "may be a document",
    );
  });

  test("passes an ordinary string that merely opens with a brace", async () => {
    const { rows } = await insight.run(`SELECT '{not json' AS note`);
    expect(rows).toEqual([{ note: "{not json" }]);
  });

  test("refuses a write hidden in a CTE, without relying on the engine to reject it", async () => {
    // Postgres allows a data-modifying CTE at the top level, and `WITH` has to be allowed as a first keyword.
    await expect(
      insight.run(`WITH gone AS (DELETE FROM "insightMember" RETURNING "id") SELECT COUNT(*) AS n FROM gone`),
    ).rejects.toThrow("DELETE has no place");
    expect(db.query(`SELECT COUNT(*) AS n FROM "insightMember"`).get()).toEqual({ n: 3 });
  });

  test("survives a statement that balances the wrapper's own parentheses", async () => {
    // Reshaping the wrapper is possible and breaks nothing: every gate is on the statement text or on the rows,
    // never on the wrapper holding its shape. It stays read-only, still cannot name the document column, and the
    // ceiling is still the outer statement's.
    await expect(insight.run(`SELECT 1) AS a, (SELECT _doc FROM "insightMember"`)).rejects.toThrow("cannot read");
    await expect(insight.run(`SELECT 1) AS a; DROP TABLE "insightMember"`)).rejects.toThrow("one statement");
    const reshaped = await insight.run(`SELECT 1 AS one) AS a, (SELECT 2 AS two`);
    expect(reshaped.rows).toEqual([{ one: 1, two: 2 }]);
    expect(db.query(`SELECT COUNT(*) AS n FROM "insightMember"`).get()).toEqual({ n: 3 });
  });

  test("refuses an empty statement", async () => {
    await expect(insight.run("   ")).rejects.toThrow("needs a statement");
  });
});
