import { Database } from "bun:sqlite";
import { afterAll, beforeAll, describe, expect, spyOn, test } from "bun:test";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { hostname, tmpdir } from "node:os";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import { resetEnvCache } from "../../base/baseEnv";
import { AgeEncryption } from "./ageEncryption";
import { OpsCommand } from "./opsCommand";
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

const modeOf = (file: string) => statSync(file).mode & 0o777;

const runCommand = async (argv: string[]) => {
  const err: string[] = [];
  const stdout = spyOn(process.stdout, "write").mockImplementation(() => true);
  const stderr = spyOn(process.stderr, "write").mockImplementation((chunk: unknown) => {
    err.push(String(chunk));
    return true;
  });
  try {
    return { code: await OpsCommand.run(argv), stderr: err.join("") };
  } finally {
    stdout.mockRestore();
    stderr.mockRestore();
  }
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

  test.skipIf(process.platform === "win32")(
    "renames a finished capture into place with private files, leaving no staging dir or plaintext copy",
    async () => {
      const dir = path.join(root, "private");
      const capture = await SqliteSnapshot.capture({ id: "m1", dir, sources: { main, solid }, includeSolid: true });
      expect(readdirSync(dir)).toEqual(["m1"]);
      expect(readdirSync(capture.dir).sort()).toEqual([
        "manifest.json",
        "opsapp-main.db.gz",
        "opsapp-main_solid.db.gz",
      ]);
      expect(modeOf(capture.dir)).toBe(0o700);
      for (const file of [capture.manifestPath, capture.paths.main ?? "", capture.paths.solid ?? ""])
        expect(modeOf(file)).toBe(0o600);
      const wider = await SqliteSnapshot.capture({ id: "m2", dir, sources: { main, solid }, fileMode: 0o640 });
      expect([modeOf(wider.dir), modeOf(wider.manifestPath)]).toEqual([0o750, 0o640]);
      expect(SqliteSnapshot.fileMode("644")).toBe(0o644);
      expect(SqliteSnapshot.fileMode("nonsense")).toBe(0o600);
      const stderr = spyOn(process.stderr, "write").mockImplementation(() => true);
      try {
        expect([SqliteSnapshot.fileMode("680"), SqliteSnapshot.fileMode("0640"), SqliteSnapshot.fileMode("")]).toEqual([
          0o600, 0o640, 0o600,
        ]);
        expect(stderr).toHaveBeenCalledTimes(1);
      } finally {
        stderr.mockRestore();
      }
    },
  );

  test("a failed capture leaves nothing in the snapshot dir", async () => {
    const dir = path.join(root, "failing");
    await expect(
      SqliteSnapshot.capture({ id: "f1", dir, sources: { main: path.join(root, "missing.db"), solid: null } }),
    ).rejects.toThrow("No main database");
    expect(readdirSync(dir)).toEqual([]);
  });

  test("sweeps the staging dir of a capture whose process is gone, and keeps a live one's", async () => {
    const dir = path.join(root, "sweep");
    const exited = Bun.spawn(["bun", "--version"], { stdout: "ignore" });
    await exited.exited;
    const dead = path.join(dir, `${SqliteSnapshot.stagingOwner(hostname(), exited.pid)}-abc`);
    const live = path.join(dir, `${SqliteSnapshot.stagingOwner()}-def`);
    for (const staging of [dead, live]) {
      mkdirSync(staging, { recursive: true });
      writeFileSync(path.join(staging, "opsapp-main.db"), "plaintext");
    }
    mkdirSync(path.join(dir, "kept"));
    await SqliteSnapshot.sweep(dir);
    expect(readdirSync(dir).sort()).toEqual([path.basename(live), "kept"]);
  });

  test("sweeps a capture left by an earlier process under the same PID, and another host's once it stops writing", async () => {
    const dir = path.join(root, "sweep-hosts");
    const restarted = path.join(dir, `${SqliteSnapshot.stagingOwner(hostname(), process.pid, 1)}-abc`);
    const elsewhere = path.join(dir, `${SqliteSnapshot.stagingOwner("other-host", 1)}-def`);
    const idle = path.join(dir, `${SqliteSnapshot.stagingOwner("other-host", 1)}-ghi`);
    for (const staging of [restarted, elsewhere, idle]) {
      mkdirSync(staging, { recursive: true });
      writeFileSync(path.join(staging, "opsapp-main.db"), "plaintext");
    }
    const past = new Date(Date.now() - SqliteSnapshot.staleAfterMs - 60_000);
    for (const file of [path.join(idle, "opsapp-main.db"), idle]) utimesSync(file, past, past);
    await SqliteSnapshot.sweep(dir);
    expect(readdirSync(dir)).toEqual([path.basename(elsewhere)]);
  });

  test("restore refuses a manifest naming a file outside its own dir, or a role it does not know", async () => {
    const capture = await SqliteSnapshot.capture({
      id: "r1",
      dir: path.join(root, "snapshots"),
      sources: { main, solid },
    });
    const sources = { main: path.join(root, "restored-r1.db"), solid: null };
    const forge = (patch: Record<string, unknown>) => {
      const [file] = capture.manifest.files;
      writeFileSync(capture.manifestPath, JSON.stringify({ ...capture.manifest, files: [{ ...file, ...patch }] }));
    };
    for (const name of ["../opsapp-main.db.gz", "sub/opsapp-main.db.gz", "..", ""]) {
      forge({ name });
      await expect(SnapshotRestore.run({ manifestPath: capture.manifestPath, sources })).rejects.toThrow(
        "beside the manifest",
      );
    }
    forge({ role: "other" });
    await expect(SnapshotRestore.run({ manifestPath: capture.manifestPath, sources })).rejects.toThrow("Unknown");
    expect(existsSync(sources.main)).toBe(false);
  });

  test("restore with an identity refuses a manifest that records no encryption, unless told to allow it", async () => {
    const capture = await SqliteSnapshot.capture({
      id: "r2",
      dir: path.join(root, "snapshots"),
      sources: { main, solid },
    });
    const sources = { main: path.join(root, "restored-r2.db"), solid: null };
    const decryptor = await AgeEncryption.decryptor([AgeEncryption.generateIdentity().identity]);
    await expect(SnapshotRestore.run({ manifestPath: capture.manifestPath, sources, decryptor })).rejects.toThrow(
      "records no encryption",
    );
    expect(existsSync(sources.main)).toBe(false);
    await SnapshotRestore.run({ manifestPath: capture.manifestPath, sources, decryptor, allowPlaintext: true });
    expect(readRows(sources.main, "SELECT v FROM t")).toEqual([{ v: "committed" }]);
  });

  test("ops snapshot outside local operation refuses to write a snapshot unencrypted unless allowed", async () => {
    const saved = { recipient: process.env.AKAN_BACKUP_RECIPIENT, plaintext: process.env.AKAN_BACKUP_PLAINTEXT };
    delete process.env.AKAN_BACKUP_RECIPIENT;
    delete process.env.AKAN_BACKUP_PLAINTEXT;
    const out = path.join(root, "command");
    const argv = (id: string, ...extra: string[]) => ["snapshot", "--id", id, "--out", out, "--db", main, ...extra];
    try {
      const refused = await runCommand(argv("c1", "--json"));
      expect(refused.code).toBe(1);
      expect(refused.stderr).toContain("AKAN_BACKUP_RECIPIENT is unset");
      expect(existsSync(path.join(out, "c1"))).toBe(false);
      const allowed = await runCommand(argv("c2", "--allow-plaintext", "--json"));
      expect(allowed.code).toBe(0);
      expect(allowed.stderr).toContain("not encrypted");
      process.env.AKAN_BACKUP_PLAINTEXT = "1";
      expect((await runCommand(argv("c3", "--json"))).code).toBe(0);
    } finally {
      if (saved.recipient === undefined) delete process.env.AKAN_BACKUP_RECIPIENT;
      else process.env.AKAN_BACKUP_RECIPIENT = saved.recipient;
      if (saved.plaintext === undefined) delete process.env.AKAN_BACKUP_PLAINTEXT;
      else process.env.AKAN_BACKUP_PLAINTEXT = saved.plaintext;
    }
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
