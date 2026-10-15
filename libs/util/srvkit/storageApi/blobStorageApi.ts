import { rename } from "node:fs/promises";
import { getEnv } from "akanjs/base";
import { Try } from "akanjs/server";
import { adapt } from "akanjs/service";
import { Err } from "../../lib/dict";
import type { ModulesOptions } from "../../lib/option";
import { SignalTestHarness } from "../signalTestHarness";
import { ensureReadableStreamReady } from "./ensureReadableStreamReady";
import type {
  CopyRequest,
  DownloadRequest,
  LocalFilePath,
  StorageBackend,
  UploadFromStreamRequest,
  UploadReadableStreamRequest,
  UploadRequest,
  UploadResult,
} from "./type";
import { writeReadableStreamToFile } from "./writeReadableStreamToFile";

const localDir = () =>
  SignalTestHarness.isRunning() ? SignalTestHarness.scratchDir() : `${process.env.AKAN_WORKSPACE_ROOT ?? "."}/local`;

export class BlobStorageApi
  extends adapt("blobStorageApi", ({ env }) => ({
    root: env(() => `${localDir()}/${getEnv().appName}/backend`),
    privateRoot: env(() => `${localDir()}/${getEnv().appName}/server-private`),
    urlPrefix: env((options: ModulesOptions) =>
      getEnv().operationMode === "local"
        ? `http://localhost:${process.env.PORT ?? options.port ?? 8282}/api/localFile/getBlob`
        : "/api/localFile/getBlob",
    ),
  }))
  implements StorageBackend
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
  async readReadyData(path: string) {
    const stream = (await this.readData(path)) as ReadableStream<Uint8Array>;
    return await ensureReadableStreamReady(stream);
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
      await writeReadableStreamToFile(filePath, body);
      await uploadSuccess(this.#localPathToUrl(path));
    } catch (error) {
      this.logger.error(error instanceof Error ? error.message : String(error));
    }
  }
  async uploadDataFromReadableStream({
    path,
    body,
    access = "public",
  }: UploadReadableStreamRequest): Promise<UploadResult> {
    const filePath = access === "private" ? `${this.privateRoot}/${path}` : `${this.root}/${path}`;
    let size = 0;
    const countedBody = body.pipeThrough(
      new TransformStream<Uint8Array, Uint8Array>({
        transform(chunk, controller) {
          size += chunk.length;
          controller.enqueue(chunk);
        },
      }),
    );
    await writeReadableStreamToFile(filePath, countedBody);
    return { url: this.#localPathToUrl(path), size };
  }
  async saveData({ path, localPath, renamePath }: DownloadRequest): Promise<LocalFilePath> {
    const data = await this.readData(path);
    await writeReadableStreamToFile(localPath, data);
    if (renamePath) await rename(localPath, renamePath);
    return { localPath: renamePath ?? localPath };
  }
  async copyData({ copyPath, pastePath, host }: CopyRequest) {
    await Bun.write(`${this.root}/${pastePath}`, Bun.file(`${this.root}/${copyPath}`));
    return pastePath;
  }
  @Try()
  async deleteDataByPath(path: string) {
    await Bun.file(this.#resolveFilePath(path)).delete();
    return true;
  }
  presignDownload(_path: string, _expiresInSec: number, _opts?: { filename?: string }) {
    return null;
  }
  presignUpload(_path: string, _expiresInSec: number) {
    return null;
  }
  async getDataSize(path: string) {
    const file = Bun.file(this.#resolveFilePath(path));
    return (await file.exists()) ? file.size : null;
  }
  @Try()
  async deleteData(url: string) {
    const basePath = this.#localPathToUrl("");
    if (!url.startsWith(basePath)) throw new Err("util.error.invalidBaseUrlForDelete");
    const path = url.replace(basePath, "");
    await this.deleteDataByPath(path);
    return true;
  }
}
