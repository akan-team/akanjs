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
  uploadTicketUploaders: memory(Map, { of: String }),
})) {
  private static readonly uriDownloadDir = "./data/uriDownload";
  private static readonly uploadTicketSeconds = 10 * 60;
  private static readonly servedTypePattern = /^(?:(?:image|video|audio)\/[a-z0-9][a-z0-9.+-]*|application\/pdf)$/;
  static readonly maxUploadBytes = 100 * 1024 * 1024;

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
    uploader?: string,
  ): Promise<db.File[]> {
    if (fileStreams.length !== fileMetas.length) throw new Err("file.error.fileStreamsAndMetasMismatch");
    const uploads = await Promise.all(
      fileStreams.map(async (fileStream) => await (fileStream as unknown as Promise<File>)),
    );
    const oversized = uploads.find(({ size }) => size > FileService.maxUploadBytes);
    if (oversized)
      throw new Err(
        "file.error.fileTooLarge",
        { filename: oversized.name, maxSize: FileService.maxUploadBytes / 1024 / 1024 },
        { statusCode: 413 },
      );
    return await this.transaction(async () => {
      const files = await this.createFileMany(
        uploads.map((upload, idx) => ({
          ...FileService.uploadInputOf(upload, fileMetas[idx] as db.FileMeta),
          uploader,
        })),
      );
      //? Each stream runs past the response, so none starts before every row of the batch is committed.
      await this.afterCommit(() => {
        files.forEach((file, idx) => {
          this._streamUpload(file, uploads[idx] as File, purpose, group);
        });
      });
      return files;
    });
  }
  async requestFileUpload(purpose: string, group = "default", uploader?: string) {
    const ticket = createOpaqueToken();
    const expiresAt = dayjs().add(FileService.uploadTicketSeconds, "second");
    const dir = `${FileService.segmentOf(purpose)}/${FileService.segmentOf(group)}`;
    await this.uploadTicketDirs.set(hashToken(ticket), dir, { expireAt: expiresAt });
    if (uploader) await this.uploadTicketUploaders.set(hashToken(ticket), uploader, { expireAt: expiresAt });
    const uploadUrl = `${this.oauthOption.issuer}${getApiPrefix()}/file/addFilesByTicket`;
    return new cnst.FileUploadTicket().set({ ticket, uploadUrl, expiresAt });
  }
  async addFilesByTicket(fileStreams: File[], ticket: string): Promise<db.File[]> {
    const dir = await this.uploadTicketDirs.getDel(hashToken(ticket));
    if (!dir) throw new Err("file.error.invalidUploadTicket", undefined, { statusCode: 401 });
    const uploader = (await this.uploadTicketUploaders.getDel(hashToken(ticket))) ?? undefined;
    const [purpose = "default", group = "default"] = dir.split("/");
    const lastModifiedAt = dayjs();
    const fileMetas = fileStreams.map(() => ({ lastModifiedAt, size: 0 }));
    return await this.addFiles(fileStreams, fileMetas, purpose, group, uploader);
  }
  async isUploadedBy(fileIds: string[], uploader: string) {
    const ids = [...new Set(fileIds)];
    if (!ids.length) return true;
    return (await this.fileModel.countUploadedBy(ids, uploader)) === ids.length;
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

  private _streamUpload(file: db.File, upload: File, purpose: string, group: string | null) {
    const path = `${FileService.segmentOf(purpose)}/${FileService.segmentOf(group)}/${FileService.objectNameOf(file.id)}${FileService.extensionOf(upload.name, file.mimetype)}`;
    this.storageApi.uploadDataFromStream({
      path: path,
      body: upload.stream(),
      mimetype: file.mimetype,
      updateProgress: async (progress) => {
        await this.fileModel.progressUpload(file.id, progress.loaded, upload.size);
      },
      uploadSuccess: async (url) => {
        const abstract = file.mimetype.startsWith("image/")
          ? await getImageAbstract(await upload.arrayBuffer().then((b) => Buffer.from(b)))
          : {};
        void this.fileModel.finishUpload(file.id, url, abstract);
      },
    });
  }
  async addFileFromLocal(
    localFile: LocalFile,
    purpose: string,
    group = "default",
    { origin, fileId }: { origin?: string; fileId?: string } = {},
  ): Promise<db.File> {
    const { size } = await FileManager.getFileStat(localFile);
    const mimetype = FileService.contentTypeOf(localFile.mimetype);
    const imageSize = mimetype.startsWith("image/") ? await getImageSize(localFile.localPath) : [0, 0];
    const data = { ...localFile, mimetype, url: "", imageSize, origin, size };
    const replacedUrl = fileId ? (await this.fileModel.loadFile(fileId))?.url : undefined;
    // An edge or station copying a file down from the cloud keeps the source's id so both sides
    // resolve the same reference.
    const file = fileId ? await this._writeFileWithId(fileId, data) : await this.fileModel.createFile(data);
    const path = `${FileService.segmentOf(purpose)}/${FileService.segmentOf(group)}/${FileService.objectNameOf(file.id)}${FileService.extensionOf(localFile.filename, mimetype)}`;
    const url = await this.storageApi.uploadDataFromLocal({ path, localPath: localFile.localPath, mimetype });
    const abstract = mimetype.startsWith("image/") ? await getImageAbstract(localFile.localPath) : {};
    await this.fileModel.finishUpload(file.id, url, abstract);
    //? Every copy lands under a fresh random key, so the object a re-copied file used to name would stay in the bucket.
    if (replacedUrl && replacedUrl !== url)
      await this.storageApi.deleteData(replacedUrl).catch((error) => {
        this.logger.warn(`Removing the object file ${file.id} was copied over from failed: ${String(error)}`);
      });
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
  //? The bucket serves anyone who names a key, and a document id is guessable, so the key carries a secret of its own.
  private static objectNameOf(fileId: string) {
    return `${fileId}-${createOpaqueToken(16)}`;
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
    const subtype = contentType.split("/")[1] ?? "";
    return /^[a-z0-9]{1,10}$/.test(subtype) ? `.${subtype}` : "";
  }
  private static uploadInputOf(upload: File, fileMeta: db.FileMeta) {
    return {
      progress: 0,
      url: "",
      imageSize: [0, 0] as [number, number],
      filename: upload.name,
      mimetype: FileService.contentTypeOf(upload.type),
      encoding: "7bit",
      lastModifiedAt: fileMeta.lastModifiedAt,
      size: upload.size,
    };
  }
  //? A URI can carry a presigned token in its query, so a log line names only its origin and drops every query.
  private static failureOf(uri: string, err: unknown) {
    const origin = uri.startsWith("data:") ? "data:" : URL.canParse(uri) ? new URL(uri).origin : "(invalid URI)";
    const reason = (err instanceof Error ? err.message : String(err)).replace(/\?\S*/g, "");
    return `${origin}: ${reason}`;
  }
}
