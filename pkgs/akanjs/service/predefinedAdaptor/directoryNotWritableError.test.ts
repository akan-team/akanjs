import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { chmodSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { SqliteDatabase } from "./database.adaptor";
import { DirectoryNotWritableError } from "./directoryNotWritableError";
import { getSolidConfig, openSolidDatabase } from "./solidSqlite";
import { BlobStorage } from "./storage.adaptor";

const uid = process.getuid?.();
const refusedFor = async (run: () => unknown) => {
  try {
    await run();
  } catch (error) {
    return error;
  }
  return null;
};

test("names the directory, its owner, the server's uid and the chown that fixes a volume root left", () => {
  const error = new DirectoryNotWritableError("/workspace/sqlite", 0, 1000, 1000);
  expect(error.code).toBe("directoryNotWritable");
  expect(error.message).toContain("runs as uid 1000 and cannot write /workspace/sqlite, which uid 0 owns");
  expect(error.message).toContain("docker compose run --rm -u 0 <service> chown -R 1000:1000 /workspace/sqlite");
  expect(error.message).toContain("volumePermissions.enabled");
});

describe.skipIf(uid === undefined || uid === 0)("a directory the server cannot write fails the boot", () => {
  let dir: string;
  let readOnly: string;
  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), "akan-unwritable-"));
    readOnly = path.join(dir, "sqlite");
    Bun.spawnSync(["mkdir", readOnly]);
    chmodSync(readOnly, 0o555);
  });
  afterEach(() => {
    chmodSync(readOnly, 0o755);
    rmSync(dir, { recursive: true, force: true });
  });
  const expectRefused = (error: unknown, target = readOnly) => {
    expect(DirectoryNotWritableError.is(error, "directoryNotWritable")).toBe(true);
    expect((error as Error).message).toContain(`runs as uid ${uid} and cannot write ${target}, which uid ${uid} owns`);
    expect((error as Error).message).toContain(`chmod u+rwx ${target}`);
  };

  test("SqliteDatabase, before it opens the file", async () => {
    const database = Object.assign(new SqliteDatabase(), { config: { filePath: path.join(readOnly, "app.db") } });
    expectRefused(await refusedFor(() => database.onInit()));
  });

  test("the solid SQLite file", async () => {
    const config = {
      ...getSolidConfig({ solid: { filePath: "unused.db" } }),
      filePath: path.join(readOnly, "_solid.db"),
    };
    expectRefused(await refusedFor(() => openSolidDatabase(config)));
  });

  test("BlobStorage, at the nearest directory of its roots that exists", async () => {
    const storage = Object.assign(new BlobStorage(), {
      root: path.join(dir, "local/app/backend"),
      privateRoot: path.join(readOnly, "app/server-private"),
    });
    expectRefused(await refusedFor(() => storage.onInit()));
  });

  test("passes a writable directory and an in-memory database", async () => {
    chmodSync(readOnly, 0o755);
    const storage = Object.assign(new BlobStorage(), {
      root: path.join(readOnly, "app/backend"),
      privateRoot: path.join(readOnly, "app/server-private"),
    });
    expect(await refusedFor(() => storage.onInit())).toBeNull();
    expect(await refusedFor(() => DirectoryNotWritableError.assertFileDir(":memory:"))).toBeNull();
  });
});
