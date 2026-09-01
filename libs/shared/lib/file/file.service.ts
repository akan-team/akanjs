import { Crawler, FileManager, getImageAbstract, getImageSize, IpfsApi, type StorageApi } from "@libs/util/srvkit";
import { sleep } from "akanjs/common";
import { createDocumentId } from "akanjs/document";
import type { LocalFile } from "akanjs/server";
import { serve } from "akanjs/service";

import * as db from "../db";
import { Err } from "../dict";

export class FileService extends serve(db.file, ({ use, plug }) => ({
  storageApi: use<StorageApi>(),
  ipfsApi: plug(IpfsApi),
})) {
  localDir = `./data`;

  override async _postRemove(file: db.File) {
    await this.storageApi.deleteData(file.url);
    return file;
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
    { header, rename, fileId }: { header?: { [key: string]: string }; rename?: string; fileId?: string } = {},
  ): Promise<db.File | null> {
    try {
      const requestedFile = fileId ? await this.loadFile(fileId) : null;
      if (requestedFile) return requestedFile;
      const isDataUri = uri.startsWith("data:");
      const file = isDataUri ? null : await this.fileModel.findByOrigin(uri);
      if (file && (!fileId || file.id === fileId)) return file;
      const localFile = await this.saveImageFromUri(uri, { header, rename });
      return await this.addFileFromLocal(localFile, purpose, group, { origin: uri, fileId });
    } catch (_err) {
      this.logger.warn(`Failed to add file from URI - ${uri}`);
      return null;
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
      id: fileMeta.fileId,
      progress: 0,
      url: "",
      imageSize: [0, 0],
      filename: fileStream.name,
      mimetype: fileStream.type,
      encoding: "7bit",
      ...fileMeta,
    });
    const rename = this._convertFileName(file);
    const path = `${purpose.length ? purpose : "default"}/${group?.length ? group : "default"}/${rename}`;
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
    // resolve the same reference; generateFile is the only path that accepts one.
    const file = fileId
      ? await this.fileModel.generateFile({ id: fileId, ...data })
      : await this.fileModel.createFile(data);
    const path = `${purpose.length ? purpose : "default"}/${group?.length ? group : "default"}/${this._convertFileName(file)}`;
    const url = await this.storageApi.uploadDataFromLocal({
      path,
      localPath: localFile.localPath,
    });
    const abstract = localFile.mimetype.startsWith("image/") ? await getImageAbstract(localFile.localPath) : {};
    await this.fileModel.finishUpload(file.id, url, abstract);
    return file.set({ status: "active", progress: 100, url, ...abstract });
  }
  async saveImageFromUri(
    uri: string,
    { cache, rename, header }: { cache?: boolean; rename?: string; header?: { [key: string]: string } } = {},
  ): Promise<LocalFile> {
    const dirname = `${this.localDir}/uriDownload`;
    if (uri.startsWith("data:")) return await FileManager.saveEncodedData(uri, dirname);
    const readStream = uri.startsWith("ipfs://")
      ? await FileManager.readUrlAsStream(this.ipfsApi.getHttpsUri(uri), { headers: header })
      : await FileManager.readUrlAsStream(uri, { headers: header });
    const filename = rename ?? this._filenameFromUri(uri);
    const localPath = `${dirname}/${filename}`;
    return await FileManager.writeStreamToFile(readStream, localPath, { cache, rename: filename });
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
