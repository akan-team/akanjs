import type { AddFileFromUriOptions, ResolvedOAuthOptions, SaveImageFromUriOptions } from "@libs/shared/srvkit";
import {
  createOpaqueToken,
  FileManager,
  getImageAbstract,
  getImageSize,
  hashToken,
  IpfsApi,
  StorageApi,
  UntrustedFetch,
} from "@libs/util/srvkit";
import { dayjs, getApiPrefix } from "akanjs/base";
import { createDocumentId } from "akanjs/document";
import type { LocalFile } from "akanjs/server";
import { serve } from "akanjs/service";

import * as cnst from "../cnst";
import * as db from "../db";
import { Err } from "../dict";

export class FileService extends serve(db.file, ({ plug, use, memory }) => ({
  storageApi: plug(StorageApi),
  ipfsApi: plug(IpfsApi),
  oauthOption: use<ResolvedOAuthOptions>(),
  uploadTicketDirs: memory(Map, { of: String }),
})) {
  private static readonly uriDownloadDir = "./data/uriDownload";
  private static readonly uploadTicketSeconds = 10 * 60;
  private static readonly servedTypePattern = /^(?:(?:image|video)\/[a-z0-9][a-z0-9.+-]*|application\/pdf)$/;

  override async _postRemove(file: db.File) {
    await this.storageApi.deleteData(file.url);
    return file;
  }
  async failStaleUploads() {
    return await this.fileModel.failStaleUploads(dayjs().subtract(15, "minute"));
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
  async requestFileUpload(purpose: string, group = "default") {
    const ticket = createOpaqueToken();
    const expiresAt = dayjs().add(FileService.uploadTicketSeconds, "second");
    const dir = `${FileService.segmentOf(purpose)}/${FileService.segmentOf(group)}`;
    await this.uploadTicketDirs.set(hashToken(ticket), dir, { expireAt: expiresAt });
    const uploadUrl = `${this.oauthOption.issuer}${getApiPrefix()}/file/addFilesByTicket`;
    return new cnst.FileUploadTicket().set({ ticket, uploadUrl, expiresAt });
  }
  async addFilesByTicket(fileStreams: File[], ticket: string): Promise<db.File[]> {
    const dir = await this.uploadTicketDirs.getDel(hashToken(ticket));
    if (!dir) throw new Err("file.error.invalidUploadTicket", undefined, { statusCode: 401 });
    const [purpose = "default", group = "default"] = dir.split("/");
    const lastModifiedAt = dayjs();
    const fileMetas = fileStreams.map(() => ({ lastModifiedAt, size: 0 }));
    return await this.addFiles(fileStreams, fileMetas, purpose, group);
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
      this.logger.warn(`Failed to add file from URI - ${FileService.failureOf(uri, err)}`);
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
      return await UntrustedFetch.json<T>(this.ipfsApi.getHttpsUri(uri));
    } catch (err) {
      this.logger.warn(`Failed to get json from URI - ${FileService.failureOf(uri, err)}`);
      return undefined;
    }
  }
  async readFileBuffer(file: db.File): Promise<Buffer> {
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
    const upload = await (fileStream as unknown as Promise<File>);
    const mimetype = FileService.contentTypeOf(upload.type);
    const file = await this.fileModel.createFile({
      progress: 0,
      url: "",
      imageSize: [0, 0],
      filename: upload.name,
      mimetype,
      encoding: "7bit",
      lastModifiedAt: fileMeta.lastModifiedAt,
      size: upload.size,
    });
    const path = `${FileService.segmentOf(purpose)}/${FileService.segmentOf(group)}/${file.id}${FileService.extensionOf(upload.name, mimetype)}`;
    this.storageApi.uploadDataFromStream({
      path: path,
      body: upload.stream(),
      mimetype,
      updateProgress: async (progress) => {
        await this.fileModel.progressUpload(file.id, progress.loaded, upload.size);
      },
      uploadSuccess: async (url) => {
        const abstract = mimetype.startsWith("image/")
          ? await getImageAbstract(await upload.arrayBuffer().then((b) => Buffer.from(b)))
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
    const path = `${FileService.segmentOf(purpose)}/${FileService.segmentOf(group)}/${this._convertFileName(file)}`;
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
    const dirname = FileService.uriDownloadDir;
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
  private static segmentOf(value: string | null) {
    return value?.replace(/[^A-Za-z0-9_-]/g, "") || "default";
  }
  //? Object storage serves an upload under the type it was stored with, and HTML or SVG served from there runs script.
  private static contentTypeOf(type: string) {
    const mimetype = type.split(";")[0]?.trim().toLowerCase() ?? "";
    return FileService.servedTypePattern.test(mimetype) && mimetype !== "image/svg+xml"
      ? mimetype
      : "application/octet-stream";
  }
  private static extensionOf(filename: string, contentType: string) {
    const ext = /\.([a-z0-9]{1,10})$/i.exec(filename)?.[1]?.toLowerCase();
    if (contentType === "application/octet-stream") return ext ? `.${ext}` : "";
    if (ext && Bun.file(`file.${ext}`).type.split(";")[0] === contentType) return `.${ext}`;
    return `.${contentType.split("/")[1] ?? ""}`;
  }
  //? A URI can carry a presigned token in its query, so a log line names only its origin and drops every query.
  private static failureOf(uri: string, err: unknown) {
    const origin = uri.startsWith("data:") ? "data:" : URL.canParse(uri) ? new URL(uri).origin : "(invalid URI)";
    const reason = (err instanceof Error ? err.message : String(err)).replace(/\?\S*/g, "");
    return `${origin}: ${reason}`;
  }
}
