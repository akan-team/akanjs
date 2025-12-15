import { dayjs } from "@akanjs/base";
import { Id } from "@akanjs/document";
import { type LocalFile } from "@akanjs/server";
import axios, { type AxiosRequestConfig } from "axios";
import fs from "fs";

export class FileManager {
  static async getFileStat(localFile: string | LocalFile) {
    const localPath = typeof localFile === "string" ? localFile : localFile.localPath;
    const { size, mtime } = await fs.promises.stat(localPath);
    return { size, lastModifiedAt: dayjs(mtime) };
  }
  static async readFileAsBuffer(localFile: string | LocalFile) {
    const localPath = typeof localFile === "string" ? localFile : localFile.localPath;
    return await fs.promises.readFile(localPath);
  }
  static readFileAsStream(localFile: string | LocalFile, options?: BufferEncoding | { start: number; end: number }) {
    const localPath = typeof localFile === "string" ? localFile : localFile.localPath;
    return fs.createReadStream(localPath, options);
  }
  static async readUrlAsStream(url: string, header?: AxiosRequestConfig) {
    return (await axios.get<fs.ReadStream>(url, { ...header, responseType: "stream" })).data;
  }
  static writeStreamToFile(
    readStream: fs.ReadStream,
    localPath: string,
    { cache, rename, header }: { cache?: boolean; rename?: string; header?: AxiosRequestConfig } = {}
  ): Promise<LocalFile> | LocalFile {
    const filename = rename ?? localPath.split("/").pop();
    const dirname = localPath.split("/").slice(0, -1).join("/");
    if (!filename) throw new Error(`Filename is required for local path: ${localPath}`);
    if (cache && fs.existsSync(localPath)) {
      const stat = fs.statSync(localPath);
      const fileMeta = { size: stat.size, lastModifiedAt: dayjs(stat.mtime) };
      return { filename, localPath, mimetype: this.#getMimetype(filename), encoding: "7bit", ...fileMeta };
    }
    if (!fs.existsSync(dirname)) fs.mkdirSync(dirname, { recursive: true });
    const writeStream = readStream.pipe(fs.createWriteStream(localPath) as unknown as NodeJS.WritableStream);
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject("File Download Timeout");
      }, 6000000);
      writeStream.on("finish", () => {
        clearTimeout(timeout);
        const stat = fs.statSync(localPath);
        const fileMeta = { size: stat.size, lastModifiedAt: dayjs(stat.mtime) };
        resolve({ filename, encoding: "7bit", mimetype: this.#getMimetype(filename), localPath, ...fileMeta });
        writeStream.end();
      });
    });
  }
  static saveEncodedData(data: string, dirname: string): LocalFile {
    const mimetype = data.split(";")[0].replace("data:", "");
    const encoding = data.split(",")[0].split(";")[1] as "base64" | "utf-8";
    const encoded = data.split(",")[1];
    const extension = mimetype.split("/")[1].split("+")[0];
    const filename = `${new Id().toString()}.${extension}`;
    const localPath = `${dirname}/${filename}`;
    const stat = fs.statSync(localPath);
    const fileMeta = { size: stat.size, lastModifiedAt: dayjs(stat.mtime) };
    fs.writeFileSync(localPath, Buffer.from(encoded, encoding).toString());
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
