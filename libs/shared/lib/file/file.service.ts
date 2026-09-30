import { Crawler, FileManager, getImageAbstract, getImageSize, IpfsApi, type StorageApi } from "@libs/util/srvkit";
import { dayjs } from "akanjs/base";
import { sleep } from "akanjs/common";
import { createDocumentId } from "akanjs/document";
import type { LocalFile } from "akanjs/server";
import { serve } from "akanjs/service";

import * as db from "../db";
import { Err } from "../dict";

export interface SaveImageFromUriOptions {
  cache?: boolean;
  rename?: string;
  header?: { [key: string]: string };
  /** 받은 바이트가 늘어날 때마다 호출된다. total 은 content-length 를 모르면 0 */
  onProgress?: (loaded: number, total: number) => void;
  /** 다운로드를 중간에 끊기 위한 신호 */
  signal?: AbortSignal;
  /** 무응답 한도(ms) */
  stallTimeout?: number;
  /** 리다이렉트 처리. 호출자가 고른 주소만 받아야 할 때 `"error"`로 막는다 */
  redirect?: RequestRedirect;
}
export interface AddFileFromUriOptions extends SaveImageFromUriOptions {
  fileId?: string;
  /** 이미 받아둔 파일이 있어도 다시 받는다 */
  force?: boolean;
  /** 실패를 삼키지 않고 그대로 던진다. 기본값은 기존 동작인 null 반환 */
  throwOnError?: boolean;
  /**
   * 스토리지로 옮긴 뒤 임시 다운로드 파일을 지운다.
   * 큰 파일은 임시 경로와 스토리지에 두 번 남아 디스크를 두 배로 먹는다.
   */
  cleanupLocalFile?: boolean;
}

