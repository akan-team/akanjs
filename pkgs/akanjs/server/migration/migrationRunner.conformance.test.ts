import { afterEach, describe, expect, test } from "bun:test";
import { DocumentSchema } from "akanjs/document";
import { RawDocumentTable, type SqlDocumentStore, type TransferRow } from "akanjs/service";
import { searchConfConstant, searchConfDatabase } from "../../service/predefinedAdaptor/search.conformance.fixture";
import { ConformanceEnv, type SqlDriver, type SqlDriverKind } from "../../test/conformance";
import { MigrationChangeLog } from "./migrationChangeLog";
import { migration } from "./migrationDefinition";
import { MigrationError } from "./migrationError";
import { MigrationLedger } from "./migrationLedger";
import { MigrationLock } from "./migrationLock";
import { type MigrationEntry, MigrationRunner } from "./migrationRunner";

const T0 = 1_600_000_000_000;
const tableName = "cardConf";

const createModelTable = async (driver: SqlDriver) => {
  const ts = driver.dialect.timestampType();
  await driver.database
    .getConnection()
    .execute(
      `CREATE TABLE "${tableName}" ("id" TEXT PRIMARY KEY NOT NULL, "createdAt" ${ts} NOT NULL, "updatedAt" ${ts} NOT NULL, "removedAt" ${ts}, "_doc" ${driver.dialect.docColumnType()} NOT NULL)`,
    );
  return new RawDocumentTable(tableName, () => driver.database.getConnection(), driver.dialect);
};

const seed = async (table: RawDocumentTable, rows: [string, Record<string, unknown>, number?][]) => {
  for (const [id, doc, removedAt = null] of rows)
    await table.insert({ id, createdAt: T0, updatedAt: T0, removedAt, _doc: doc });
};

const entryOf = (id: string, definition: unknown, checksum = "c1"): MigrationEntry => ({
  id,
  checksum,
  load: async () => ({ default: definition }),
});

const codeOf = async (promise: Promise<unknown>) => {
  try {
    await promise;
  } catch (error) {
    return MigrationError.codeOf(error);
  }
  return null;
};

const docsOf = async (table: RawDocumentTable) =>
  Object.fromEntries((await table.find()).map((row: TransferRow) => [row.id, row._doc]));

const assignOrg = migration("Give every card an org")
  .param("fallbackOrg", String)
  .plan(async ({ table }) => {
    const missing = await table(tableName).find({ org: { $exists: false } });
    return { summary: { missing: missing.length }, items: missing.map(({ id }) => id) };
  })
  .apply(async ({ table, params }, plan) => {
    for (const id of plan.items) await table(tableName).set(id, { org: params.fallbackOrg });
  })
  .verify(async ({ table }) => {
    const left = await table(tableName).count({ org: { $exists: false } });
    return left ? [`${left} cards have no org`] : [];
  });

