import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { Int } from "akanjs/base";
import { ConstantRegistry, via } from "akanjs/constant";
import { by, type DatabaseCls, DatabaseRegistry, DocumentSchema, from, into } from "akanjs/document";
import { ConformanceEnv, type SqlDriver, type SqlDriverKind } from "../../test/conformance";
import { SqlDocumentStore } from "./database.adaptor";
import { InsightQuery } from "./insightQuery";

class MemberInput extends via((f) => ({ nickname: f(String), password: f(String) })) {}
class MemberObject extends via(MemberInput, () => ({})) {}
class MemberLight extends via(MemberObject, ["nickname"] as const, () => ({})) {}
class MemberFull extends via(MemberObject, MemberLight, () => ({})) {}
class MemberInsight extends via(MemberFull, (f) => ({ count: f(Int, { default: 0, accumulate: {} }) })) {}
const memberConstant = ConstantRegistry.buildModel(
  "insightMember",
  MemberInput,
  MemberObject,
  MemberFull,
  MemberLight,
  MemberInsight,
  { MemberInput, MemberObject, MemberFull, MemberLight, MemberInsight },
);
class MemberFilter extends from(MemberFull, () => ({ query: {}, sort: {} })) {}
class MemberDoc extends by(MemberFull) {}
class MemberModel extends into(MemberDoc, MemberFilter, memberConstant, () => ({})) {}
const memberDatabase = DatabaseRegistry.buildModel(
  "insightMember",
  MemberInput as unknown as DatabaseCls<InstanceType<typeof MemberInput>>,
  MemberDoc,
  MemberModel,
  MemberObject,
  MemberInsight as unknown as Parameters<typeof DatabaseRegistry.buildModel>[5],
  MemberFilter,
);

// A model table ensured through the store, as an app's would be — on Postgres that is also what grants the insight
// role its base columns — and rows written with fixed values so the answers can be stated.
const openMembers = async (kind: SqlDriverKind, options: { insight?: boolean; memory?: boolean } = {}) => {
  const driver = await ConformanceEnv.openSqlDriver(kind, { insight: true, ...options });
  await new SqlDocumentStore(
    driver.database,
    memberConstant,
    memberDatabase,
    new DocumentSchema(),
    driver.dialect,
  ).ensure();
  const insert = driver.database
    .getConnection()
    .prepare(`INSERT INTO "insightMember" VALUES (?, ?, ?, NULL, ${driver.dialect.docValuePlaceholder()})`);
  const rows: [string, number, string][] = [
    ["a", 1, JSON.stringify({ nickname: "Ada", password: "hunter2" })],
    ["b", 2, JSON.stringify({ nickname: "Ben", password: "letmein" })],
    ["c", 3, JSON.stringify({ nickname: "Cy", password: "correcthorse" })],
  ];
  for (const [id, at, doc] of rows) await insert.run(id, at, at, doc);
  return driver;
};

// Ids are from `local/database-modes/02-cluster-postgres.md` §2; an id on a plain `test` is a fixed defect.
const kinds = ConformanceEnv.has("insight query", "postgres")
  ? (["sqlite", "postgres"] as const)
  : (["sqlite"] as const);