export class FileService extends serve(db.file, ({ use, plug }) => ({
  storageApi: use<StorageApi>(),
  ipfsApi: plug(IpfsApi),
})) {
  localDir = `./data`;

  override async _postRemove(file: db.File) {
    await this.storageApi.deleteData(file.url);
    return file;
  }
  async failStaleUploads() {
    return await this.fileModel.failStaleUploads(dayjs().subtract(15, "minute"));
  }
  async generate(): Promise<db.File> {
    return (
      (await this.fileModel.findByFilename("sample.jpg")) ??
      (await this.addFileFromLocal(
        {
          filename: "sample.jpg",
          mimetype: "image/jpeg",
          encoding: "7bit",
          localPath: `./libs/shared/lib/file/sample.jpg`,
        },
        "generate",
        "generate",
      ))
    );
  }

  async addFiles(
    fileStreams: File[],
    fileMetas: db.FileMeta[],
    purpose: string,
    group = "default",
  ): Promise<db.File[]> {
    if (fileStreams.length !== fileMetas.length) throw new Err("file.error.fileStreamsAndMetasMismatch");
    const files = await Promise.all(
      fileStreams.map(
        async (fileStream, idx) =>
          await this._addFileFromStream(fileStream, fileMetas[idx] as db.FileMeta, purpose, group),
      ),
    );
    return files;
  }
  async addFileFromUri(
    uri: string,
    purpose: string,
    group: string,
    {
      header,
      rename,
      fileId,
      force = false,
      onProgress,
      signal,
      stallTimeout,
      redirect,
      throwOnError = false,
      cleanupLocalFile = false,
    }: AddFileFromUriOptions = {},
  ): Promise<db.File | null> {
    try {
      const requestedFile = fileId ? await this.loadFile(fileId) : null;
      // A copy whose earlier download died midway has no url; handing it back would make it permanent.
      if (requestedFile?.status === "active" && requestedFile.url && !force) return requestedFile;
      const isDataUri = uri.startsWith("data:");
      const file = isDataUri ? null : await this.fileModel.findByOrigin(uri);
      if (file && !force && (!fileId || file.id === fileId)) return file;
      const localFile = await this.saveImageFromUri(uri, {
        header,
        rename,
        onProgress,
        signal,
        stallTimeout,
        redirect,
      });
      try {
        return await this.addFileFromLocal(localFile, purpose, group, { origin: uri, fileId });
      } finally {
        if (cleanupLocalFile) await this.removeLocalFile(localFile);
      }
    } catch (err) {
      this.logger.warn(`Failed to add file from URI - ${uri}`);
      // 큰 파일을 받는 호출자는 실패를 조용히 넘기면 안 된다. 파일 없는 문서가 만들어지기 때문이다
      if (throwOnError) throw err;
      return null;
    }
  }
  /** 스토리지로 옮긴 뒤 남은 임시 파일을 지운다. 정리 실패가 원래 작업을 망치지는 않게 한다 */
  async removeLocalFile(localFile: LocalFile) {
    try {
      await FileManager.removeFile(localFile);
    } catch {
      this.logger.warn(`Failed to remove local file - ${localFile.localPath}`);
    }
  }
  async getJsonFromUri<T = unknown>(uri: string): Promise<T | undefined> {
    try {
      if (uri.includes("data:application/json;base64,"))
        return JSON.parse(Buffer.from(uri.replace("data:application/json;base64,", ""), "base64").toString()) as T;
      const response = (await fetch(this.ipfsApi.getHttpsUri(uri))).json();
      return response as T;
    } catch (_err) {
      this.logger.warn(`Failed to get json from URI - ${uri}`);
      return undefined;
    }
  }
  async readFileBuffer(file: db.File): Promise<Buffer> {
    return await this._readFileBuffer(file);
  }
  async readFileAsBase64(file: db.File): Promise<string> {
    return (await this._readFileBuffer(file)).toString("base64");
  }
  private async _readFileBuffer(file: db.File): Promise<Buffer> {
    if (file.url.startsWith("http://") || file.url.startsWith("https://")) {
      const response = await fetch(file.url, { signal: AbortSignal.timeout(60_000) });
      if (!response.ok) throw new Err("file.error.fileReadFailed", { filename: file.filename });
      return Buffer.from(await response.arrayBuffer());
    }
    const urlPrefix = `${this.storageApi.urlPrefix}/`;
    if (!file.url.startsWith(urlPrefix)) throw new Err("file.error.fileReadFailed", { filename: file.filename });
    const stream = await this.storageApi.readReadyData(file.url.replace(urlPrefix, ""));
    return Buffer.from(await new Response(stream).arrayBuffer());
  }

  async _addFileFromStream(fileStream: File, fileMeta: db.FileMeta, purpose: string, group: string | null) {
    const resolvedFileStream = await (fileStream as unknown as Promise<File>);
    const file = await this.fileModel.generateFile({
      progress: 0,
      url: "",
      imageSize: [0, 0],
      filename: fileStream.name,
      mimetype: fileStream.type,
      encoding: "7bit",
      lastModifiedAt: fileMeta.lastModifiedAt,
      size: fileMeta.size,
    });
    const rename = this._convertFileName(file);
    const pathSegment = (value: string | null) => value?.replace(/[^A-Za-z0-9_-]/g, "") || "default";
    const path = `${pathSegment(purpose)}/${pathSegment(group)}/${rename}`;
    this.storageApi.uploadDataFromStream({
      path: path,
      body: resolvedFileStream.stream(),
      mimetype: fileStream.type,
      updateProgress: async (progress) => {
        await this.fileModel.progressUpload(file.id, progress.loaded, fileMeta.size);
      },
      uploadSuccess: async (url) => {
        const abstract = fileStream.type.startsWith("image/")
          ? await getImageAbstract(await resolvedFileStream.arrayBuffer().then((b) => Buffer.from(b)))
          : {};
        void this.fileModel.finishUpload(file.id, url, abstract);
      },
    });
    return file;
  }
  async addFileFromLocal(
    localFile: LocalFile,
    purpose: string,
    group = "default",
    { origin, fileId }: { origin?: string; fileId?: string } = {},
  ): Promise<db.File> {
    const { size } = await FileManager.getFileStat(localFile);
    const imageSize = localFile.mimetype.startsWith("image/") ? await getImageSize(localFile.localPath) : [0, 0];
    const data = { ...localFile, url: "", imageSize, origin, size };
    // An edge or station copying a file down from the cloud keeps the source's id so both sides
    // resolve the same reference.
    const file = fileId ? await this._writeFileWithId(fileId, data) : await this.fileModel.createFile(data);
    const path = `${purpose.length ? purpose : "default"}/${group?.length ? group : "default"}/${this._convertFileName(file)}`;
    const url = await this.storageApi.uploadDataFromLocal({
      path,
      localPath: localFile.localPath,
    });
    const abstract = localFile.mimetype.startsWith("image/") ? await getImageAbstract(localFile.localPath) : {};
    await this.fileModel.finishUpload(file.id, url, abstract);
    return file.set({ status: "active", progress: 100, url, ...abstract });
  }
  private async _writeFileWithId(fileId: string, data: Partial<db.File>) {
    const existingFile = await this.fileModel.loadFile(fileId);
    if (existingFile) return await existingFile.set(data).save();
    //? A document built with an id counts as stored and saves as an update; create inserts under the given id.
    return await this.fileModel.createFile({ ...data, id: fileId } as unknown as db.FileInput);
  }
  async saveImageFromUri(
    uri: string,
    { cache, rename, header, onProgress, signal, stallTimeout, redirect }: SaveImageFromUriOptions = {},
  ): Promise<LocalFile> {
    const dirname = `${this.localDir}/uriDownload`;
    if (uri.startsWith("data:")) return await FileManager.saveEncodedData(uri, dirname);
    const { readStream, totalBytes } = await FileManager.readUrlAsStreamWithSize(
      uri.startsWith("ipfs://") ? this.ipfsApi.getHttpsUri(uri) : uri,
      { headers: header, signal, redirect },
    );
    const filename = rename ?? this._filenameFromUri(uri);
    const localPath = `${dirname}/${filename}`;
    return await FileManager.writeStreamToFile(readStream, localPath, {
      cache,
      rename: filename,
      onProgress,
      totalBytes,
      signal,
      stallTimeout,
    });
  }
  private _filenameFromUri(uri: string) {
    let basename = "";
    try {
      basename = new URL(uri).pathname.split("/").pop() ?? "";
    } catch {
      basename = uri.split("/").pop()?.split("?")[0] ?? "";
    }
    const ext = basename.includes(".") ? `.${basename.split(".").pop()}` : "";
    return `${createDocumentId()}${ext}`;
  }
  private _convertFileName(file: db.File) {
    const split = file.filename.split(".");
    const ext = split.length > 1 ? `.${split.at(-1)}` : "";
    return `${file.id}${ext}`;
  }
  async migrate(file: db.File) {
    if (!file.url) return;
    const root = this.storageApi.root;
    const localFile = await this.saveImageFromUri(file.url);
    await sleep(100);
    const cloudPath = file.url.split("/").slice(3).join("/").split("?")[0];
    if (!cloudPath) throw new Err("file.error.cloudPathNotFound");
    const path = root ? cloudPath.replace(`${root}/`, "") : cloudPath;
    const url = await this.storageApi.uploadDataFromLocal({
      path,
      localPath: localFile.localPath,
    });
    return await file.set({ url }).save();
  }

  async generatePdf(url: string) {
    const crawler = new Crawler();
    await crawler.init({ headless: true });
    const pdf = await crawler.generatePdf(url);
    return pdf;
  }
}
