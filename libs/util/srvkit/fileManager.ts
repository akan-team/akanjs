import { mkdir } from "node:fs/promises";
import { dayjs } from "akanjs/base";
import { createDocumentId } from "akanjs/document";
import type { LocalFile } from "akanjs/server";

import { Err } from "../lib/dict";
import { writeReadableStreamToFile } from "./storageApi/writeReadableStreamToFile";

export class FileManager {
  static async getFileStat(localFile: string | LocalFile) {
    const localPath = typeof localFile === "string" ? localFile : localFile.localPath;
    const stat = await Bun.file(localPath).stat();
    return { size: stat.size, lastModifiedAt: dayjs(stat.mtime) };
  }
  static async readFileAsBuffer(localFile: string | LocalFile) {
    const localPath = typeof localFile === "string" ? localFile : localFile.localPath;
    return Buffer.from(await Bun.file(localPath).arrayBuffer());
  }
  static readFileAsStream(localFile: string | LocalFile): ReadableStream {
    const localPath = typeof localFile === "string" ? localFile : localFile.localPath;
    return Bun.file(localPath).stream();
  }
  static async readUrlAsStream(url: string, init?: RequestInit): Promise<ReadableStream> {
    const response = await fetch(url, init);
    if (!response.ok) throw new Err("util.error.noResponseBody");
    if (!response.body) throw new Err("util.error.noResponseBody");
    return response.body;
  }
  static async writeStreamToFile(
    readStream: ReadableStream,
    localPath: string,
    { cache, rename }: { cache?: boolean; rename?: string } = {},
  ): Promise<LocalFile> {
    const filename = rename ?? localPath.split("/").pop();
    const dirname = localPath.split("/").slice(0, -1).join("/");
    if (!filename) throw new Err("util.error.filenameRequired", { localPath });
    if (cache && (await Bun.file(localPath).exists())) {
      const stat = await Bun.file(localPath).stat();
      const fileMeta = { size: stat.size, lastModifiedAt: dayjs(stat.mtime) };
      return { filename, localPath, mimetype: FileManager.#getMimetype(filename), encoding: "7bit", ...fileMeta };
    }
    if (!(await Bun.file(dirname).exists())) await mkdir(dirname, { recursive: true });
    await writeReadableStreamToFile(localPath, readStream);
    const stat = await Bun.file(localPath).stat();
    const fileMeta = { size: stat.size, lastModifiedAt: dayjs(stat.mtime) };
    return { filename, encoding: "7bit", mimetype: FileManager.#getMimetype(filename), localPath, ...fileMeta };
  }
  static async saveEncodedData(data: string, dirname: string): Promise<LocalFile> {
    const mimetype = data.split(";")[0]?.replace("data:", "") ?? "";
    const encoding = (data.split(",")[0]?.split(";")[1] as "base64" | "utf-8" | undefined) || "utf-8";
    const encoded = data.split(",")[1] ?? "";
    const extension = mimetype.split("/")[1]?.split("+")[0] || "bin";
    const filename = `${createDocumentId()}.${extension}`;
    const localPath = `${dirname}/${filename}`;
    if (!(await Bun.file(dirname).exists())) await mkdir(dirname, { recursive: true });
    await Bun.write(localPath, Buffer.from(encoded, encoding));
    const stat = await Bun.file(localPath).stat();
    const fileMeta = { size: stat.size, lastModifiedAt: dayjs(stat.mtime) };
    return { filename, encoding: "7bit", mimetype, localPath, ...fileMeta };
  }
  static #getMimetype(filename: string) {
    const lower = filename.toLowerCase();
    if (lower.endsWith(".png")) return "image/png";
    if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
    if (lower.endsWith(".jfif")) return "image/jfif";
    if (lower.endsWith(".gif")) return "image/gif";
    if (lower.endsWith(".webp")) return "image/webp";
    if (lower.endsWith(".avif")) return "image/avif";
    if (lower.endsWith(".mp4")) return "video/mp4";
    if (lower.endsWith(".webm")) return "video/webm";
    if (lower.endsWith(".mov")) return "video/quicktime";
    return "unknown";
  }
}
