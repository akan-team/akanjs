import { renameSync } from "node:fs";
import { isAbsolute, parse, relative, resolve, sep } from "node:path";
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
  /**
   * Absolute path of a stored key on this machine's disk. `null` means the key is refused (rooted, NUL, or outside
   * its root): reject the request, never fall back to `readData` for it. The method is absent on an adaptor that
   * keeps no local files. Without `access`, a `private/` key resolves under the private root, so a caller serving
   * an untrusted key passes `access: "public"`.
   */
  resolveLocalPath?(path: string, access?: "public" | "private"): string | null;
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
    // A moved prefix applies to new writes only: a blob URL is stored on the row that references it.
    urlPrefix: env(
      ({ blobStorage }: BlobStorageOptions) => blobStorage?.urlPrefix ?? `${getApiPrefix()}/localFile/getBlob`,
    ),
  }))
  implements StorageAdaptor
{
  /** Throws for a deployed `multiple`/`cluster` app on local disk unless `AKAN_STORAGE_SHARED=true` marks it shared. */
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
  resolveLocalPath(path: string, access?: "public" | "private") {
    // A key is always joined under the root (`${root}/${path}`), so a rooted one (`/x`, `C:x`) names another file.
    if (path.includes("\0") || parse(path).root) return null;
    const isPrivate = access ? access === "private" : path.startsWith("private/");
    const base = resolve(isPrivate ? this.privateRoot : this.root);
    const target = resolve(base, path);
    //? `relative` rather than a prefix check: it holds for either separator, so a Windows desktop server is covered.
    const within = relative(base, target);
    if (!within || within === ".." || within.startsWith(`..${sep}`) || isAbsolute(within)) return null;
    return target;
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
