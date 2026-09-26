import { createHash } from "node:crypto";
import { createReadStream, createWriteStream, existsSync } from "node:fs";
import { readFile, rename, rm } from "node:fs/promises";
import path from "node:path";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createGunzip } from "node:zlib";
import type { SnapshotFile, SnapshotManifest, SnapshotSources } from "./snapshotTypes";
import { SqliteSnapshot } from "./sqliteSnapshot";

export interface SnapshotDecryptor {
  transform(): Transform;
}

export interface SnapshotRestoreOptions {
  manifestPath: string;
  sources: SnapshotSources;
  decryptor?: SnapshotDecryptor | null;
  now?: Date;
}

export interface RestoredFile {
  role: SnapshotFile["role"];
  target: string;
  preservedAs: string | null;
}

interface StagedFile {
  file: SnapshotFile;
  target: string;
  staged: string;
}

/** Offline only: it swaps files under a closed database, and nothing here can tell an open connection to let go. */
export class SnapshotRestore {
  static async run({ manifestPath, sources, decryptor = null, now = new Date() }: SnapshotRestoreOptions) {
    const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as SnapshotManifest;
    if (manifest.format !== "akan-snapshot/v1") throw new Error(`Unknown snapshot format "${String(manifest.format)}"`);
    const dir = path.dirname(manifestPath);
    const stamp = now.toISOString().replace(/[:.]/g, "-");
    const staged: StagedFile[] = [];
    try {
      for (const file of manifest.files) {
        const target = file.role === "main" ? sources.main : sources.solid;
        if (!target) throw new Error(`This deployment has no ${file.role} database to restore into`);
        staged.push({
          file,
          target,
          staged: await SnapshotRestore.#stage(file, dir, target, stamp, manifest, decryptor),
        });
      }
    } catch (error) {
      await Promise.all(staged.map(({ staged: file }) => rm(file, { force: true })));
      throw error;
    }
    const restored: RestoredFile[] = [];
    for (const { file, target, staged: stagedPath } of staged) {
      const preservedAs = await SnapshotRestore.#preserve(target, stamp);
      await rename(stagedPath, target);
      restored.push({ role: file.role, target, preservedAs });
    }
    return { manifest, restored };
  }

  static async #stage(
    file: SnapshotFile,
    dir: string,
    target: string,
    stamp: string,
    manifest: SnapshotManifest,
    decryptor: SnapshotDecryptor | null,
  ) {
    const packed = path.join(dir, file.name);
    const decryptedName = manifest.encryption ? file.name.replace(/\.age$/, "") : null;
    //* An operator who already ran `age -d -o <name without .age>` restores without handing the identity to the app.
    const predecrypted = decryptedName && !decryptor ? path.join(dir, decryptedName) : null;
    if (predecrypted && !existsSync(predecrypted))
      throw new Error(`${file.name} is encrypted; pass --identity or run age -d -o ${decryptedName} first`);
    const input = predecrypted ?? packed;
    if (!existsSync(input)) throw new Error(`Snapshot file missing: ${input}`);
    if (!predecrypted) {
      const uploadSha = await SnapshotRestore.#sha256(input);
      if (uploadSha !== file.uploadSha256) throw new Error(`${file.name} does not match its manifest checksum`);
    }
    const stagedPath = `${target}.restore-${stamp}.tmp`;
    const hash = createHash("sha256");
    const stages: NodeJS.ReadWriteStream[] = [];
    if (manifest.encryption && decryptor && !predecrypted) stages.push(decryptor.transform());
    stages.push(createGunzip(), SnapshotRestore.#tap(hash));
    await pipeline([createReadStream(input), ...stages, createWriteStream(stagedPath)]);
    if (hash.digest("hex") !== file.sha256) {
      await rm(stagedPath, { force: true });
      throw new Error(`${file.name} decompressed to different bytes than the snapshot recorded`);
    }
    const problems = SqliteSnapshot.integrityProblems(stagedPath);
    if (problems.length) {
      await rm(stagedPath, { force: true });
      throw new Error(`${file.name} fails integrity_check: ${problems.slice(0, 3).join("; ")}`);
    }
    return stagedPath;
  }

  //* The old -wal/-shm travel with the old file under the same prefix: left in place they would be replayed into the
  //* restored database, and moved together they still open as the consistent pre-restore state.
  static async #preserve(target: string, stamp: string) {
    if (!existsSync(target)) return null;
    const preserved = `${target}.pre-restore-${stamp}`;
    await rename(target, preserved);
    for (const suffix of ["-wal", "-shm"]) {
      if (existsSync(`${target}${suffix}`)) await rename(`${target}${suffix}`, `${preserved}${suffix}`);
    }
    return preserved;
  }

  static async #sha256(file: string) {
    const hash = createHash("sha256");
    for await (const chunk of createReadStream(file)) hash.update(chunk as Buffer);
    return hash.digest("hex");
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
