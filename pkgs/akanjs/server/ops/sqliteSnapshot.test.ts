import { Database } from "bun:sqlite";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import { resetEnvCache } from "../../base/baseEnv";
import { AgeEncryption } from "./ageEncryption";
import { SnapshotRestore } from "./snapshotRestore";
import { SqliteSnapshot } from "./sqliteSnapshot";

let root = "";
let main = "";
let solid = "";

const openWal = (file: string) => {
  const db = new Database(file, { create: true });
  db.run("PRAGMA journal_mode = WAL");
  return db;
};

const readRows = (file: string, sql: string) => {
  const db = new Database(file, { readonly: true });
  try {
    return db.query(sql).all();
  } finally {
    db.close();
  }
};

beforeAll(() => {
  Object.assign(process.env, {
    AKAN_PUBLIC_APP_NAME: "opsapp",
    AKAN_PUBLIC_REPO_NAME: "akan",
    AKAN_PUBLIC_SERVE_DOMAIN: "example.com",
    AKAN_PUBLIC_ENV: "main",
    AKAN_PUBLIC_OPERATION_MODE: "edge",
    AKAN_DATABASE_MODE: "single",
  });
  resetEnvCache();
  root = mkdtempSync(path.join(tmpdir(), "akan-ops-"));
  main = path.join(root, "opsapp-main.db");
  solid = path.join(root, "opsapp-main_solid.db");
  const db = openWal(main);
  db.run("CREATE TABLE t (id INTEGER PRIMARY KEY, v TEXT)");
  db.run("INSERT INTO t (v) VALUES ('committed')");
  db.close();
  const solidDb = openWal(solid);
  solidDb.run("CREATE TABLE q (id INTEGER PRIMARY KEY)");
  solidDb.run("INSERT INTO q DEFAULT VALUES");
  solidDb.close();
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
  delete process.env.AKAN_DATABASE_MODE;
  resetEnvCache();
});

describe("SqliteSnapshot", () => {
  test("copies only committed rows while another connection holds a write transaction", async () => {
    const writer = openWal(main);
    writer.run("BEGIN IMMEDIATE");
    writer.run("INSERT INTO t (v) VALUES ('uncommitted')");
    try {
      const capture = await SqliteSnapshot.capture({
        id: "s1",
        dir: path.join(root, "snapshots"),
        sources: { main, solid },
      });
      expect(capture.manifest).toMatchObject({ id: "s1", appName: "opsapp", environment: "main", integrity: "ok" });
      expect(capture.manifest.files.map((file) => file.role)).toEqual(["main"]);
      const [file] = capture.manifest.files;
      const bytes = gunzipSync(readFileSync(capture.paths.main ?? ""));
      expect(bytes.length).toBe(file?.sizeBytes ?? -1);
      expect(new Bun.CryptoHasher("sha256").update(bytes).digest("hex")).toBe(file?.sha256 ?? "");
      const copy = path.join(root, "copy.db");
      writeFileSync(copy, bytes);
      expect(readRows(copy, "SELECT v FROM t")).toEqual([{ v: "committed" }]);
    } finally {
      writer.run("ROLLBACK");
      writer.close();
    }
  });

  test("refuses a reused id and an id that could escape the directory", async () => {
    const dir = path.join(root, "snapshots");
    await expect(SqliteSnapshot.capture({ id: "s1", dir, sources: { main, solid } })).rejects.toThrow("already exists");
    await expect(SqliteSnapshot.capture({ id: "../x", dir, sources: { main, solid } })).rejects.toThrow("Invalid");
  });

  test("restores main and solid, keeping the previous files and their -wal beside them", async () => {
    const capture = await SqliteSnapshot.capture({
      id: "s2",
      dir: path.join(root, "snapshots"),
      sources: { main, solid },
      includeSolid: true,
    });
    const db = openWal(main);
    db.run("INSERT INTO t (v) VALUES ('after-snapshot')");
    db.close();
    const { restored } = await SnapshotRestore.run({
      manifestPath: capture.manifestPath,
      sources: { main, solid },
      now: new Date("2026-09-25T00:00:00Z"),
    });
    expect(restored.map((file) => file.role)).toEqual(["main", "solid"]);
    const preserved = restored[0]?.preservedAs ?? "";
    expect(existsSync(preserved)).toBe(true);
    expect(existsSync(`${main}-wal`)).toBe(false);
    expect(readRows(main, "SELECT v FROM t")).toEqual([{ v: "committed" }]);
    expect(readRows(preserved, "SELECT count(*) AS n FROM t")).toEqual([{ n: 2 }]);
  });

  test("a tampered file is refused before anything is swapped", async () => {
    const capture = await SqliteSnapshot.capture({
      id: "s3",
      dir: path.join(root, "snapshots"),
      sources: { main, solid },
    });
    writeFileSync(capture.paths.main ?? "", Buffer.from("not gzip"));
    await expect(SnapshotRestore.run({ manifestPath: capture.manifestPath, sources: { main, solid } })).rejects.toThrow(
      "checksum",
    );
    expect(readRows(main, "SELECT v FROM t")).toEqual([{ v: "committed" }]);
  });

  test("an age-encrypted snapshot restores with the identity and refuses without it", async () => {
    const { identity, recipient } = AgeEncryption.generateIdentity();
    const capture = await SqliteSnapshot.capture({
      id: "s5",
      dir: path.join(root, "snapshots"),
      sources: { main, solid },
      encryptor: await AgeEncryption.encryptor([recipient]),
    });
    expect(capture.manifest.encryption).toEqual({ format: "age", recipients: [recipient] });
    expect(capture.manifest.files[0]?.name).toEndWith(".db.gz.age");
    const sources = { main: path.join(root, "restored.db"), solid: null };
    await expect(SnapshotRestore.run({ manifestPath: capture.manifestPath, sources })).rejects.toThrow("encrypted");
    await SnapshotRestore.run({
      manifestPath: capture.manifestPath,
      sources,
      decryptor: await AgeEncryption.decryptor([identity]),
    });
    expect(readRows(sources.main, "SELECT v FROM t")).toEqual([{ v: "committed" }]);
  });

  test("cluster mode is refused", async () => {
    process.env.AKAN_DATABASE_MODE = "cluster";
    resetEnvCache();
    try {
      await expect(
        SqliteSnapshot.capture({ id: "s4", dir: path.join(root, "snapshots"), sources: { main, solid } }),
      ).rejects.toThrow("SQLite database modes only");
    } finally {
      process.env.AKAN_DATABASE_MODE = "single";
      resetEnvCache();
    }
  });
});
