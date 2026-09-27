import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pluginDecls } from "../../../packages/cli/src/lib/native-plugins.ts";
import { isAkanNativeError } from "../../../packages/core/src/index.ts";
import { installMockHost, type MockHost } from "../../../packages/core/src/testing.ts";
import { createDispatcher } from "../../../packages/desktop/src/dispatcher.ts";
import manifest from "../native-plugin.json";
import { checkName, checkParams, checkSql, countStatements, refusedStatement } from "../src/common.ts";
import { createDesktopSqlite } from "../src/desktop.ts";
import { sqlite } from "../src/index.ts";

let host: MockHost | null = null;
afterEach(() => {
  host?.uninstall();
  host = null;
});

const codeOf = (fn: () => unknown) => {
  try {
    fn();
    return null;
  } catch (e) {
    return (e as { code?: string }).code;
  }
};

describe("sqlite routing", () => {
  test("native hosts get the arguments as given", async () => {
    host = installMockHost({
      platform: "android",
      plugins: {
        sqlite: {
          methods: {
            open: ({ name }) => ({ db: name }),
            execute: () => ({ changes: 1, lastInsertId: 7 }),
            query: () => ({ columns: ["id"], rows: [{ id: 7 }] }),
            close: () => {},
          },
        },
      },
    });
    const { db } = await sqlite.open({ name: "notes.db" });
    expect(await sqlite.execute({ db, sql: "INSERT INTO t VALUES (?, ?)", params: [1, { base64: "AAE=" }] })).toEqual({
      changes: 1,
      lastInsertId: 7,
    });
    const { rows } = await sqlite.query<{ id: number }>({ db, sql: "SELECT id FROM t" });
    expect(rows[0]!.id).toBe(7);
    await sqlite.close({ db });
    expect(host.requests.map((r) => [r.method, r.args])).toEqual([
      ["open", { name: "notes.db" }],
      ["execute", { db: "notes.db", sql: "INSERT INTO t VALUES (?, ?)", params: [1, { base64: "AAE=" }] }],
      ["query", { db: "notes.db", sql: "SELECT id FROM t" }],
      ["close", { db: "notes.db" }],
    ]);
  });

  test("the web has no implementation", async () => {
    host = installMockHost({ platform: "web" });
    expect(sqlite.isSupported("open")).toBe(false);
    expect(isAkanNativeError(await sqlite.open({ name: "x.db" }).catch((e) => e), "UNSUPPORTED")).toBe(true);
  });

  test("manifest: every native host implements every method", () => {
    const plugin = { spec: "sqlite", dir: `${import.meta.dir}/..`, manifest: manifest as never };
    for (const platform of ["ios", "android", "macos"] as const) {
      expect(pluginDecls([plugin], platform)).toEqual({
        sqlite: { methods: ["open", "execute", "query", "close"], events: [] },
      });
    }
  });
});

