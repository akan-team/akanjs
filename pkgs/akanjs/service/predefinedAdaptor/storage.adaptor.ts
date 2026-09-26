import { renameSync } from "node:fs";
import { getApiPrefix, getEnv } from "akanjs/base";
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

export interface BlobStorageOptions {
  blobStorage?: { baseDir?: string; privateBaseDir?: string; urlPrefix?: string };
}

export class BlobStorage
  extends adapt("blobStorage", ({ env }) => ({
    root: env(
      ({ blobStorage = { baseDir: "local" } }: BlobStorageOptions) =>
        `${process.env.AKAN_WORKSPACE_ROOT ?? "."}/${blobStorage.baseDir ?? "local"}/${getEnv().appName}/backend`,
    ),
    privateRoot: env(
      ({ blobStorage = { privateBaseDir: "local" } }: BlobStorageOptions) =>
        `${process.env.AKAN_WORKSPACE_ROOT ?? "."}/${blobStorage.privateBaseDir ?? "local"}/${getEnv().appName}/server-private`,
    ),
    // Only what is written from here on follows a moved prefix: a blob URL is stored on the row that
    // references it, so rows written under the old one keep pointing at it.
    urlPrefix: env(
      ({ blobStorage }: BlobStorageOptions) => blobStorage?.urlPrefix ?? `${getApiPrefix()}/localFile/getBlob`,
    ),
  }))
  implements StorageAdaptor
{
  /**
   * Throws where files kept on this machine's disk would be invisible to the app's other instances: a deployed
   * `multiple` or `cluster` app whose operator has not declared, with `AKAN_STORAGE_SHARED=true`, that the directory
   * is one volume mounted on every instance. A development machine runs every process on one disk.
   */
  static assertShared(storage: string) {
    const { databaseMode, environment, operationMode } = getEnv();
    if (!databaseMode || databaseMode === "single" || environment === "local" || operationMode === "local") return;
    if (["1", "true"].includes(process.env.AKAN_STORAGE_SHARED ?? "")) return;
    throw new Error(
      `${storage} keeps files on this instance's own disk, which the other instances of a ${databaseMode} deployment cannot read. Configure object storage, or mount one volume on every instance and set AKAN_STORAGE_SHARED=true.`,
    );
  }
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
    BlobStorage.assertShared("BlobStorage");
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
    BlobStorage.assertShared("BlobStorage");
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
    BlobStorage.assertShared("BlobStorage");
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
