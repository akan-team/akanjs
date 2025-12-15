import { sleep } from "@akanjs/common";
import { FileStream, LocalFile } from "@akanjs/server";
import { serve } from "@akanjs/service";
import { Crawler, FileManager, getImageAbstract, getImageSize, type IpfsApi, type StorageApi } from "@util/nest";

import * as db from "../db";

export class FileService extends serve(db.file, ({ use }) => ({
  storageApi: use<StorageApi>(),
  ipfsApi: use<IpfsApi>(),
})) {
  localDir = `./data`;

  async _postRemove(file: db.File) {
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
        "generate"
      ))
    );
  }

  async addFiles(
    fileStreams: FileStream[],
    fileMetas: db.FileMeta[],
    purpose: string,
    group = "default"
  ): Promise<db.File[]> {
    if (fileStreams.length !== fileMetas.length) throw new Error("File Streams and File Metas are not matched");
    const files = await Promise.all(
      fileStreams.map(
        async (fileStream, idx) => await this.#addFileFromStream(fileStream, fileMetas[idx], purpose, group)
      )
    );
    return files;
  }
  async addFileFromUri(
    uri: string,
    purpose: string,
    group: string,
    header: { [key: string]: string } = {}
  ): Promise<db.File | null> {
    try {
      const file = await this.fileModel.findByOrigin(uri);
      if (file) return file;
      const localFile = await this.saveImageFromUri(uri, { header });
      return await this.addFileFromLocal(localFile, purpose, group, { origin: uri });
    } catch (err) {
      this.logger.warn(`Failed to add file from URI - ${uri}`);
      return null;
    }
  }
  async getJsonFromUri<T = any>(uri: string): Promise<T | undefined> {
    try {
      if (uri.includes("data:application/json;base64,"))
        return JSON.parse(Buffer.from(uri.replace("data:application/json;base64,", ""), "base64").toString()) as T;
      const response = (await fetch(this.ipfsApi.getHttpsUri(uri))).json();
      return response as T;
    } catch (err) {
      this.logger.warn(`Failed to get json from URI - ${uri}`);
      return undefined;
    }
  }

  async #addFileFromStream(fileStream: FileStream, fileMeta: db.FileMeta, purpose: string, group: string | null) {
    const resolvedFileStream = await (fileStream as unknown as Promise<FileStream>);
    const { filename, mimetype, encoding } = resolvedFileStream;
    const file = await this.fileModel.generateFile({
      id: fileMeta.fileId,
      progress: 0,
      url: "",
      imageSize: [0, 0],
      filename,
      mimetype,
      encoding,
      ...fileMeta,
    });
    const rename = this.#convertFileName(file);
    const path = `${purpose.length ? purpose : "default"}/${group?.length ? group : "default"}/${rename}`;
    this.storageApi.uploadDataFromStream({
      path: path,
      body: resolvedFileStream.createReadStream(),
      mimetype,
      updateProgress: async (progress) => {
        await this.fileModel.progressUpload(file.id, progress.loaded, fileMeta.size);
      },
      uploadSuccess: async (url) => {
        const abstract = mimetype.startsWith("image/") ? await getImageAbstract(url) : {};
        void this.fileModel.finishUpload(file.id, url, abstract);
      },
    });
    return file;
  }
  async addFileFromLocal(
    localFile: LocalFile,
    purpose: string,
    group = "default",
    { origin }: { origin?: string } = {}
  ): Promise<db.File> {
    const { size } = await FileManager.getFileStat(localFile);
    const file = await this.fileModel.createFile({
      ...localFile,
      url: "",
      imageSize: localFile.mimetype.startsWith("image/") ? await getImageSize(localFile.localPath) : [0, 0],
      origin,
      size,
    });
    return new Promise((resolve, reject) => {
      this.storageApi.uploadDataFromStream({
        path: `${purpose}/${group}/${localFile.filename}`,
        body: FileManager.readFileAsStream(localFile),
        mimetype: localFile.mimetype,
        updateProgress: async (progress) => {
          await this.fileModel.progressUpload(file.id, progress.loaded, size);
        },
        uploadSuccess: async (url) => {
          const abstract = localFile.mimetype.startsWith("image/") ? await getImageAbstract(url) : {};
          await this.fileModel.finishUpload(file.id, url, abstract);
          resolve(file.set({ status: "active", progress: 100, url, ...abstract }));
        },
      });
    });
  }
  async saveImageFromUri(
    uri: string,
    { cache, rename, header }: { cache?: boolean; rename?: string; header?: { [key: string]: string } } = {}
  ): Promise<LocalFile> {
    const dirname = `${this.localDir}/uriDownload`;
    if (uri.startsWith("data:")) return FileManager.saveEncodedData(uri, dirname);
    const readStream = uri.startsWith("ipfs://")
      ? await FileManager.readUrlAsStream(this.ipfsApi.getHttpsUri(uri))
      : await FileManager.readUrlAsStream(uri);
    const filename = uri.split("/").pop();
    const localPath = `${dirname}${filename ? `/${filename}` : ""}`;
    const localFile = await FileManager.writeStreamToFile(readStream, localPath, { cache, rename, header });
    return localFile;
  }
  #convertFileName(file: db.File) {
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