describe("sqlite argument rules", () => {
  test("names are file names, never paths", () => {
    for (const ok of ["notes.db", "a", "My_Data-2.sqlite", "x".repeat(128)]) expect(checkName(ok)).toBe(ok);
    for (const bad of [
      "",
      "../x.db",
      "a/b.db",
      "a\\b",
      ".hidden",
      "-x",
      "x".repeat(129),
      "notes.db-wal",
      "notes.db-journal",
      "a b",
      "é.db",
      3,
      null,
    ]) {
      expect(codeOf(() => checkName(bad))).toBe("INVALID_ARGS");
    }
  });

  test("params: primitives, booleans as 1/0, { base64 } as bytes", () => {
    expect(checkParams(undefined)).toEqual([]);
    expect(checkParams(["a", 1, 1.5, null, true, false, -0, 2 ** 53])).toEqual([
      "a",
      1n,
      1.5,
      null,
      1n,
      0n,
      0n,
      2 ** 53,
    ]);
    expect(checkParams([{ base64: "AAH/" }, { base64: "AA" }, { base64: "" }])).toEqual([
      new Uint8Array([0, 1, 255]),
      new Uint8Array([0]),
      new Uint8Array([]),
    ]);
    for (const bad of [
      {},
      [[1]],
      [{}],
      [{ base64: "@@" }],
      [{ base64: "AAE=", x: 1 }],
      [{ base64: 1 }],
      [undefined],
      [NaN],
      "x",
    ]) {
      expect(codeOf(() => checkParams(bad))).toBe("INVALID_ARGS");
    }
  });

  // ATTACH and VACUUM INTO reach files outside the app's databases, past the filesystem scopes.
  test("ATTACH and VACUUM INTO are refused", () => {
    for (const sql of [
      "ATTACH '/etc/x.db' AS x",
      "  attach database 'a.db' as a",
      "/* c */ ATTACH 'a' AS a",
      "EXPLAIN ATTACH 'a' AS a",
      "explain query plan attach 'a' as a",
      "VACUUM INTO '/tmp/copy.db'",
      "vacuum main into 'x.db'",
    ]) {
      expect(refusedStatement(sql), sql).not.toBeNull();
      expect(
        isAkanNativeError(
          (() => {
            try {
              checkSql(sql);
            } catch (e) {
              return e;
            }
          })(),
          "NOT_ALLOWED",
        ),
        sql,
      ).toBe(true);
    }
    for (const sql of [
      "VACUUM",
      "vacuum main",
      "SELECT 'ATTACH' AS a",
      'SELECT "attach" FROM t',
      "INSERT INTO t VALUES ('vacuum into')",
      "-- ATTACH\nSELECT 1",
      "DETACH x",
    ]) {
      expect(refusedStatement(sql), sql).toBeNull();
    }
  });

  test("statement count follows sqlite3_complete()", () => {
    const cases: [string, number][] = [
      ["", 0],
      ["  ;; -- only a comment\n /* and another */ ;", 0],
      ["SELECT 1", 1],
      ["SELECT 1;", 1],
      ["SELECT 1; -- trailing comment", 1],
      ["SELECT 1;\n/* trailing */\n", 1],
      ["SELECT 1; SELECT 2", 2],
      ["SELECT 1;SELECT 2;", 2],
      ["SELECT ';' AS a, \"b;\" AS [c;d], `e;`", 1],
      ["SELECT 'it''s; fine'", 1],
      ["SELECT 1 -- ; not a statement end\n + 1", 1],
      ["SELECT 1 /* ; */ + 1", 1],
      ["CREATE TRIGGER tr AFTER INSERT ON t BEGIN INSERT INTO log VALUES (1); UPDATE c SET n = n + 1; END;", 1],
      ["create temp trigger tr after insert on t begin select case when 1 then 2 end; end", 1],
      ["CREATE TRIGGER tr AFTER INSERT ON t BEGIN SELECT 1; END; SELECT 2", 2],
      ["EXPLAIN CREATE TRIGGER tr AFTER INSERT ON t BEGIN SELECT 1; END;", 1],
      ["CREATE TABLE end_(x); SELECT 1", 2],
      ["BEGIN; COMMIT", 2],
      ["SELECT 'unterminated; ", 1],
      ["SELECT 1 /* unterminated; ", 1],
      ["SELECT '한글;' AS 이름", 1],
    ];
    for (const [sql, count] of cases) expect([sql, countStatements(sql)]).toEqual([sql, count]);
  });

  // The oracle: SQLite's own sqlite3_prepare_v2 tail, through the system library.
  test.skipIf(process.platform !== "darwin")("statement count matches SQLite's prepare tail", async () => {
    const { dlopen, FFIType, ptr } = await import("bun:ffi");
    const lib = dlopen("/usr/lib/libsqlite3.dylib", {
      sqlite3_open: { args: [FFIType.cstring, FFIType.ptr], returns: FFIType.i32 },
      sqlite3_prepare_v2: {
        args: [FFIType.ptr, FFIType.ptr, FFIType.i32, FFIType.ptr, FFIType.ptr],
        returns: FFIType.i32,
      },
      sqlite3_finalize: { args: [FFIType.ptr], returns: FFIType.i32 },
      sqlite3_close: { args: [FFIType.ptr], returns: FFIType.i32 },
      sqlite3_exec: {
        args: [FFIType.ptr, FFIType.cstring, FFIType.ptr, FFIType.ptr, FFIType.ptr],
        returns: FFIType.i32,
      },
    });
    const handle = new BigUint64Array(1);
    expect(lib.symbols.sqlite3_open(Buffer.from(":memory:\0"), ptr(handle))).toBe(0);
    const db = Number(handle[0]);
    // prepare fails on a missing table, and then there is no tail to follow
    expect(
      lib.symbols.sqlite3_exec(db as never, Buffer.from("CREATE TABLE t(a); CREATE TABLE log(n);\0"), null, null, null),
    ).toBe(0);
    const prepared = (sql: string) => {
      const bytes = Buffer.from(`${sql}\0`);
      const base = ptr(bytes);
      const stmt = new BigUint64Array(1);
      const tail = new BigUint64Array(1);
      let offset = 0;
      let count = 0;
      while (offset < bytes.length - 1) {
        const rc = lib.symbols.sqlite3_prepare_v2(db as never, (base + offset) as never, -1, ptr(stmt), ptr(tail));
        if (rc !== 0) throw new Error(`sample does not compile: ${sql}`);
        if (stmt[0]) {
          count++;
          lib.symbols.sqlite3_finalize(Number(stmt[0]) as never);
        }
        const next = Number(tail[0]) - base;
        if (next <= offset) break;
        offset = next;
      }
      return count;
    };
    const samples = [
      "SELECT 1",
      "SELECT 1;",
      "SELECT 1; SELECT 2",
      "  ;; -- c\n /* d */ ;",
      "SELECT ';' AS a, \"b;\" AS [c;d]",
      "SELECT 'it''s; fine'",
      "SELECT 1 -- ;\n + 1",
      "CREATE TABLE x1(a); CREATE TABLE x2(n)",
      "CREATE TRIGGER tr AFTER INSERT ON t BEGIN INSERT INTO log VALUES (1); INSERT INTO log VALUES (2); END;",
      "CREATE TRIGGER tr AFTER INSERT ON t BEGIN SELECT 1; END; SELECT 2",
      "SELECT '한글;' AS 이름; SELECT 2",
    ];
    for (const sql of samples) expect([sql, countStatements(sql)]).toEqual([sql, prepared(sql)]);
    lib.symbols.sqlite3_close(db as never);
    lib.close();
  });
});

