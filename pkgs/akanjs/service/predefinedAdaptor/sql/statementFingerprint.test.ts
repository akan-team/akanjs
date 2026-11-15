import { describe, expect, test } from "bun:test";
import { StatementFingerprint } from "./statementFingerprint";
import { StatementProbe } from "./statementProbe";

describe("StatementFingerprint", () => {
  test("gives one fingerprint to a statement whatever its list length, page or literal values", () => {
    const texts = [
      `SELECT "id" FROM "memo" WHERE "id" IN (?, ?) LIMIT 20 OFFSET 0`,
      `SELECT "id" FROM "memo" WHERE "id" IN (?, ?, ?, ?, ?, ?, ?) LIMIT 50 OFFSET 100`,
      `SELECT  "id"\n  FROM "memo"   WHERE "id" IN (?) LIMIT 1 OFFSET 7`,
    ];
    const shapes = texts.map((text) => StatementFingerprint.of(text));

    expect(new Set(shapes.map((shape) => shape.fingerprint)).size).toBe(1);
    expect(shapes[0].text).toBe(`SELECT "id" FROM "memo" WHERE "id" IN (?, ...) LIMIT ? OFFSET ?`);
    expect(shapes[0].fingerprint).toMatch(/^[0-9a-f]{12}$/);
  });

  test("collapses a multi-row insert to one row and keeps no value of it", () => {
    const shape = StatementFingerprint.of(
      `INSERT INTO "memo" ("id", "_doc") VALUES (?, json(?)), (?, json(?)), (?, json(?)) ON CONFLICT DO NOTHING`,
    );

    expect(shape.text).toBe(`INSERT INTO "memo" ("id", "_doc") VALUES (?, json(?)), ... ON CONFLICT DO NOTHING`);
    expect(shape).toMatchObject({ verb: "insert", table: "memo", changesSchema: false });
  });

  test("replaces every literal form, so no value, comment or path reaches the text", () => {
    const cases: [string, string][] = [
      [`SELECT $$secret$$, $tag$sec ret$tag$`, `SELECT ?, ...`],
      [`SELECT 1 -- secret comment\nFROM t`, `SELECT ? FROM t`],
      [`SELECT /* secret */ 1 /* a /* nested */ secret */ FROM t`, `SELECT ? FROM t`],
      [`SELECT 0x1F, 1_000, 1.5e+3x, 2.5E-3, .5, 7`, `SELECT ?, ...`],
      [`SELECT 'unterminated secret`, `SELECT ?`],
      [`SELECT $$unterminated secret`, `SELECT ?`],
      [`SELECT "unterminated secret`, `SELECT ?`],
      [`SELECT E'a\\'b secret', e'x\\\\' FROM t`, `SELECT ?, ... FROM t`],
      [`SELECT 'it''s', 'a' FROM t`, `SELECT ?, ... FROM t`],
      [`SELECT "col'umn", "a""b" FROM t`, `SELECT "col'umn", "a""b" FROM t`],
      [`WHERE x = -42 AND y > +1.5 AND z = 3 - 4`, `WHERE x = ? AND y > ? AND z = ? - ?`],
      [`WHERE name LIKE '%bob%'`, `WHERE name LIKE ?`],
      [`WHERE d = '2020-01-01'::date`, `WHERE d = ?::date`],
      [`WHERE id IN ('a','b','c')`, `WHERE id IN (?, ...)`],
      [`INSERT INTO t VALUES ('x',1),('y',2),('z',3)`, `INSERT INTO t VALUES (?, ...), ...`],
      [
        `SELECT "_doc"->>'secretKey', json_extract("_doc", '$.secret.path')`,
        `SELECT "_doc"->>?, json_extract("_doc", ?)`,
      ],
      [`SELECT "_doc" #>> '{secret,path}'`, `SELECT "_doc" #>> ?`],
      [`SELECT 'has -- dashes', 'has /* star', x FROM t`, `SELECT ?, ..., x FROM t`],
      [
        `SELECT col1, t2.c3, a$b FROM t WHERE id = $1 AND x = $2`,
        `SELECT col1, t2.c3, a$b FROM t WHERE id = $1 AND x = $2`,
      ],
      [`SELECT x'ABCD', B'101', N'secret'`, `SELECT ?, ...`],
    ];
    for (const [sql, text] of cases) {
      expect([sql, StatementFingerprint.normalize(sql)]).toEqual([sql, text]);
    }
    expect(StatementFingerprint.of(`SELECT 'secret'`).text).not.toContain("secret");
  });

  test("leaves the statement text it was given as it is", () => {
    const sql = `SELECT 'secret' -- note\nFROM "memo" WHERE "n" = 42`;
    expect(StatementProbe.fixed(sql).sql).toBe(sql);
  });

  test("gives filters that differ only by a field path the same text", () => {
    const byTitle = StatementFingerprint.of(`SELECT * FROM "memo" WHERE json_extract("_doc", '$.title') = 'a'`);
    const byOwner = StatementFingerprint.of(`SELECT * FROM "memo" WHERE json_extract("_doc", '$.ownerId') = 'b'`);

    expect(byTitle.text).toBe(`SELECT * FROM "memo" WHERE json_extract("_doc", ?) = ?`);
    expect(byTitle.fingerprint).toBe(byOwner.fingerprint);
  });

  test("normalises a 1 MB statement in well under 100 ms", () => {
    const rows = Array.from({ length: 30_000 }, (_, idx) => `('row ${idx}', ${idx}, 'x')`).join(",");
    const sql = `INSERT INTO "memo" VALUES ${rows}`;
    expect(sql.length).toBeGreaterThan(700_000);
    const started = performance.now();
    const text = StatementFingerprint.normalize(sql);
    expect(performance.now() - started).toBeLessThan(100);
    expect(text).toBe(`INSERT INTO "memo" VALUES (?, ...), ...`);
  });

  test("names the table by the statement's verb and marks a schema change", () => {
    expect(StatementFingerprint.of(`UPDATE "memo" SET "_doc" = ? WHERE "id" = ?`)).toMatchObject({
      verb: "update",
      table: "memo",
    });
    expect(StatementFingerprint.of(`DELETE FROM "memo" WHERE "id" = ?`)).toMatchObject({
      verb: "delete",
      table: "memo",
    });
    expect(
      StatementFingerprint.of(`CREATE TRIGGER "t" AFTER UPDATE ON "a" BEGIN INSERT INTO "b" VALUES (1); END`),
    ).toMatchObject({ verb: "other", table: null, changesSchema: true });
  });

  test("holds a bounded number of shapes and texts", () => {
    for (let idx = 0; idx < StatementFingerprint.maxTexts + 10; idx++)
      StatementFingerprint.of(`SELECT "c${idx}" FROM "bounded"`);

    const sizes = StatementFingerprint.sizes();
    expect(sizes.shapes).toBeLessThanOrEqual(StatementFingerprint.maxShapes);
    expect(sizes.texts).toBeLessThanOrEqual(StatementFingerprint.maxTexts);
  });

  test("keeps no copy of a statement text over 8 KB and still names its shape", () => {
    const sql = `INSERT INTO "bulk" VALUES ${Array.from({ length: 800 }, (_, idx) => `('row ${idx}', ${idx})`).join(",")}`;
    expect(sql.length).toBeGreaterThan(8_192);
    const before = StatementFingerprint.sizes().texts;

    const first = StatementFingerprint.of(sql);
    const second = StatementFingerprint.of(sql);

    expect(StatementFingerprint.sizes().texts).toBe(before);
    expect(second.fingerprint).toBe(first.fingerprint);
    expect(first).toMatchObject({ verb: "insert", table: "bulk" });
  });

  test("keeps answering from the cache while it turns over", () => {
    const sql = `SELECT "hot" FROM "turnover" WHERE "id" = 1`;
    const shape = StatementFingerprint.of(sql);
    for (let idx = 0; idx < StatementFingerprint.maxTexts * 3; idx++) {
      StatementFingerprint.of(`SELECT "t${idx}" FROM "turnover"`);
      if (idx % 100 === 0) expect(StatementFingerprint.of(sql)).toBe(shape);
    }
    expect(StatementFingerprint.sizes().texts).toBeLessThanOrEqual(StatementFingerprint.maxTexts);
  });
});
