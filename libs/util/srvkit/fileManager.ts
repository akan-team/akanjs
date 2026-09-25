import { mkdir } from "node:fs/promises";
import { dayjs } from "akanjs/base";
import { Id } from "akanjs/document";
import type { LocalFile } from "akanjs/server";

import { Err } from "../lib/dict";

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
    if (!Bun.file(dirname).exists()) await mkdir(dirname, { recursive: true });
    await Bun.write(localPath, new Response(readStream));
    const stat = await Bun.file(localPath).stat();
    const fileMeta = { size: stat.size, lastModifiedAt: dayjs(stat.mtime) };
    return { filename, encoding: "7bit", mimetype: FileManager.#getMimetype(filename), localPath, ...fileMeta };
  }
  static async saveEncodedData(data: string, dirname: string): Promise<LocalFile> {
    const mimetype = data.split(";")[0]?.replace("data:", "") ?? "";
    const encoding = (data.split(",")[0]?.split(";")[1] as "base64" | "utf-8") ?? "utf-8";
    const encoded = data.split(",")[1] ?? "";
    const extension = mimetype?.split("/")[1]?.split("+")[0];
    const filename = `${new Id().toString()}.${extension}`;
    const localPath = `${dirname}/${filename}`;
    if (!Bun.file(dirname).exists()) await mkdir(dirname, { recursive: true });
    await Bun.write(localPath, Buffer.from(encoded, encoding).toString());
    const stat = await Bun.file(localPath).stat();
    const fileMeta = { size: stat.size, lastModifiedAt: dayjs(stat.mtime) };
    return { filename, encoding: "7bit", mimetype, localPath, ...fileMeta };
  }
  static #getMimetype(filename: string) {
    return filename.includes(".png")
      ? "image/png"
      : filename.includes(".jpg")
        ? "image/jpeg"
        : filename.includes(".jpeg")
          ? "image/jpeg"
          : filename.includes(".jfif")
            ? "image/jfif"
            : filename.includes(".gif")
              ? "image/gif"
              : filename.includes(".webp")
                ? "image/webp"
                : filename.includes(".avif")
                  ? "image/avif"
                  : "unknown";
  }
}
