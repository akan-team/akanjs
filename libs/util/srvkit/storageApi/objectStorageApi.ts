import { CloudFrontClient, CreateInvalidationCommand } from "@aws-sdk/client-cloudfront";
import { Logger } from "akanjs/common";
import { Try } from "akanjs/server";
import { S3Client } from "bun";
import { Err } from "../../lib/dict";
import { ensureReadableStreamReady } from "./ensureReadableStreamReady";
import type { ObjectStorageOptions } from "./objectStorageApi.helper";
import type {
  CopyRequest,
  DownloadRequest,
  LocalFilePath,
  StorageApi,
  UploadFromStreamRequest,
  UploadReadableStreamRequest,
  UploadRequest,
  UploadResult,
} from "./type";

export class ObjectStorageApi implements StorageApi {
  readonly logger = new Logger("ObjectStorageApi");
  readonly root: string;
  readonly bucket: string;
  readonly urlPrefix: string;
  readonly service: "s3" | "minio" | "r2" | "naver" | (string & {});
  readonly #s3: S3Client;
  readonly #cloudFront: CloudFrontClient | null;
  readonly distributionId: string | null = null;
  readonly host: string | null;
  readonly region: string;
  readonly endpoint: string | undefined;
  constructor(appName: string, options: ObjectStorageOptions) {
    this.root = `${appName}/backend`;
    this.host = options.host;
    this.bucket = options.bucket;
    this.service = options.service;
    this.region = options.region;
    this.endpoint = options.endpoint;
    const endpoint =
      this.service === "s3"
        ? undefined
        : this.service === "r2"
          ? options.region
          : this.service === "naver"
            ? "https://kr.object.ncloudstorage.com"
            : this.service === "minio"
              ? (this.endpoint ?? "http://localhost:9000")
              : options.endpoint;
    if (!endpoint && this.service !== "s3") throw new Err("util.error.invalidServiceType");
    this.#s3 = new S3Client({
      accessKeyId: options.accessKey,
      secretAccessKey: options.secretAccessKey,
      bucket: options.bucket,
      region: this.service === "r2" ? "auto" : options.region,
      ...(endpoint ? { endpoint } : {}),
    });
    this.#cloudFront = new CloudFrontClient();
    this.distributionId = options.distributionId;
    const protocol = options.protocol ?? (this.host === "localhost" ? "http" : "https");
    this.urlPrefix = this.host
      ? this.service === "minio"
        ? `${protocol}://${this.host}/${this.bucket}`
        : `${protocol}://${this.host}`
      : `${protocol}://${this.bucket}.s3.${this.region}.amazonaws.com`;
  }
  async readData(path: string) {
    const Key = `${this.root}/${path}`;
    return this.#s3.file(Key).stream();
  }
  async readReadyData(path: string) {
    const stream = (await this.readData(path)) as ReadableStream<Uint8Array>;
    return await ensureReadableStreamReady(stream);
  }
  async readDataAsJson<T>(path: string) {
    const Key = `${this.root}/${path}`;
    return (await this.#s3.file(Key).json()) as T;
  }
  async getDataList(prefix?: string) {
    const fullPrefix = `${this.root}${prefix ? `/${prefix}` : ""}`;
    const allKeys: string[] = [];
    let startAfter: string | undefined;
    let hasNextPage = true;
    while (hasNextPage) {
      const result = await this.#s3.list({ prefix: fullPrefix, startAfter });
      if (result.contents) {
        for (const obj of result.contents) {
          allKeys.push(obj.key ?? "");
        }
      }
      hasNextPage = Boolean(result.isTruncated && result.contents?.length);
      if (hasNextPage) startAfter = result.contents?.at(-1)?.key;
    }
    return allKeys;
  }
  async uploadDataFromLocal({ path, localPath, meta, access = "public" }: UploadRequest) {
    const Key = `${this.root}/${path}`;
    await this.#s3.file(Key).write(Bun.file(localPath), {
      type: this.#getContentType(path),
      ...this.#getAclOption(access),
    });
    return `${this.urlPrefix}/${Key}`;
  }
  uploadDataFromStream({
    path,
    body,
    mimetype,
    updateProgress,
    uploadSuccess,
    access = "public",
  }: UploadFromStreamRequest) {
    const Key = this.service === "minio" ? `${path.split("/").at(-1)}` : `${this.root}/${path}`;
    const writer = this.#s3.file(Key).writer({
      type: mimetype,
      ...this.#getAclOption(access),
      partSize: 5 * 1024 * 1024,
    });
    let loaded = 0;
    const pipe = async () => {
      const reader = body.getReader();
      try {
        let isDone = false;
        while (!isDone) {
          const next = await reader.read();
          isDone = next.done;
          if (next.done) continue;

          writer.write(next.value);
          loaded += next.value.length;
          updateProgress({ loaded });
        }
        await writer.end();
        uploadSuccess(`${this.urlPrefix}/${Key}`);
      } catch (reason) {
        this.logger.error(reason as string);
      }
    };
    pipe();
  }

  async uploadDataFromReadableStream({
    path,
    body,
    mimetype,
    access = "public",
  }: UploadReadableStreamRequest): Promise<UploadResult> {
    const Key = this.service === "minio" ? `${path.split("/").at(-1)}` : `${this.root}/${path}`;
    const writer = this.#s3.file(Key).writer({
      type: mimetype ?? this.#getContentType(path),
      ...this.#getAclOption(access),
      partSize: 5 * 1024 * 1024,
    });
    const reader = body.getReader();
    let size = 0;
    try {
      let isDone = false;
      while (!isDone) {
        const next = await reader.read();
        isDone = next.done;
        if (next.done) continue;

        writer.write(next.value);
        size += next.value.length;
      }
      await writer.end();
    } finally {
      reader.releaseLock();
    }
    return { url: `${this.urlPrefix}/${Key}`, size };
  }

  async saveData({ path, localPath, renamePath }: DownloadRequest): Promise<LocalFilePath> {
    const Key = `${this.root}/${path}`;
    const destPath = renamePath ?? localPath;
    await Bun.write(destPath, await this.#s3.file(Key).arrayBuffer());
    return { localPath: destPath };
  }
  async copyData({ copyPath, pastePath, host }: CopyRequest) {
    const sourceKey = `${this.root}/${copyPath}`;
    const destKey = `${this.root}/${pastePath}`;
    const data = await this.#s3.file(sourceKey).arrayBuffer();
    await this.#s3.file(destKey).write(data, {
      ...(this.service === "s3" ? { acl: "public-read" } : {}),
    });
    return `${this.urlPrefix}/${destKey}`;
  }
  @Try()
  async deleteData(url: string, host?: string) {
    if (!url.startsWith(this.urlPrefix)) throw new Err("util.error.invalidBaseUrlForDelete");
    const Key = url.replace(`${this.urlPrefix}/`, "");
    await this.#s3.file(Key).delete();
    return true;
  }
  @Try()
  async deleteDataByPath(path: string) {
    const Key = `${this.root}/${path}`;
    await this.#s3.file(Key).delete();
    return true;
  }
  async invalidateObjects(keys: string[]) {
    if (!this.#cloudFront || !this.distributionId) throw new Err("util.error.cloudFrontNotInitialized");
    await this.#cloudFront.send(
      new CreateInvalidationCommand({
        DistributionId: this.distributionId,
        InvalidationBatch: {
          Paths: {
            Quantity: keys.length,
            Items: keys.map((key) => `${this.root}/${key}`),
          },
          CallerReference: Date.now().toString(),
        },
      }),
    );
  }
  async makePublic(path: string) {
    const Key = `${this.root}/${path}`;
    const file = this.#s3.file(Key);
    const data = await file.arrayBuffer();
    await file.write(data, { acl: "public-read" });
    return true;
  }
  async makePrivate(path: string) {
    const Key = `${this.root}/${path}`;
    const file = this.#s3.file(Key);
    const data = await file.arrayBuffer();
    await file.write(data, { acl: "private" });
    return true;
  }
  #getAclOption(access: "public" | "private"): { acl?: "private" | "public-read" } {
    if (this.service === "r2") return {};
    return { acl: access === "private" ? "private" : "public-read" };
  }
  #getContentType(path: string) {
    const dirs = path.split("/");
    const filename = dirs.at(-1) ?? "";
    return filename.includes(".png")
      ? "image/png"
      : filename.includes(".jpg")
        ? "image/jpeg"
        : filename.includes(".json")
          ? "application/json"
          : undefined;
  }
}
