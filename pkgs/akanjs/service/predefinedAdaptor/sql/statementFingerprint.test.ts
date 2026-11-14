import { describe, expect, test } from "bun:test";
import { StatementFingerprint } from "./statementFingerprint";

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

  test("replaces string and number literals but keeps a field path, so filters on different fields stay apart", () => {
    const byTitle = StatementFingerprint.of(
      `SELECT * FROM "memo" WHERE json_extract("_doc", '$.title') = 'alice@example.com' AND "score" > 42.5`,
    );
    const byOwner = StatementFingerprint.of(`SELECT * FROM "memo" WHERE ("_doc" #>> '{ownerId}') = 'u1'`);

    expect(byTitle.text).toBe(`SELECT * FROM "memo" WHERE json_extract("_doc", '$.title') = ? AND "score" > ?`);
    expect(byOwner.text).toBe(`SELECT * FROM "memo" WHERE ("_doc" #>> '{ownerId}') = ?`);
    expect(byTitle.text).not.toContain("alice");
    expect(byTitle.fingerprint).not.toBe(byOwner.fingerprint);
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
});
