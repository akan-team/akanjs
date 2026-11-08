import { Database } from "bun:sqlite";
import { createHash } from "node:crypto";
import { createReadStream, createWriteStream, existsSync } from "node:fs";
import { chmod, mkdir, mkdtemp, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { hostname } from "node:os";
import path from "node:path";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createGzip } from "node:zlib";
import { getEnv } from "../../base/baseEnv";
import { AppInfo } from "./appInfo";
import type {
  SnapshotEncryption,
  SnapshotFile,
  SnapshotFileRole,
  SnapshotManifest,
  SnapshotSources,
} from "./snapshotTypes";

export interface SnapshotEncryptor {
  readonly encryption: SnapshotEncryption;
  readonly extension: string;
  transform(): Transform;
}

export interface SnapshotCaptureOptions {
  id: string;
  dir: string;
  sources: SnapshotSources;
  includeSolid?: boolean;
  encryptor?: SnapshotEncryptor | null;
  fileMode?: number;
}

export interface SnapshotCapture {
  dir: string;
  manifest: SnapshotManifest;
  manifestPath: string;
  paths: { [role in SnapshotFileRole]?: string };
}

export class SqliteSnapshot {
  static readonly manifestName = "manifest.json";
  static readonly idPattern = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
  static readonly stagingPrefix = ".capture-";
  static staleAfterMs = 60 * 60 * 1000;
  static readonly #stagingName = /^\.capture-([0-9a-f]{8})\.(\d+)\.([0-9a-z]+)-/;

  static fileMode(value = process.env.AKAN_OPS_SNAPSHOT_FILE_MODE) {
    const raw = value?.trim();
    if (!raw) return 0o600;
    const mode = /^[0-7]{3,4}$/.test(raw) ? Number.parseInt(raw, 8) : 0;
    if (mode > 0 && mode <= 0o777) return mode;
    process.stderr.write(`AKAN_OPS_SNAPSHOT_FILE_MODE="${raw}" is not an octal mode such as 640; using 600\n`);
    return 0o600;
  }

  //? A restarted container's server is PID 1 again, and another host's PIDs mean nothing here: the name says whose it is.
  static stagingOwner(host = hostname(), pid = process.pid, startedAt = performance.timeOrigin) {
    const hostKey = createHash("sha256").update(host).digest("hex").slice(0, 8);
    return `${SqliteSnapshot.stagingPrefix}${hostKey}.${pid}.${Math.floor(startedAt).toString(36)}`;
  }

  //* Staged privately and renamed whole, so an `<id>/` is always complete; a killed capture's copy is left for `sweep`.
  static async capture({
    id,
    dir,
    sources,
    includeSolid = false,
    encryptor = null,
    fileMode = SqliteSnapshot.fileMode(),
  }: SnapshotCaptureOptions): Promise<SnapshotCapture> {
    if (!SqliteSnapshot.idPattern.test(id)) throw new Error(`Invalid snapshot id "${id}"`);
    const { appName, environment, databaseMode } = getEnv();
    if (databaseMode === "cluster" || !databaseMode)
      throw new Error(`Snapshots support SQLite database modes only, not "${databaseMode ?? "unknown"}"`);
    const targetDir = path.join(dir, id);
    if (existsSync(targetDir)) throw new Error(`Snapshot ${id} already exists at ${targetDir}`);
    await mkdir(dir, { recursive: true });
    await SqliteSnapshot.sweep(dir);
    const staging = await mkdtemp(path.join(dir, `${SqliteSnapshot.stagingOwner()}-`));
    try {
      const roles: [SnapshotFileRole, string][] = [["main", sources.main]];
      if (includeSolid && sources.solid) roles.push(["solid", sources.solid]);
      const files: SnapshotFile[] = [];
      const integrity: string[] = [];
      const paths: SnapshotCapture["paths"] = {};
      for (const [role, source] of roles) {
        const { file, problems } = await SqliteSnapshot.#captureOne(role, source, staging, encryptor, fileMode);
        files.push(file);
        paths[role] = path.join(targetDir, file.name);
        integrity.push(...problems.map((problem) => `${role}: ${problem}`));
      }
      const { akanVersion, buildId } = AppInfo.build();
      const manifest: SnapshotManifest = {
        format: "akan-snapshot/v1",
        id,
        appName,
        environment,
        akanVersion,
        buildId,
        databaseMode,
        createdAt: new Date().toISOString(),
        files,
        integrity: integrity.length ? integrity : "ok",
        encryption: encryptor?.encryption ?? null,
      };
      await writeFile(path.join(staging, SqliteSnapshot.manifestName), `${JSON.stringify(manifest, null, 2)}\n`, {
        mode: fileMode,
      });
      //? mkdtemp made it 0700; a wider file mode also opens the directory to whoever may read the files.
      await chmod(staging, fileMode | ((fileMode & 0o444) >> 2));
      await rename(staging, targetDir);
      return { dir: targetDir, manifest, manifestPath: path.join(targetDir, SqliteSnapshot.manifestName), paths };
    } catch (error) {
      await rm(staging, { recursive: true, force: true });
      throw error;
    }
  }

