import { mkdir, rm } from "node:fs/promises";
import { dayjs } from "akanjs/base";
import { createDocumentId } from "akanjs/document";
import type { LocalFile } from "akanjs/server";

import { Err } from "../lib/dict";
import { writeReadableStreamToFile } from "./storageApi/writeReadableStreamToFile";

/**
 * 마지막 수신 이후 이 시간 동안 한 바이트도 들어오지 않으면 끊긴 것으로 본다.
 * 총 소요시간에 상한을 두면 느린 회선에서 정상 다운로드까지 죽어버리므로, 무응답 시간만 본다.
 */
export const DEFAULT_DOWNLOAD_STALL_TIMEOUT = 120 * 1000;

export interface WriteStreamToFileOptions {
  /** 이미 같은 경로에 파일이 있으면 그걸 그대로 쓴다 */
  cache?: boolean;
  rename?: string;
  /** 받은 바이트가 늘어날 때마다 호출된다. total 은 content-length 를 모르면 0 */
  onProgress?: (loaded: number, total: number) => void;
  /** 진행률 표시용 총 바이트. content-length 를 아는 호출자가 넘겨준다 */
  totalBytes?: number;
  /** 다운로드를 중간에 끊기 위한 신호 */
  signal?: AbortSignal;
  /** 무응답 한도(ms). 0 이면 감시하지 않는다 */
  stallTimeout?: number;
}

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
  static async removeFile(localFile: string | LocalFile) {
    const localPath = typeof localFile === "string" ? localFile : localFile.localPath;
    await rm(localPath, { force: true });
  }
  /** content-length 까지 함께 돌려준다. 서버가 알려주지 않으면 totalBytes 는 0 */
  static async readUrlAsStreamWithSize(url: string, init?: RequestInit) {
    const response = await fetch(url, init);
    if (!response.ok || !response.body) throw new Err("util.error.noResponseBody");
    const contentLength = Number(response.headers.get("content-length"));
    return {
      readStream: response.body,
      totalBytes: Number.isFinite(contentLength) && contentLength > 0 ? contentLength : 0,
    };
  }
  static async readUrlAsStream(url: string, init?: RequestInit): Promise<ReadableStream> {
    return (await FileManager.readUrlAsStreamWithSize(url, init)).readStream;
  }
  static async writeStreamToFile(
    readStream: ReadableStream,
    localPath: string,
    {
      cache,
      rename,
      onProgress,
      totalBytes = 0,
      signal,
      stallTimeout = DEFAULT_DOWNLOAD_STALL_TIMEOUT,
    }: WriteStreamToFileOptions = {},
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
    try {
      await writeReadableStreamToFile(localPath, readStream, {
        signal,
        stallTimeout,
        onChunk: onProgress ? (loaded) => onProgress(loaded, totalBytes) : undefined,
      });
    } catch (error) {
      // 실패한 다운로드가 남긴 조각 파일은 지운다. 그대로 두면 cache 옵션이 잘린 파일을 집는다
      await FileManager.removeFile(localPath);
      throw error;
    }
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
