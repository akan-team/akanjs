import { lstat, rename, rm, stat } from "node:fs/promises";
import nodePath from "node:path";
import { fileURLToPath } from "node:url";
import { Logger } from "akanjs/common";

export const getDirname = (url: string) => nodePath.dirname(fileURLToPath(url));

export class FileSys {
  static logger = new Logger("FileSys");
  static async fileExists(path: string) {
    return await Bun.file(path).exists();
  }
  static async dirExists(path: string) {
    return await stat(path)
      .then((stat) => stat.isDirectory())
      .catch(() => false);
  }
  static async exists(path: string) {
    return await stat(path)
      .then(() => true)
      .catch(() => false);
  }
  //* Unlike `exists`, this reports a symlink whose target is gone, so stale links can be cleaned up.
  static async entryExists(path: string) {
    return await lstat(path)
      .then(() => true)
      .catch(() => false);
  }
  static async readText(path: string) {
    return await Bun.file(path).text();
  }
  static async readJson<T>(path: string): Promise<T> {
    try {
      return (await Bun.file(path).json()) as T;
    } catch (error) {
      FileSys.logger.error(`Failed to read JSON file: ${path}`);
      throw error;
    }
  }
  static async delete(path: string) {
    return await Bun.file(path).delete();
  }
  static async writeText(path: string, content: string) {
    return await Bun.file(path).write(content);
  }
  // One `rename`, so a watcher never reads a half-written barrel as a user edit. The temp is a sibling (rename is atomic
  // only within a filesystem), and its `.tmp` suffix is what `HmrChangeClassifier` ignores it by.
  static async writeTextAtomic(filePath: string, content: string) {
    const temp = `${filePath}.${process.pid}.${Date.now().toString(36)}.tmp`;
    try {
      await Bun.write(temp, content);
      await FileSys.replace(temp, filePath);
    } catch (error) {
      await rm(temp, { force: true }).catch(() => undefined);
      throw error;
    }
  }
  static readonly #replaceAttempts = 100;
  // Windows refuses to rename over a file another process has open (EPERM, or EACCES/EBUSY). A reader holds it for one
  // read, so the rename is retried for a few seconds instead of failing.
  static async replace(temp: string, target: string) {
    for (let attempt = 1; ; attempt++) {
      try {
        return await rename(temp, target);
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        const busy = process.platform === "win32" && (code === "EPERM" || code === "EACCES" || code === "EBUSY");
        if (!busy || attempt >= FileSys.#replaceAttempts) throw error;
        await Bun.sleep(Math.min(10 * attempt, 50));
      }
    }
  }
  static async writeJson(path: string, content: object) {
    return await Bun.file(path).write(`${JSON.stringify(content, null, 2)}\n`);
  }
}
