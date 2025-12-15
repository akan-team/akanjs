import { Logger } from "@akanjs/common";
import { Try } from "@akanjs/nest";
import * as fs from "fs";
import * as p from "path";

import type {
  CopyRequest,
  DownloadRequest,
  LocalFilePath,
  StorageApi,
  UploadFromStreamRequest,
  UploadRequest,
} from "./type";

export interface BlobStorageOptions {
  baseDir?: string;
  urlPrefix?: string;
}

export class BlobStorageApi implements StorageApi {
  readonly logger = new Logger("BlobStorageApi");
  readonly root: string;
  readonly urlPrefix: string;
  constructor(appName: string, { baseDir = "local", urlPrefix = "/backend/localFile/getBlob" }: BlobStorageOptions) {
    this.root = `${process.env.AKAN_WORKSPACE_ROOT ?? "."}/${baseDir}/${appName}/backend`;
    this.urlPrefix = urlPrefix;
  }
  #localPathToUrl(path: string) {
    return `${this.urlPrefix}/${path}`;
  }
  async readData(path: string) {
    const filePath = `${this.root}/${path}`;
    return Promise.resolve(fs.createReadStream(filePath));
  }
  async readDataAsJson<T>(path: string) {
    const filePath = `${this.root}/${path}`;
    const data = await fs.promises.readFile(filePath, "utf8");
    return JSON.parse(data) as T;
  }
  async getDataList(prefix?: string) {
    const dir = `${this.root}${prefix ? `/${prefix}` : ""}`;
    const paths = await fs.promises.readdir(dir);
    return paths.map((path) => this.#localPathToUrl(path));
  }
  async uploadDataFromLocal({ path, localPath, meta }: UploadRequest) {
    const filePath = `${this.root}/${path}`;
    await this.#generateDir(filePath);
    await fs.promises.copyFile(localPath, filePath);
    if (meta) await fs.promises.writeFile(`${filePath}.meta`, JSON.stringify(meta));
    return this.#localPathToUrl(path);
  }
  async uploadDataFromStream({ path, body, mimetype, updateProgress, uploadSuccess }: UploadFromStreamRequest) {
    const filePath = `${this.root}/${path}`;
    await this.#generateDir(filePath);
    const stream = body.pipe(fs.createWriteStream(filePath));
    stream.on("finish", () => {
      uploadSuccess(this.#localPathToUrl(path));
    });
    stream.on("error", (error) => {
      this.logger.error(error.message);
    });
  }
  async #generateDir(path: string) {
    const fileDir = p.dirname(path);
    if (!fs.existsSync(fileDir)) await fs.promises.mkdir(fileDir, { recursive: true });
  }
  async saveData({ path, localPath, renamePath }: DownloadRequest): Promise<LocalFilePath> {
    await this.#generateDir(localPath);
    const stream = (await this.readData(path)).pipe(
      fs.createWriteStream(localPath) as unknown as NodeJS.WritableStream
    );
    return new Promise((resolve, reject) => {
      stream.on("end", () => {
        if (renamePath) fs.renameSync(localPath, renamePath);
        setTimeout(() => {
          resolve({ localPath: renamePath ?? localPath });
        }, 100);
      });
      stream.on("error", (error) => {
        reject("File Download Error");
      });
    });
  }
  async copyData({ copyPath, pastePath, host }: CopyRequest) {
    await fs.promises.copyFile(`${this.root}/${copyPath}`, `${this.root}/${pastePath}`);
    return pastePath;
  }
  @Try()
  async deleteData(url: string) {
    const basePath = this.#localPathToUrl("");
    if (!url.startsWith(basePath)) throw new Error("Invalid Base URL, Unable to delete data");
    const path = url.replace(basePath, "");
    await fs.promises.unlink(`${this.root}/${path}`);
    return true;
  }
}