for (const kind of kinds) {
  const onPostgres = kind === "postgres";
  // The one expression each dialect reads a document field with; every case naming it must be refused before it runs.
  const password = onPostgres ? `_doc ->> 'password'` : `json_extract(_doc, '$.password')`;

  describe(`InsightQuery (${kind})`, () => {
    let driver: SqlDriver;
    let insight: InsightQuery;
    const countOf = async (table: string) =>
      Number(
        (await driver.database.getConnection().prepare(`SELECT COUNT(*) AS n FROM "${table}"`).get<{ n: number }>())?.n,
      );

    beforeAll(async () => {
      driver = await openMembers(kind);
      insight = new InsightQuery(driver.database);
    });
    afterAll(async () => {
      await driver.close();
    });

    describe("reads", () => {
      test("answers the shape questions an insight is made of", async () => {
        const { rows, columns, truncated } = await insight.run(
          `SELECT COUNT(*) AS total, MIN("createdAt") AS first FROM "insightMember"`,
        );
        expect(rows).toEqual([{ total: 3, first: 1 }]);
        expect(columns).toEqual(["total", "first"]);
        expect(truncated).toBe(false);
      });

      test("reads a model table's base columns through a bare select", async () => {
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

      test("reads a literal that holds a comment opener or a quote as a literal", async () => {
        const { rows } = await insight.run(`SELECT '--' AS dash, '/*' AS open, 'it''s' AS quote -- trailing`);
        expect(rows).toEqual([{ dash: "--", open: "/*", quote: "it's" }]);
      });
    });

    describe("refusals", () => {
      test("refuses anything that is not a read, before it reaches the engine", async () => {
        await expect(insight.run(`DELETE FROM "insightMember"`)).rejects.toThrow("it starts with SELECT or WITH");
        await expect(insight.run(`PRAGMA table_list`)).rejects.toThrow("it starts with SELECT or WITH");
        expect(await countOf("insightMember")).toBe(3);
      });

      test("refuses a second statement rather than running the first", async () => {
        await expect(insight.run(`SELECT 1; DROP TABLE "insightMember"`)).rejects.toThrow("one statement");
        // Hidden behind a comment and inside a string it is still one `;` too many.
        await expect(insight.run(`SELECT 1 -- ok\n; DROP TABLE "insightMember"`)).rejects.toThrow("one statement");
        expect(await countOf("insightMember")).toBe(3);
      });

      test("does not mistake a semicolon inside a literal for a second statement", async () => {
        const { rows } = await insight.run(`SELECT 'a;b' AS label`);
        expect(rows).toEqual([{ label: "a;b" }]);
      });

      test("refuses to name the document column, however it is reached", async () => {
        await expect(insight.run(`SELECT "_doc" FROM "insightMember"`)).rejects.toThrow("cannot read `_doc`");
        await expect(insight.run(`SELECT ${password} AS leaked FROM "insightMember"`)).rejects.toThrow(
          "cannot read `_doc`",
        );
        // Aliasing it away does not help: the statement still has to name it.
        await expect(insight.run(`SELECT * FROM (SELECT _doc AS payload FROM "insightMember") AS t`)).rejects.toThrow(
          "cannot read `_doc`",
        );
      });

      test("[X-2] refuses the document column behind a literal that opens a comment", async () => {
        await expect(insight.run(`SELECT '--' AS dash, ${password} AS leaked FROM "insightMember"`)).rejects.toThrow(
          "cannot read `_doc`",
        );
        await expect(
          insight.run(`SELECT '/*' AS open, ${password} AS leaked, '*/' AS close FROM "insightMember"`),
        ).rejects.toThrow("cannot read `_doc`");
      });

      test("refuses a cell that arrives holding an object, whatever the column is called", async () => {
        // The shape a dialect hands back a whole row in. No list of function names would keep up with these.
        const object = onPostgres ? `json_build_object('password', 'hunter2')` : `json_object('password', 'hunter2')`;
        await expect(insight.run(`SELECT ${object} AS summary`)).rejects.toThrow("may be a document");
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
        expect(await countOf("insightMember")).toBe(3);
      });

      test("survives a statement that balances the wrapper's own parentheses", async () => {
        // Reshaping the wrapper is possible and breaks nothing: every gate is on the statement text, the connection or
        // the rows, never on the wrapper holding its shape.
        await expect(insight.run(`SELECT 1) AS a, (SELECT _doc FROM "insightMember"`)).rejects.toThrow("cannot read");
        await expect(insight.run(`SELECT 1) AS a; DROP TABLE "insightMember"`)).rejects.toThrow("one statement");
        const reshaped = await insight.run(`SELECT 1 AS one) AS a, (SELECT 2 AS two`);
        expect(reshaped.rows).toEqual([{ one: 1, two: 2 }]);
        expect(await countOf("insightMember")).toBe(3);
      });

      test("refuses an empty statement", async () => {
        await expect(insight.run("   ")).rejects.toThrow("needs a statement");
      });

      // A `*` hands `_doc` over by position and a column list renames it; the connection is what stops it.
      test("[X-8] refuses the document column renamed out of a star", async () => {
        const renamed = onPostgres ? `e ->> 'password'` : `json_extract(e, '$.password')`;
        await expect(
          insight.run(`WITH m(a, b, c, d, e) AS (SELECT * FROM "insightMember") SELECT ${renamed} AS leaked FROM m`),
        ).rejects.toThrow();
      });

      test("reads through a connection that cannot write, whatever reaches it", async () => {
        const session = await driver.database.openInsight();
        try {
          await expect(session.read(`DELETE FROM "_akan_meta"`, 5_000)).rejects.toThrow();
        } finally {
          await session.close();
        }
        expect(await countOf("_akan_meta")).toBeGreaterThan(0);
      });
    });

    if (!onPostgres)
      describe("SQLite names", () => {
        test("[X-2] reads a bracketed or backticked identifier as an identifier", async () => {
          await expect(insight.run(`SELECT [a'b] AS x, ${password} AS leaked FROM "insightMember"`)).rejects.toThrow(
            "cannot read `_doc`",
          );
          await expect(insight.run(`SELECT \`a'b\` AS x, ${password} AS leaked FROM "insightMember"`)).rejects.toThrow(
            "cannot read `_doc`",
          );
        });

        // SQLite reads a quoted string as a name where one is expected, so the text never spells the column.
        test("[X-10] refuses the document column named by quoted strings", async () => {
          await expect(
            insight.run(`SELECT json_extract('insightMember'.'_doc', '$.password') AS leaked FROM "insightMember"`),
          ).rejects.toThrow();
          await expect(
            insight.run(
              `WITH m(a, b, c, d, e) AS (SELECT * FROM 'main'.'insightMember') SELECT json_extract(e, '$.password') AS leaked FROM m`,
            ),
          ).rejects.toThrow();
        });

        test("refuses the schema the tables are attached under, once it is known", async () => {
          const session = await driver.database.openInsight();
          try {
            const [attached] = (await session.read(
              `SELECT "name" FROM pragma_database_list WHERE "name" NOT IN ('main', 'temp')`,
              5_000,
            )) as { name: string }[];
            await expect(
              session.read(`SELECT COUNT(*) AS n FROM '${attached.name.toUpperCase()}'."insightMember"`, 5_000),
            ).rejects.toThrow("cannot name");
          } finally {
            await session.close();
          }
        });

        test("reads an in-memory database from a copy", async () => {
          const memory = await openMembers("sqlite", { memory: true });
          try {
            const { rows } = await new InsightQuery(memory.database).run(`SELECT COUNT(*) AS n FROM "insightMember"`);
            expect(rows).toEqual([{ n: 3 }]);
          } finally {
            await memory.close();
          }
        });
      });

    if (onPostgres)
      describe("Postgres names and roles", () => {
        let schema: string;
        beforeAll(async () => {
          schema = String(
            (
              await driver.database
                .getConnection()
                .prepare(`SELECT current_schema() AS "schema"`)
                .get<{ schema: string }>()
            )?.schema,
          );
        });

        test("[X-2] refuses the string forms whose end would be guessed", async () => {
          await expect(
            insight.run(`SELECT $$'$$ AS a, ${password} AS leaked, $$'$$ AS b FROM "insightMember"`),
          ).rejects.toThrow("$$-quoted");
          await expect(insight.run(`SELECT $q$'$q$ AS a FROM "insightMember"`)).rejects.toThrow("$$-quoted");
          await expect(
            insight.run(`SELECT E'\\'' AS a, ${password} AS leaked, '' AS b FROM "insightMember"`),
          ).rejects.toThrow("E'…'");
          await expect(insight.run(`SELECT 'a\\' AS a`)).rejects.toThrow("backslash");
        });

        test("reads a parameter-like or embedded dollar as syntax", async () => {
          const { rows } = await insight.run(`SELECT 1 AS "a$b", 'x$$y' AS dollars`);
          expect(rows).toEqual([{ a$b: 1, dollars: "x$$y" }]);
        });

        // A table alias is the whole row as a value in Postgres, `_doc` included, and a string can hold a query. The
        // model's name reads the view that leaves `_doc` out; the table itself, named in full, refuses the role.
        test("[X-9] never hands over the document column as part of a whole row", async () => {
          const { rows } = await insight.run(
            `SELECT to_jsonb(m) -> '_doc' ->> 'password' AS leaked FROM "insightMember" m`,
          );
          expect(rows).toEqual([{ leaked: null }, { leaked: null }, { leaked: null }]);
          await expect(
            insight.run(`SELECT to_jsonb(m) -> '_doc' ->> 'password' AS leaked FROM "${schema}"."insightMember" m`),
          ).rejects.toThrow("may read nothing else");
        });

        test("[X-9] refuses a query handed over as a string, even after resetting the role", async () => {
          await expect(
            insight.run(
              `SELECT set_config('role', 'none', true) AS reset, query_to_xml('select _doc ->> ''password'' AS p from "${schema}"."insightMember"', true, false, '') AS leaked`,
            ),
          ).rejects.toThrow("may read nothing else");
        });

        test("[X-8] refuses the table named in full to a star", async () => {
          await expect(
            insight.run(
              `WITH m(a, b, c, d, e) AS (SELECT * FROM "${schema}"."insightMember") SELECT e ->> 'password' AS p FROM m`,
            ),
          ).rejects.toThrow("may read nothing else");
        });

        test("refuses to run without an insight role", async () => {
          const bare = await ConformanceEnv.openSqlDriver("postgres");
          try {
            await expect(new InsightQuery(bare.database).run(`SELECT 1 AS one`)).rejects.toThrow(
              "POSTGRES_INSIGHT_URL",
            );
          } finally {
            await bare.close();
          }
        });

        test("refuses an insight role that could read the document column or become a role that can", async () => {
          const { config } = driver.database as unknown as { config: { url: string; insightUrl: string } };
          const misread = new InsightQuery(driver.database);
          Object.assign(driver.database, { config: { ...config, insightUrl: config.url } });
          try {
            await expect(misread.run(`SELECT 1 AS one`)).rejects.toThrow("superuser");
          } finally {
            Object.assign(driver.database, { config });
          }
          const member = await ConformanceEnv.createPostgresLoginRole(
            ConformanceEnv.uniqueName("member").toLowerCase(),
          );
          try {
            await driver.database.getConnection().execute(`GRANT pg_monitor TO "${new URL(member.url).username}"`);
            Object.assign(driver.database, { config: { ...config, insightUrl: member.url } });
            await expect(misread.run(`SELECT 1 AS one`)).rejects.toThrow("pg_monitor");
          } finally {
            Object.assign(driver.database, { config });
            await member.drop();
          }
        });
      });
  });
}