const describeDriver = (kind: SqlDriverKind) => {
  describe(`migration runner (${kind})`, () => {
    const opened: SqlDriver[] = [];
    afterEach(async () => {
      for (const driver of opened.splice(0)) await driver.close();
    });
    const open = async () => {
      const driver = await ConformanceEnv.openSqlDriver(kind);
      opened.push(driver);
      const table = await createModelTable(driver);
      const ledger = new MigrationLedger(() => driver.database.getConnection());
      const runnerOf = (entries: MigrationEntry[]) =>
        new MigrationRunner(entries, { database: driver.database, buildId: "build-1" });
      return { driver, table, ledger, runnerOf };
    };

    test("plan only reads and is recorded; apply writes what it planned, leaves updatedAt, and verifies after", async () => {
      const { table, ledger, runnerOf } = await open();
      await seed(table, [
        ["a1", { name: "Kenny", org: "o1" }],
        ["a2", { name: "Jane" }],
        ["a3", { name: "Old" }, T0 + 1],
      ]);
      const runner = runnerOf([entryOf("202610210900_assignOrg", assignOrg)]);

      const plan = await runner.plan("202610210900_assignOrg", { fallbackOrg: "o9" }, { actor: "u1", items: 1 });
      expect(plan).toMatchObject({
        summary: { missing: 2 },
        items: ["a2"],
        itemCount: 2,
        params: { fallbackOrg: "o9" },
      });
      expect(await docsOf(table)).toEqual({
        a1: { name: "Kenny", org: "o1" },
        a2: { name: "Jane" },
        a3: { name: "Old" },
      });

      const applied = await runner.apply("202610210900_assignOrg", { fallbackOrg: "o9" }, { expect: plan.planHash });
      expect(applied).toMatchObject({ planHash: plan.planHash, changes: 2, problems: [] });
      expect(await table.get("a2")).toMatchObject({ updatedAt: T0, _doc: { name: "Jane", org: "o9" } });
      expect(await table.get("a3")).toMatchObject({ removedAt: T0 + 1, _doc: { name: "Old", org: "o9" } });

      const runs = await ledger.runsOf("202610210900_assignOrg");
      expect(runs.map(({ kind, status, actor }) => ({ kind, status, actor }))).toEqual([
        { kind: "plan", status: "done", actor: "u1" },
        { kind: "apply", status: "done", actor: null },
      ]);
      expect(runs[1]).toMatchObject({
        checksum: "c1",
        buildId: "build-1",
        params: { fallbackOrg: "o9" },
        planHash: plan.planHash,
        summary: { plan: { missing: 2 }, changes: 2, problems: [] },
      });
      expect((await runner.list())[0]).toMatchObject({
        status: "applied",
        appliedRunId: applied.runId,
        checksumMismatch: false,
      });
      const edited = runnerOf([entryOf("202610210900_assignOrg", assignOrg, "c2")]);
      expect((await edited.list())[0]).toMatchObject({ status: "applied", checksumMismatch: true });
      expect(await codeOf(runner.apply("202610210900_assignOrg", { fallbackOrg: "o9" }))).toBe("alreadyApplied");
      expect(await runner.plan("202610210900_assignOrg", { fallbackOrg: "o9" })).toMatchObject({
        summary: { missing: 0 },
      });
    });

    test("a plan stage that writes fails, and params are checked before a run is recorded", async () => {
      const { table, ledger, runnerOf } = await open();
      await seed(table, [["a1", { name: "Kenny" }]]);
      const writesInPlan = migration("Writes in plan")
        .plan(async ({ table }) => {
          await table(tableName).set("a1", { org: "o9" });
          return { summary: {} };
        })
        .apply(() => undefined);
      const runner = runnerOf([entryOf("m1", writesInPlan), entryOf("m2", assignOrg)]);

      await expect(runner.plan("m1")).rejects.toThrow("plan and verify only read");
      expect((await ledger.runsOf("m1")).map(({ status }) => status)).toEqual(["failed"]);
      expect(await codeOf(runner.plan("m2", {}))).toBe("invalidParam");
      expect(await codeOf(runner.plan("m2", { fallbackOrg: "o9", org: "x" }))).toBe("invalidParam");
      expect(await codeOf(runner.plan("m3"))).toBe("notFound");
      expect(await ledger.runsOf("m2")).toEqual([]);
    });

    test("apply refuses a plan that changed since it was approved, and records the run aborted", async () => {
      const { table, ledger, runnerOf } = await open();
      await seed(table, [["a1", { name: "Kenny" }]]);
      const runner = runnerOf([entryOf("m1", assignOrg)]);
      const plan = await runner.plan("m1", { fallbackOrg: "o9" });
      await seed(table, [["a2", { name: "Jane" }]]);

      expect(await codeOf(runner.apply("m1", { fallbackOrg: "o9" }, { expect: plan.planHash }))).toBe("planChanged");
      expect(await docsOf(table)).toEqual({ a1: { name: "Kenny" }, a2: { name: "Jane" } });
      const [, aborted] = await ledger.runsOf("m1");
      expect(aborted).toMatchObject({ kind: "apply", status: "aborted" });
      expect(aborted?.planHash).not.toBe(plan.planHash);
      expect((await runner.list())[0]?.status).toBe("pending");
      expect(await codeOf(runner.apply("m1", { fallbackOrg: "o9" }, { expect: aborted?.planHash }))).toBeNull();
    });

    test("an apply that throws rolls back its writes and their log, so the migration stays pending", async () => {
      const { table, ledger, runnerOf } = await open();
      await seed(table, [
        ["a1", { name: "Kenny" }],
        ["a2", { name: "Jane" }],
      ]);
      const halfway = migration("Fails halfway").apply(async ({ table }) => {
        await table(tableName).set("a1", { org: "o9" });
        await table(tableName).insert({ name: "New" });
        throw new Error("second step failed");
      });
      const runner = runnerOf([entryOf("m1", halfway)]);

      const error = await runner.apply("m1").catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(MigrationError);
      expect(error).toMatchObject({ code: "failed", message: "second step failed" });
      expect(await docsOf(table)).toEqual({ a1: { name: "Kenny" }, a2: { name: "Jane" } });
      const [run] = await ledger.runsOf("m1");
      expect(run).toMatchObject({
        id: (error as MigrationError).runId,
        status: "failed",
        error: "second step failed",
        summary: { plan: {}, changes: 0 },
      });
      expect((await runner.list())[0]?.status).toBe("pending");
      expect(await codeOf(runner.rollback("m1"))).toBe("notApplied");
    });

    test("the default rollback restores what each change replaced, deletes untouched copies, and reports edited rows", async () => {
      const { driver, table, ledger, runnerOf } = await open();
      await seed(table, [
        ["a1", { name: "Kenny" }],
        ["a2", { name: "Jane", profile: { tier: "gold" } }],
        ["a4", { name: "Eve" }],
      ]);
      const made: string[] = [];
      const reshape = migration("Reshape cards").apply(async ({ table }) => {
        const cards = table(tableName);
        await cards.set("a1", { org: "o9" });
        await cards.set("a2", { org: "o9", "profile.tier": undefined });
        made.push(await cards.copy("a2", { org: "o8" }));
        made.push(await cards.copy("a2", { org: "o7" }));
        made.push(await cards.insert({ name: "New" }));
        await cards.remove("a4");
      });
      const runner = runnerOf([entryOf("m1", reshape)]);
      const applied = await runner.apply("m1");
      expect(applied.changes).toBe(6);
      const [kept, edited, inserted] = made;
      await table.write("a1", { _doc: { name: "Kenny", org: "chosen by a person" }, removedAt: null });
      await table.write(edited ?? "", { _doc: { name: "Jane", org: "o7", note: "edited" }, removedAt: null });

      const rolledBack = await runner.rollback("m1", { actor: "u1" });
      expect(rolledBack.runs).toHaveLength(1);
      expect(rolledBack.runs[0]).toMatchObject({ target: applied.runId, reverted: 4 });
      expect(rolledBack.runs[0]?.skipped.map(({ id, reason }) => ({ id, reason }))).toEqual([
        { id: edited, reason: "row changed since the migration" },
        { id: "a1", reason: "row changed since the migration" },
      ]);
      const docs = await docsOf(table);
      expect(docs.a2).toEqual({ name: "Jane", profile: { tier: "gold" } });
      expect(docs.a1).toEqual({ name: "Kenny", org: "chosen by a person" });
      expect(Object.keys(docs).sort()).toEqual(["a1", "a2", "a4", edited ?? ""].sort());
      expect(await table.get("a4")).toMatchObject({ removedAt: null });
      expect([kept, inserted].every((id) => !(id && id in docs))).toBe(true);

      const rollbackRun = (await ledger.runsOf("m1")).at(-1);
      expect(rollbackRun).toMatchObject({ kind: "rollback", status: "done", target: applied.runId, actor: "u1" });
      const undone = await MigrationChangeLog.entries(driver.database.getConnection(), rollbackRun?.id ?? "");
      expect(undone.map(({ op }) => op).sort((a, b) => a.localeCompare(b))).toEqual([
        "delete",
        "delete",
        "update",
        "update",
      ]);
      expect((await runner.list())[0]?.status).toBe("pending");
      expect(await codeOf(runner.rollback(applied.runId))).toBe("notApplied");
      expect(await codeOf(runner.apply("m1"))).toBeNull();
    });

    test("a custom rollback decides per change, and a script the build dropped still rolls back by its log", async () => {
      const { table, runnerOf } = await open();
      await seed(table, [["a1", { name: "Kenny" }]]);
      const split = migration("Split cards")
        .apply(async ({ table }) => {
          await table(tableName).insert({ name: "Part" }, { id: "p1" });
          await table(tableName).insert({ name: "Part" }, { id: "p2" });
        })
        .rollback(async ({ table }, changes) => {
          for (const change of changes.entries) {
            if (await table(tableName).count({ ref: change.id })) changes.skip(change, "still referenced");
            else await changes.revert(change);
          }
        });
      const runner = runnerOf([entryOf("m1", split)]);
      await runner.apply("m1");
      await table.write("a1", { _doc: { name: "Kenny", ref: "p1" }, removedAt: null });
      const [run] = (await runner.rollback("m1")).runs;
      expect(run).toMatchObject({ reverted: 1, skipped: [{ id: "p1", reason: "still referenced" }] });
      expect(Object.keys(await docsOf(table))).toEqual(["a1", "p1"]);

      const touch = migration("Touch a1").apply(async ({ table }) => {
        await table(tableName).set("a1", { touched: true });
      });
      await runnerOf([entryOf("m2", touch)]).apply("m2");
      const dropped = await runnerOf([]).rollback("m2");
      expect(dropped.runs[0]).toMatchObject({ reverted: 1, skipped: [] });
      expect(await table.get("a1")).toMatchObject({ _doc: { name: "Kenny", ref: "p1" } });
      expect(await runnerOf([]).list()).toEqual([]);
      expect(await codeOf(runnerOf([]).rollback("m9"))).toBe("notFound");
    });

    test("one run at a time: a live lease refuses another runner, a stale one is taken over with its run interrupted", async () => {
      const { driver, table, ledger, runnerOf } = await open();
      await seed(table, [["a1", { name: "Kenny" }]]);
      const runner = runnerOf([entryOf("m1", assignOrg)]);
      const lock = new MigrationLock(() => driver.database.getConnection());
      expect(await lock.acquire()).toBe(true);
      expect(await codeOf(runner.apply("m1", { fallbackOrg: "o9" }))).toBe("locked");
      expect(await new MigrationLock(() => driver.database.getConnection()).acquire()).toBe(false);
      await lock.release();

      await ledger.insert({
        id: "dead-run",
        migrationId: "m1",
        kind: "apply",
        status: "running",
        target: null,
        checksum: "c1",
        buildId: null,
        params: null,
        planHash: null,
        summary: null,
        actor: null,
        checkpoint: null,
        startedAt: Date.now() - 120_000,
        finishedAt: null,
        error: null,
      });
      await driver.database
        .getConnection()
        .prepare(`INSERT INTO "_akan_meta" ("key", "value", "updatedAt") VALUES (?, ?, ?)`)
        .run(MigrationLock.key, String(Date.now() - MigrationLock.ttlMs - 1_000), Date.now());
      expect(await codeOf(runner.apply("m1", { fallbackOrg: "o9" }))).toBeNull();
      expect(await ledger.get("dead-run")).toMatchObject({ status: "failed", error: "interrupted" });
      const lease = await driver.database
        .getConnection()
        .prepare(`SELECT COUNT(*) AS "count" FROM "_akan_meta" WHERE "key" = ?`)
        .get<{ count: number | string }>(MigrationLock.key);
      expect(Number(lease?.count)).toBe(0);
    });

    test("outside one transaction each batch commits with its checkpoint, and the next apply resumes after it", async () => {
      const { table, ledger, runnerOf } = await open();
      const ids = Array.from({ length: 25 }, (_, idx) => `r${String(idx + 1).padStart(2, "0")}`);
      await seed(
        table,
        ids.map((id) => [id, { name: id }]),
      );
      let crashAt: string | null = "r15";
      const seen: string[] = [];
      const backfill = migration("Backfill score")
        .config({ transaction: false, batchSize: 10 })
        .apply(async ({ table }) => {
          await table(tableName).rewrite((row) => {
            seen.push(row.id);
            if (row.id === crashAt) throw new Error("crash");
            return row._doc.score === undefined ? { score: 0 } : null;
          });
        });
      const runner = runnerOf([entryOf("m1", backfill)]);

      expect(await codeOf(runner.apply("m1"))).toBe("failed");
      const [failed] = await ledger.runsOf("m1");
      expect(failed).toMatchObject({ status: "failed", checkpoint: { [`0:${tableName}`]: "r10" } });
      expect(failed?.summary).toMatchObject({ changes: 10 });
      expect(await table.count({ score: 0 })).toBe(10);
      expect((await runner.list())[0]?.status).toBe("partial");

      crashAt = null;
      seen.length = 0;
      const resumed = await runner.apply("m1");
      expect(resumed.changes).toBe(15);
      expect(seen).toEqual(ids.slice(10));
      expect(await table.count({ score: 0 })).toBe(25);
      expect((await runner.list())[0]?.status).toBe("applied");
      expect(await ledger.get(resumed.runId)).toMatchObject({ checkpoint: { [`0:${tableName}`]: "r25" } });

      const rolledBack = await runner.rollback("m1");
      expect(rolledBack.runs.map(({ target, reverted }) => ({ target, reverted }))).toEqual([
        { target: resumed.runId, reverted: 15 },
        { target: failed?.id, reverted: 10 },
      ]);
      expect(await table.count({ score: { $exists: true } })).toBe(0);
      expect((await runner.list())[0]?.status).toBe("pending");
    });

    test("a model's own writes inside apply join its transaction, so a failure takes them back too", async () => {
      const { driver, table, runnerOf } = await open();
      await seed(table, [["a1", { name: "Kenny" }]]);
      const store = driver.database.getStore(
        searchConfConstant,
        searchConfDatabase,
        new DocumentSchema(),
      ) as SqlDocumentStore;
      await store.ensure();
      let attempts = 0;
      const mixed = migration("Mixed writes").apply(async ({ table }) => {
        await table(tableName).set("a1", { org: "o9" });
        await store.create({ headline: "From the model", keywords: [], histories: [] });
        if (attempts++ === 0) throw new Error("abort");
      });
      const runner = runnerOf([entryOf("m1", mixed)]);

      expect(await codeOf(runner.apply("m1"))).toBe("failed");
      expect(await table.get("a1")).toMatchObject({ _doc: { name: "Kenny" } });
      expect(await store.count({})).toBe(0);
      await runner.apply("m1");
      expect(await table.get("a1")).toMatchObject({ _doc: { name: "Kenny", org: "o9" } });
      expect(await store.count({})).toBe(1);
    });

    test.if(kind === "postgres")(
      "a row another process changed after the plan read it fails the apply rather than being overwritten",
      async () => {
        const { driver, table, ledger, runnerOf } = await open();
        await seed(table, [
          ["a1", { name: "Kenny" }],
          ["a2", { name: "Jane" }],
        ]);
        const live = await driver.sibling();
        opened.push(live);
        const raced = migration("Raced")
          .plan(async ({ table }) => ({ summary: {}, items: (await table(tableName).find()).map(({ id }) => id) }))
          .apply(async ({ table }, plan) => {
            await live.database
              .getConnection()
              .execute(`UPDATE "${tableName}" SET "_doc" = '{"name":"Jane","org":"live"}'::jsonb WHERE "id" = 'a2'`);
            for (const id of plan.items) await table(tableName).set(id, { org: "o9" });
          });
        const runner = runnerOf([entryOf("m1", raced)]);

        expect(await codeOf(runner.apply("m1"))).toBe("failed");
        expect(await docsOf(table)).toEqual({ a1: { name: "Kenny" }, a2: { name: "Jane", org: "live" } });
        expect((await ledger.runsOf("m1"))[0]?.error).toContain("could not serialize");
      },
    );
  });
};

for (const kind of ConformanceEnv.sqlDrivers("migration runner")) describeDriver(kind);
