import { lstat, stat } from "node:fs/promises";
import { Logger } from "akanjs/common";

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
  static async writeJson(path: string, content: object) {
    return await Bun.file(path).write(`${JSON.stringify(content, null, 2)}\n`);
  }
}
