import { Logger } from "@akanjs/common";
import { Try } from "@akanjs/nest";
import { CloudFrontClient, CreateInvalidationCommand } from "@aws-sdk/client-cloudfront";
import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  ListObjectsCommand,
  type ListObjectsCommandInput,
  PutObjectAclCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import * as fs from "fs";

import type {
  CopyRequest,
  DownloadRequest,
  LocalFilePath,
  StorageApi,
  UploadFromStreamRequest,
  UploadRequest,
} from "./type";

export interface ObjectStorageOptions {
  service: "s3" | "minio" | "r2" | "naver" | (string & {});
  region: string;
  accessKey: string;
  secretAccessKey: string;
  distributionId: string | null;
  bucket: string;
  host: string | null;
  protocol?: "http" | "https";
  endpoint?: string;
}

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
    const s3 =
      this.service === "s3"
        ? new S3Client({
            region: options.region,
            credentials: {
              accessKeyId: options.accessKey,
              secretAccessKey: options.secretAccessKey,
            },
          })
        : this.service === "r2"
          ? new S3Client({
              region: "auto",
              endpoint: options.region,
              credentials: {
                accessKeyId: options.accessKey,
                secretAccessKey: options.secretAccessKey,
              },
            })
          : this.service === "naver"
            ? new S3Client({
                endpoint: "https://kr.object.ncloudstorage.com",
                region: options.region,
                credentials: {
                  accessKeyId: options.accessKey,
                  secretAccessKey: options.secretAccessKey,
                },
              })
            : this.service === "minio"
              ? new S3Client({
                  region: options.region,
                  credentials: {
                    accessKeyId: options.accessKey,
                    secretAccessKey: options.secretAccessKey,
                  },
                  endpoint: this.endpoint ?? "http://localhost:9000",
                  forcePathStyle: true,
                })
              : undefined;
    if (!s3) throw new Error("Invalid service type");
    this.#s3 = s3;
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
    const { Body } = await this.#s3.send(new GetObjectCommand({ Bucket: this.bucket, Key }));
    if (!Body) throw new Error("File Not Found");
    return Body as unknown as fs.ReadStream;
  }
  async readDataAsJson<T>(path: string) {
    const Key = `${this.root}/${path}`;
    const data = await this.#s3.send(new GetObjectCommand({ Bucket: this.bucket, Key }));
    return JSON.parse((data.Body as string | undefined) ?? "") as T;
  }
  async getDataList(prefix?: string) {
    return await this.#getAllKeys({
      Bucket: this.bucket,
      Prefix: `${this.root}${prefix ? `/${prefix}` : ""}`,
    });
  }
  async #getAllKeys(params: ListObjectsCommandInput, allKeys: string[] = []) {
    const response = await this.#s3.send(new ListObjectsCommand(params));
    response.Contents?.forEach((obj) => allKeys.push(obj.Key ?? ""));
    if (response.NextMarker) {
      params.Marker = response.NextMarker;
      await this.#getAllKeys(params, allKeys); // RECURSIVE CALL
    }
    return allKeys;
  }
  async uploadDataFromLocal({ path, localPath, meta }: UploadRequest) {
    const Key = `${this.root}/${path}`;
    await this.#s3.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key,
        Metadata: meta,
        ACL: this.service !== "r2" ? "public-read" : undefined,
        Body: fs.createReadStream(localPath),
        ContentType: this.#getContentType(path),
      })
    );
    return `${this.urlPrefix}/${Key}`;
  }
  uploadDataFromStream({ path, body, mimetype, updateProgress, uploadSuccess }: UploadFromStreamRequest) {
    const Key = this.service === "minio" ? `${path.split("/").at(-1)}` : `${this.root}/${path}`;
    const upload = new Upload({
      client: this.#s3,
      params: {
        Bucket: this.bucket,
        Key,
        ACL: this.service !== "r2" ? "public-read" : undefined,
        Body: body,
        ContentType: mimetype,
      },
      partSize: 5 * 1024 * 1024,
    });
    upload.on("httpUploadProgress", (progress) => {
      updateProgress(progress);
    });
    upload.done().then(
      (value) => {
        const fileUrl = `${this.urlPrefix}/${Key}`;
        uploadSuccess(fileUrl);
      },
      (reason: unknown) => {
        this.logger.error(reason as string);
      }
    );
  }

  async saveData({ path, localPath, renamePath }: DownloadRequest): Promise<LocalFilePath> {
    if (!fs.existsSync(localPath)) fs.mkdirSync(localPath, { recursive: true });
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
    const Key = `${this.root}/${pastePath}`;
    await this.#s3.send(
      new CopyObjectCommand({
        CopySource: `${this.bucket}/${this.root}/${copyPath}`,
        Bucket: this.bucket,
        Key,
        ACL: this.service === "s3" ? "public-read" : undefined,
      })
    );
    return `${this.urlPrefix}/${Key}`;
  }
  @Try()
  async deleteData(url: string, host?: string) {
    if (!url.startsWith(this.urlPrefix)) throw new Error("Invalid Base URL, Unable to delete data");
    const Key = url.replace(`${this.urlPrefix}/`, "");
    await this.#s3.send(new DeleteObjectCommand({ Bucket: this.bucket, Key }));
    return true;
  }
  async invalidateObjects(keys: string[]) {
    if (!this.#cloudFront || !this.distributionId) throw new Error("CloudFront is not initialized");
    await this.#cloudFront.send(
      new CreateInvalidationCommand({
        DistributionId: this.distributionId,
        InvalidationBatch: {
          Paths: {
            Quantity: keys.length,
            Items: keys.map((key) => `${this.root}/${key}`),
          },
          CallerReference: new Date().getTime().toString(),
        },
      })
    );
  }
  async makePublic(path: string) {
    const Key = `${this.root}/${path}`;
    await this.#s3.send(new PutObjectAclCommand({ ACL: "public-read", Bucket: this.bucket, Key }));
    return true;
  }
  async makePrivate(path: string) {
    const Key = `${this.root}/${path}`;
    await this.#s3.send(new PutObjectAclCommand({ ACL: "private", Bucket: this.bucket, Key }));
    return true;
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
