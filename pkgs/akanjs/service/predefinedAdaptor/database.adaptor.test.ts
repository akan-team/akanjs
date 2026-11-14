import { afterEach, describe, expect, test } from "bun:test";
import { ConformanceEnv, type SqlDriver, type SqlDriverOptions } from "../../test/conformance";
import type { SqliteDatabase } from "./database.adaptor";

class Gate {
  open!: () => void;
  readonly opened = new Promise<void>((resolve) => {
    this.open = resolve;
  });
}

const settles = async (pending: Promise<unknown>) =>
  await Promise.race([pending.then(() => true), Bun.sleep(20).then(() => false)]);

const storages: [string, SqlDriverOptions][] = [
  ["in memory", { memory: true }],
  ["a DELETE-journal file", { sqlite: { journalMode: "DELETE", busyTimeoutMs: 200 } }],
  ["a WAL file", {}],
];

describe.each(storages)("SqliteDatabase isolation on %s", (_, options) => {
  let driver: SqlDriver;
  let database: SqliteDatabase;

  const open = async () => {
    driver = await ConformanceEnv.openSqlDriver("sqlite", options);
    database = driver.database as SqliteDatabase;
    await database
      .getConnection()
      .execute(`CREATE TABLE "probe" ("id" INTEGER PRIMARY KEY, "title" TEXT NOT NULL, "body" TEXT)`);
  };
  const insert = async (title: string, body: string | null = null) =>
    await database.getConnection().prepare(`INSERT INTO "probe" ("title", "body") VALUES (?, ?)`).run(title, body);
  const titles = async () =>
    (await database.getConnection().prepare(`SELECT "title" FROM "probe" ORDER BY "id"`).all<{ title: string }>()).map(
      ({ title }) => title,
    );
  const holding = (title: string, { fail = false }: { fail?: boolean } = {}) => {
    const entered = new Gate();
    const release = new Gate();
    const done = database.transaction(async () => {
      await insert(title);
      entered.open();
      await release.opened;
      if (fail) throw new Error("rollback-probe");
    });
    return { entered: entered.opened, release: release.open, done };
  };

  afterEach(async () => {
    await driver?.close();
  });

  test("a read from outside an open transaction sees what is committed, and the transaction its own rows", async () => {
    await open();
    await insert("committed");
    await database.setMeta("probe", "committed");
    const entered = new Gate();
    const release = new Gate();
    let inside: unknown[] = [];
    const transaction = database.transaction(async () => {
      await insert("uncommitted");
      await database.setMeta("probe", "uncommitted");
      inside = [await titles(), await database.getMeta("probe"), await database.listMeta("probe")];
      entered.open();
      await release.opened;
      throw new Error("rollback-probe");
    });
    await entered.opened;
    const outside = Promise.all([titles(), database.getMeta("probe"), database.listMeta("probe")]);
    await Bun.sleep(5);
    release.open();
    await expect(transaction).rejects.toThrow("rollback-probe");
    expect(inside).toEqual([["committed", "uncommitted"], "uncommitted", [{ key: "probe", value: "uncommitted" }]]);
    expect(await outside).toEqual([["committed"], "committed", [{ key: "probe", value: "committed" }]]);
    expect(await titles()).toEqual(["committed"]);
  });

  test("a read that waited out one transaction does not run inside the next", async () => {
    await open();
    const first = holding("first", { fail: true });
    await first.entered;
    const second = holding("second", { fail: true });
    const read = titles();
    first.release();
    await expect(first.done).rejects.toThrow("rollback-probe");
    await second.entered;
    await Bun.sleep(5);
    second.release();
    await expect(second.done).rejects.toThrow("rollback-probe");
    expect(await read).toEqual([]);
  });

  test("a transaction that throws lets the reads and writes waiting on it through", async () => {
    await open();
    const failing = holding("rolled-back", { fail: true });
    await failing.entered;
    const read = titles();
    const write = insert("outside-write");
    failing.release();
    await expect(failing.done).rejects.toThrow("rollback-probe");
    expect(await settles(Promise.all([read, write]))).toBe(true);
    expect(await read).toEqual([]);
    expect(await titles()).toEqual(["outside-write"]);
  });

  test("a transaction whose commit fails lets the work waiting on it through", async () => {
    await open();
    await database
      .getConnection()
      .execute(`CREATE TABLE "child" ("parent" INTEGER REFERENCES "probe" ("id") DEFERRABLE INITIALLY DEFERRED)`);
    const entered = new Gate();
    const release = new Gate();
    const orphaning = database.transaction(async () => {
      await database.getConnection().execute(`INSERT INTO "child" ("parent") VALUES (404)`);
      entered.open();
      await release.opened;
    });
    await entered.opened;
    const read = titles();
    const write = insert("outside-write");
    release.open();
    await expect(orphaning).rejects.toThrow("FOREIGN KEY");
    expect(await settles(Promise.all([read, write]))).toBe(true);
    expect(await titles()).toEqual(["outside-write"]);
  });

  test("work that waits on a transaction runs before a transaction asked for after it", async () => {
    await open();
    const first = holding("first");
    await first.entered;
    const second = holding("second");
    const write = insert("outside-write");
    const third = holding("third");
    first.release();
    await second.entered;
    second.release();
    await third.entered;
    third.release();
    await Promise.all([first.done, second.done, third.done, write]);
    expect(await titles()).toEqual(["first", "second", "outside-write", "third"]);
  });

  test("a task the transaction left running reads what is committed once another transaction is open", async () => {
    await open();
    const left = new Gate();
    let late!: Promise<string[]>;
    await database.transaction(async () => {
      await insert("first");
      late = left.opened.then(titles);
    });
    const second = holding("second", { fail: true });
    await second.entered;
    left.open();
    await Bun.sleep(5);
    second.release();
    await expect(second.done).rejects.toThrow("rollback-probe");
    expect(await late).toEqual(["first"]);
  });

  test("an insight session opened beside a transaction reads none of its rows", async () => {
    await open();
    await insert("committed");
    const failing = holding("uncommitted", { fail: true });
    await failing.entered;
    const opening = database.openInsight();
    await Bun.sleep(5);
    failing.release();
    await expect(failing.done).rejects.toThrow("rollback-probe");
    const session = await opening;
    try {
      expect(await session.read(`SELECT "title" FROM "probe"`, 1000)).toEqual([{ title: "committed" }]);
    } finally {
      await session.close();
    }
  });

  // SQLite spills dirty pages into the file past 20000 of them by default (80 MB), fewer on a build that says so.
  test.skipIf(!options.sqlite)(
    "a transaction too large to keep in memory does not lock a read from outside out",
    async () => {
      await open();
      await insert("committed");
      const entered = new Gate();
      const release = new Gate();
      const transaction = database.transaction(async () => {
        for (let idx = 0; idx < 21; idx++) await insert(`bulk-${idx}`, "x".repeat(4 << 20));
        entered.open();
        await release.opened;
      });
      await entered.opened;
      expect(await titles()).toEqual(["committed"]);
      release.open();
      await transaction;
      expect(await titles()).toHaveLength(22);
    },
  );
});
