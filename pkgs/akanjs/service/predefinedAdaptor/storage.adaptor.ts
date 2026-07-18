import { renameSync } from "node:fs";
import type { BaseEnv } from "akanjs/base";
import { adapt } from "../adapt";

export interface DownloadRequest {
  path: string;
  localPath: string;
  renamePath?: string;
}
export interface LocalFilePath {
  localPath: string;
}
export interface UploadRequest {
  path: string;
  localPath: string;
  meta?: { [key: string]: string };
  rename?: string;
  host?: string;
  access?: "public" | "private";
}
export interface CopyRequest {
  bucket: string;
  copyPath: string;
  pastePath: string;
  filename: string;
  host?: string;
}
export interface UploadFromStreamRequest {
  path: string;
  body: ReadableStream;
  mimetype: string;
  root?: string;
  access?: "public" | "private";
  updateProgress: (progress: { loaded?: number; total?: number; part?: number }) => void;
  uploadSuccess: (url: string) => void;
}
export interface UploadProgress {
  loaded?: number;
  total?: number;
  part?: number;
}

export interface StorageAdaptor {
  readData(path: string): Promise<ReadableStream>;
  readDataAsJson<T>(path: string): Promise<T>;
  getDataList(prefix?: string): Promise<string[]>;
  uploadDataFromLocal(request: UploadRequest): Promise<string>;
  uploadDataFromStream(request: UploadFromStreamRequest): void;
  saveData(request: DownloadRequest): Promise<LocalFilePath>;
  copyData(request: CopyRequest): Promise<string>;
  deleteData(url: string): Promise<boolean>;
  deleteDataByPath(path: string): Promise<boolean>;
}

export interface BlobStorageOptions extends BaseEnv {
  blobStorage?: { baseDir?: string; privateBaseDir?: string; urlPrefix?: string };
}

export class BlobStorage
  extends adapt("blobStorage", ({ env }) => ({
    root: env(
      ({ appName, blobStorage = { baseDir: "local", urlPrefix: "/api/localFile/getBlob" } }: BlobStorageOptions) =>
        `${process.env.AKAN_WORKSPACE_ROOT ?? "."}/${blobStorage.baseDir ?? "local"}/${appName}/backend`,
    ),
    privateRoot: env(
      ({ appName, blobStorage = { privateBaseDir: "local" } }: BlobStorageOptions) =>
        `${process.env.AKAN_WORKSPACE_ROOT ?? "."}/${blobStorage.privateBaseDir ?? "local"}/${appName}/server-private`,
    ),
    urlPrefix: env(
      ({ blobStorage = { urlPrefix: "/api/localFile/getBlob" } }: BlobStorageOptions) => blobStorage.urlPrefix,
    ),
  }))
  implements StorageAdaptor
{
  #localPathToUrl(path: string) {
    return `${this.urlPrefix}/${path}`;
  }
  #resolveFilePath(path: string) {
    return path.startsWith("private/") ? `${this.privateRoot}/${path}` : `${this.root}/${path}`;
  }
  async readData(path: string): Promise<ReadableStream> {
    const filePath = this.#resolveFilePath(path);
    return Bun.file(filePath).stream();
  }
  async readDataAsJson<T>(path: string) {
    const filePath = this.#resolveFilePath(path);
    return Bun.file(filePath).json() as T;
  }
  async getDataList(prefix?: string) {
    const dir = `${this.root}${prefix ? `/${prefix}` : ""}`;
    const paths = Array.from(new Bun.Glob("*").scanSync({ cwd: dir, onlyFiles: false }));
    return paths.map((path) => this.#localPathToUrl(path));
  }
  async uploadDataFromLocal({ path, localPath, meta, access = "public" }: UploadRequest) {
    const filePath = access === "private" ? `${this.privateRoot}/${path}` : `${this.root}/${path}`;
    await Bun.write(filePath, Bun.file(localPath));
    if (meta) await Bun.write(`${filePath}.meta`, JSON.stringify(meta));
    return this.#localPathToUrl(path);
  }
  async uploadDataFromStream({
    path,
    body,
    mimetype,
    updateProgress,
    uploadSuccess,
    access = "public",
  }: UploadFromStreamRequest) {
    const filePath = access === "private" ? `${this.privateRoot}/${path}` : `${this.root}/${path}`;
    try {
      await Bun.write(filePath, new Response(body));
      uploadSuccess(this.#localPathToUrl(path));
    } catch (error) {
      this.logger.error(error instanceof Error ? error.message : String(error));
    }
  }
  async saveData({ path, localPath, renamePath }: DownloadRequest): Promise<LocalFilePath> {
    const data = await this.readData(path);
    await Bun.write(localPath, new Response(data));
    if (renamePath) renameSync(localPath, renamePath);
    return { localPath: renamePath ?? localPath };
  }
  async copyData({ copyPath, pastePath, host }: CopyRequest) {
    await Bun.write(`${this.root}/${pastePath}`, Bun.file(`${this.root}/${copyPath}`));
    return pastePath;
  }
  async deleteDataByPath(path: string) {
    try {
      await Bun.file(this.#resolveFilePath(path)).delete();
      return true;
    } catch (error) {
      this.logger.error(error instanceof Error ? error.message : "Unknown error");
      return false;
    }
  }
  async deleteData(url: string) {
    try {
      const basePath = this.#localPathToUrl("");
      if (!url.startsWith(basePath)) throw new Error("Invalid Base URL, Unable to delete data");
      const path = url.replace(basePath, "");
      await this.deleteDataByPath(path);
      return true;
    } catch (error) {
      this.logger.error(error instanceof Error ? error.message : "Unknown error");
      return false;
    }
  }
}
