import { Database } from "bun:sqlite";
import { createHash } from "node:crypto";
import { createReadStream, createWriteStream, existsSync } from "node:fs";
import { mkdir, rm, stat, writeFile } from "node:fs/promises";
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

  static assertId(id: string) {
    if (!SqliteSnapshot.idPattern.test(id)) throw new Error(`Invalid snapshot id "${id}"`);
  }

  static async capture({
    id,
    dir,
    sources,
    includeSolid = false,
    encryptor = null,
  }: SnapshotCaptureOptions): Promise<SnapshotCapture> {
    SqliteSnapshot.assertId(id);
    const { appName, environment, databaseMode } = getEnv();
    if (databaseMode === "cluster" || !databaseMode)
      throw new Error(`Snapshots support SQLite database modes only, not "${databaseMode ?? "unknown"}"`);
    const targetDir = path.join(dir, id);
    if (existsSync(targetDir)) throw new Error(`Snapshot ${id} already exists at ${targetDir}`);
    await mkdir(targetDir, { recursive: true });
    try {
      const roles: [SnapshotFileRole, string][] = [["main", sources.main]];
      if (includeSolid && sources.solid) roles.push(["solid", sources.solid]);
      const files: SnapshotFile[] = [];
      const integrity: string[] = [];
      const paths: SnapshotCapture["paths"] = {};
      for (const [role, source] of roles) {
        const { file, problems, packedPath } = await SqliteSnapshot.#captureOne(role, source, targetDir, encryptor);
        files.push(file);
        paths[role] = packedPath;
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
      const manifestPath = path.join(targetDir, SqliteSnapshot.manifestName);
      await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
      return { dir: targetDir, manifest, manifestPath, paths };
    } catch (error) {
      await rm(targetDir, { recursive: true, force: true });
      throw error;
    }
  }

  static async #captureOne(role: SnapshotFileRole, source: string, dir: string, encryptor: SnapshotEncryptor | null) {
    if (!existsSync(source)) throw new Error(`No ${role} database at ${source}`);
    const baseName = path.basename(source);
    const rawPath = path.join(dir, baseName);
    SqliteSnapshot.vacuumInto(source, rawPath);
    const problems = SqliteSnapshot.integrityProblems(rawPath);
    const sizeBytes = (await stat(rawPath)).size;
    const name = `${baseName}.gz${encryptor?.extension ?? ""}`;
    const packedPath = path.join(dir, name);
    const sourceHash = createHash("sha256");
    const uploadHash = createHash("sha256");
    const stages: NodeJS.ReadWriteStream[] = [SqliteSnapshot.#tap(sourceHash), createGzip()];
    if (encryptor) stages.push(encryptor.transform());
    stages.push(SqliteSnapshot.#tap(uploadHash));
    await pipeline([createReadStream(rawPath), ...stages, createWriteStream(packedPath)]);
    await rm(rawPath, { force: true });
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

  //* A readonly second connection reads the last committed state alongside an open write transaction; a read-write
  //* one returns SQLITE_MISUSE for VACUUM INTO against a WAL database another process holds.
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

  static #tap(hash: ReturnType<typeof createHash>) {
    return new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        hash.update(chunk);
        callback(null, chunk);
      },
    });
  }
}