describe("sqlite desktop implementation", () => {
  function harness() {
    const appDataDir = join(mkdtempSync(join(tmpdir(), "akan-native-sqlite-")), "data");
    const dispatcher = createDispatcher([createDesktopSqlite()], {
      app: { id: "dev.test", name: "Test", version: "1.0.0", build: 1 },
      appDataDir,
      emit: () => {},
      registerFile: () => ({ url: "", mime: "", size: 0 }),
    });
    let id = 0;
    const call = async (method: string, args?: unknown) => {
      const res = await dispatcher.handle(JSON.stringify({ v: 1, id: ++id, plugin: "sqlite", method, args }));
      if (res.ok) return res.result as any;
      throw Object.assign(new Error(res.error.message), { code: res.error.code });
    };
    const fails = (method: string, args?: unknown) =>
      call(method, args).then(
        () => "resolved",
        (e) => `${e.code}: ${e.message}`,
      );
    return { appDataDir, call, fails };
  }

  test("open creates <app data>/databases/<name>; handles survive a second open", async () => {
    const { appDataDir, call } = harness();
    expect(await call("open", { name: "notes.db" })).toEqual({ db: "notes.db" });
    expect(await call("open", { name: "notes.db" })).toEqual({ db: "notes.db" });
    expect(existsSync(join(appDataDir, "databases", "notes.db"))).toBe(true);
    expect((await call("query", { db: "notes.db", sql: "PRAGMA foreign_keys" })).rows).toEqual([{ foreign_keys: 1 }]);
    expect((await call("query", { db: "notes.db", sql: "PRAGMA journal_mode" })).rows).toEqual([
      { journal_mode: "wal" },
    ]);
  });

  test("execute and query: changes, lastInsertId, columns and values", async () => {
    const { call } = harness();
    const { db } = await call("open", { name: "t.db" });
    expect(
      await call("execute", {
        db,
        sql: "CREATE TABLE notes (id INTEGER PRIMARY KEY, title TEXT NOT NULL, score REAL, data BLOB)",
      }),
    ).toEqual({ changes: 0, lastInsertId: 0 });
    expect(
      await call("execute", {
        db,
        sql: "INSERT INTO notes (title, score, data) VALUES (?, ?, ?)",
        params: ["한글 \u0000 ✓", 1.5, { base64: "AAH/" }],
      }),
    ).toEqual({ changes: 1, lastInsertId: 1 });
    expect(
      await call("execute", {
        db,
        sql: "INSERT INTO notes (title, score, data) VALUES (?, ?, ?);",
        params: ["b", null, { base64: "" }],
      }),
    ).toEqual({ changes: 1, lastInsertId: 2 });
    expect(await call("execute", { db, sql: "UPDATE notes SET score = 2 WHERE id > ?", params: [0] })).toEqual({
      changes: 2,
      lastInsertId: 2,
    });
    const result = await call("query", {
      db,
      sql: "SELECT id, title, score, data, typeof(data) AS kind FROM notes ORDER BY id",
    });
    expect(result).toEqual({
      columns: ["id", "title", "score", "data", "kind"],
      rows: [
        { id: 1, title: "한글 \u0000 ✓", score: 2, data: { base64: "AAH/" }, kind: "blob" },
        { id: 2, title: "b", score: 2, data: { base64: "" }, kind: "blob" },
      ],
    });
    expect(await call("query", { db, sql: "SELECT * FROM notes WHERE id < 0" })).toEqual({
      columns: ["id", "title", "score", "data"],
      rows: [],
    });
  });

  test("binding types match the mobile hosts", async () => {
    const { call } = harness();
    const { db } = await call("open", { name: "types.db" });
    const { rows } = await call("query", {
      db,
      sql: "SELECT typeof(?) a, typeof(?) b, typeof(?) c, typeof(?) d, typeof(?) e, typeof(?) f, typeof(?) g, typeof(?) h, typeof(?) i, typeof(?) j",
      params: [1, 1.5, "x", null, true, 2 ** 53, -(2 ** 53 - 1), { base64: "AA==" }, 2 ** 52, 1e20],
    });
    expect(rows).toEqual([
      {
        a: "integer",
        b: "real",
        c: "text",
        d: "null",
        e: "integer",
        f: "real",
        g: "integer",
        h: "blob",
        i: "integer",
        j: "real",
      },
    ]);
    const values = await call("query", { db, sql: "SELECT 1e999 AS inf, 9007199254740993 AS big, 1 AS a, 2 AS a" });
    expect(values.rows).toEqual([{ inf: null, big: 9007199254740992, a: 2 }]);
    expect(values.columns).toEqual(["inf", "big", "a", "a"]);
  });

  test("triggers count in changes; RETURNING works in both calls", async () => {
    const { call } = harness();
    const { db } = await call("open", { name: "tr.db" });
    await call("execute", { db, sql: "CREATE TABLE t (a)" });
    await call("execute", { db, sql: "CREATE TABLE log (n)" });
    await call("execute", {
      db,
      sql: "CREATE TRIGGER tr AFTER INSERT ON t BEGIN INSERT INTO log VALUES (1); INSERT INTO log VALUES (2); END;",
    });
    expect(await call("execute", { db, sql: "INSERT INTO t VALUES (1)" })).toEqual({ changes: 3, lastInsertId: 1 });
    expect(await call("execute", { db, sql: "INSERT INTO t VALUES (2) RETURNING rowid" })).toEqual({
      changes: 3,
      lastInsertId: 2,
    });
    expect((await call("query", { db, sql: "INSERT INTO t VALUES (3) RETURNING rowid AS id" })).rows).toEqual([
      { id: 3 },
    ]);
  });

  test("transactions across calls", async () => {
    const { call } = harness();
    const { db } = await call("open", { name: "tx.db" });
    await call("execute", { db, sql: "CREATE TABLE t (a)" });
    await call("execute", { db, sql: "BEGIN" });
    await call("execute", { db, sql: "INSERT INTO t VALUES (1)" });
    await call("execute", { db, sql: "ROLLBACK" });
    await call("execute", { db, sql: "BEGIN" });
    await call("execute", { db, sql: "INSERT INTO t VALUES (2)" });
    await call("execute", { db, sql: "COMMIT" });
    expect((await call("query", { db, sql: "SELECT a FROM t" })).rows).toEqual([{ a: 2 }]);
  });

  test("errors", async () => {
    const { call, fails } = harness();
    const { db } = await call("open", { name: "e.db" });
    await call("execute", {
      db,
      sql: "CREATE TABLE t (id INTEGER PRIMARY KEY, v TEXT UNIQUE, p INTEGER REFERENCES t(id))",
    });
    await call("execute", { db, sql: "INSERT INTO t (v) VALUES ('a')" });
    expect(await fails("open", { name: "../x.db" })).toStartWith("INVALID_ARGS");
    expect(await fails("execute", { db: "nope.db", sql: "SELECT 1" })).toStartWith("NOT_FOUND");
    expect(await fails("execute", { db, sql: "SELEC 1" })).toBe('INVALID_ARGS: near "SELEC": syntax error');
    expect(await fails("query", { db, sql: "SELECT * FROM missing" })).toBe("INVALID_ARGS: no such table: missing");
    expect(await fails("execute", { db, sql: "INSERT INTO t (v) VALUES ('a')" })).toBe(
      "INVALID_ARGS: UNIQUE constraint failed: t.v",
    );
    expect(await fails("execute", { db, sql: "INSERT INTO t (v, p) VALUES ('b', 99)" })).toBe(
      "INVALID_ARGS: FOREIGN KEY constraint failed",
    );
    expect(await fails("execute", { db, sql: "SELECT ?, ?", params: [1] })).toBe(
      "INVALID_ARGS: sql expects 2 values, got 1",
    );
    expect(await fails("execute", { db, sql: "SELECT 1", params: [1] })).toBe(
      "INVALID_ARGS: sql expects 0 values, got 1",
    );
    expect(await fails("execute", { db, sql: "INSERT INTO t (v) VALUES ('c'); DROP TABLE t" })).toBe(
      "INVALID_ARGS: sql must be one statement; run them one call at a time",
    );
    expect(await fails("query", { db, sql: " -- nothing\n" })).toBe("INVALID_ARGS: sql holds no statement");
    expect(await fails("execute", { db, sql: "SELECT ?", params: [{ blob: "x" }] })).toBe(
      "INVALID_ARGS: params[0] must be a string, number, boolean, null or { base64 }",
    );
    expect(await fails("execute", { db, sql: "COMMIT" })).toBe(
      "INVALID_ARGS: cannot commit - no transaction is active",
    );
    // nothing ran from the rejected two-statement call
    expect((await call("query", { db, sql: "SELECT v FROM t" })).rows).toEqual([{ v: "a" }]);
  });

  test("document scope: a page load's connection closes when it ends, rolling back what it left open", async () => {
    const appDataDir = join(mkdtempSync(join(tmpdir(), "akan-native-sqlite-")), "data");
    const dispatcher = createDispatcher([createDesktopSqlite()], {
      app: { id: "dev.test", name: "Test", version: "1.0.0", build: 1 },
      appDataDir,
      emit: () => {},
      registerFile: () => ({ url: "", mime: "", size: 0 }),
    });
    let id = 0;
    const call = async (doc: string, method: string, args?: unknown, window = 1) => {
      const res = await dispatcher.handle(
        JSON.stringify({ v: 1, id: ++id, doc, plugin: "sqlite", method, args }),
        window,
      );
      if (res.ok) return res.result as any;
      throw Object.assign(new Error(res.error.message), { code: res.error.code });
    };
    const A = "a".repeat(32);
    const B = "b".repeat(32);
    const W2 = "c".repeat(32);
    await call(A, "open", { name: "d.db" });
    await call(A, "execute", { db: "d.db", sql: "CREATE TABLE t (a)" });
    await call(A, "execute", { db: "d.db", sql: "INSERT INTO t VALUES ('committed')" });
    // Another window's page has its own connection to the same file (WAL: its read does not wait).
    await call(W2, "open", { name: "d.db" }, 2);
    await call(A, "execute", { db: "d.db", sql: "BEGIN" });
    await call(A, "execute", { db: "d.db", sql: "INSERT INTO t VALUES ('left open')" });
    expect((await call(W2, "query", { db: "d.db", sql: "SELECT a FROM t" }, 2)).rows).toEqual([{ a: "committed" }]);
    // Window 1 reloads: the new page's handle is not open until it opens it; the old transaction is gone.
    await expect(call(B, "query", { db: "d.db", sql: "SELECT 1" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await call(B, "open", { name: "d.db" });
    expect((await call(B, "query", { db: "d.db", sql: "SELECT a FROM t" })).rows).toEqual([{ a: "committed" }]);
    // The other window can write: no lock was left behind.
    await call(W2, "execute", { db: "d.db", sql: "INSERT INTO t VALUES ('w2')" }, 2);
    expect((await call(B, "query", { db: "d.db", sql: "SELECT count(*) AS n FROM t" })).rows).toEqual([{ n: 2 }]);
  });

  test("close, reopen: the data is on disk", async () => {
    const { call, fails } = harness();
    const { db } = await call("open", { name: "p.db" });
    await call("execute", { db, sql: "CREATE TABLE t (a)" });
    await call("execute", { db, sql: "INSERT INTO t VALUES ('kept')" });
    await call("close", { db });
    await call("close", { db }); // closing twice is fine
    expect(await fails("query", { db, sql: "SELECT 1" })).toStartWith("NOT_FOUND");
    await call("open", { name: "p.db" });
    expect((await call("query", { db, sql: "SELECT a FROM t" })).rows).toEqual([{ a: "kept" }]);
  });
});