  static async sweep(dir: string) {
    const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
    const staged = entries.filter(
      (entry) => entry.isDirectory() && entry.name.startsWith(SqliteSnapshot.stagingPrefix),
    );
    await Promise.all(
      staged.map(async (entry) => {
        const staging = path.join(dir, entry.name);
        if (await SqliteSnapshot.#abandoned(entry.name, staging))
          await rm(staging, { recursive: true, force: true }).catch(() => undefined);
      }),
    );
  }

  //? Another host's capture is judged by its writes: a capture writes its copy as it goes, and none pauses that long.
  static async #abandoned(name: string, staging: string) {
    const [, hostKey, pid, startedAt] = SqliteSnapshot.#stagingName.exec(name) ?? [];
    const [, ownHost, ownPid, ownStart] = SqliteSnapshot.#stagingName.exec(`${SqliteSnapshot.stagingOwner()}-`) ?? [];
    if (hostKey && hostKey === ownHost) {
      if (pid === ownPid) return startedAt !== ownStart;
      if (!SqliteSnapshot.#alive(Number(pid))) return true;
    }
    return Date.now() - (await SqliteSnapshot.#lastWrite(staging)) > SqliteSnapshot.staleAfterMs;
  }

  static async #lastWrite(staging: string) {
    const names = await readdir(staging).catch(() => []);
    const files = [staging, ...names.map((name) => path.join(staging, name))];
    const stats = await Promise.all(files.map((file) => stat(file).catch(() => null)));
    return Math.max(0, ...stats.map((stats) => stats?.mtimeMs ?? 0));
  }

  static #alive(pid: number) {
    if (!Number.isInteger(pid) || pid <= 0) return false;
    try {
      process.kill(pid, 0);
      return true;
    } catch (error) {
      return (error as NodeJS.ErrnoException).code === "EPERM";
    }
  }

  static async #captureOne(
    role: SnapshotFileRole,
    source: string,
    dir: string,
    encryptor: SnapshotEncryptor | null,
    fileMode: number,
  ) {
    if (!existsSync(source)) throw new Error(`No ${role} database at ${source}`);
    const baseName = path.basename(source);
    const rawPath = path.join(dir, baseName);
    const name = `${baseName}.gz${encryptor?.extension ?? ""}`;
    const sourceHash = createHash("sha256");
    const uploadHash = createHash("sha256");
    let problems: string[];
    let sizeBytes: number;
    try {
      SqliteSnapshot.vacuumInto(source, rawPath);
      await chmod(rawPath, 0o600);
      problems = SqliteSnapshot.integrityProblems(rawPath);
      sizeBytes = (await stat(rawPath)).size;
      const stages: NodeJS.ReadWriteStream[] = [SqliteSnapshot.tap(sourceHash), createGzip()];
      if (encryptor) stages.push(encryptor.transform());
      stages.push(SqliteSnapshot.tap(uploadHash));
      const packed = createWriteStream(path.join(dir, name), { mode: fileMode });
      await pipeline([createReadStream(rawPath), ...stages, packed]);
    } finally {
      await rm(rawPath, { force: true });
    }
    const packedPath = path.join(dir, name);
    const file: SnapshotFile = {
      role,
      name,
      sizeBytes,
      sha256: sourceHash.digest("hex"),
      encoding: "gzip",
      uploadBytes: (await stat(packedPath)).size,
      uploadSha256: uploadHash.digest("hex"),
    };
    return { file, problems, packedPath };
  }

  //* Readonly on purpose: a read-write connection gets SQLITE_MISUSE for VACUUM INTO on a WAL db another process holds.
  static vacuumInto(source: string, target: string) {
    const db = new Database(source, { readonly: true });
    try {
      db.run(`VACUUM INTO '${target.replaceAll("'", "''")}'`);
    } finally {
      db.close();
    }
  }

  static integrityProblems(file: string): string[] {
    const db = new Database(file, { readonly: true });
    try {
      const rows = db.query("PRAGMA integrity_check").all() as { integrity_check: string }[];
      const messages = rows.map((row) => row.integrity_check);
      return messages.length === 1 && messages[0] === "ok" ? [] : messages;
    } finally {
      db.close();
    }
  }

  static tap(hash: ReturnType<typeof createHash>) {
    return new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        hash.update(chunk);
        callback(null, chunk);
      },
    });
  }
}
