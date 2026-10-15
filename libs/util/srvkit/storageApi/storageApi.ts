import { getEnv } from "akanjs/base";
import { adapt, BlobStorage } from "akanjs/service";
import { Err } from "../../lib/dict";
import type { ModulesOptions } from "../../lib/option";
import { SignalTestHarness } from "../signalTestHarness";
import { BlobStorageApi } from "./blobStorageApi";
import { ObjectStorageApi } from "./objectStorageApi";
import type {
  CopyRequest,
  DownloadRequest,
  StorageBackend,
  UploadFromStreamRequest,
  UploadReadableStreamRequest,
  UploadRequest,
} from "./type";

export class StorageApi
  extends adapt("storageApi", ({ env, plug }) => ({
    // A closed-network kit has no route to the object store, and CI replaces an app's env file with its own, so the
    // deployment's STORAGE_MODE=local is what keeps its files on the local blob storage whatever the env configures.
    // The signal-test harness boots env files that name the production bucket, so it never reaches object storage.
    objectStorageOptions: env((options: ModulesOptions) =>
      process.env.STORAGE_MODE === "local" || SignalTestHarness.isRunning() ? undefined : options.objectStorage,
    ),
    privateStorageOptions: env((options: ModulesOptions) =>
      process.env.STORAGE_MODE === "local" || SignalTestHarness.isRunning() ? undefined : options.privateStorage,
    ),
    blobStorageApi: plug(BlobStorageApi),
  }))
  implements StorageBackend
{
  #storage: StorageBackend | null = null;
  #privateStorage: StorageBackend | null = null;

  override onInit() {
    if (!this.objectStorageOptions) BlobStorage.assertShared("Without `objectStorage`, libs/util storage");
  }

  get #backend(): StorageBackend {
    this.#storage ??= this.objectStorageOptions
      ? new ObjectStorageApi(getEnv().appName, this.objectStorageOptions)
      : this.blobStorageApi;
    return this.#storage;
  }

  // On R2/S3 access control is bucket-level (R2 ignores per-object ACL), so private files must live in a
  // separate bucket that has NO public access configured.
  get #privateBackend(): StorageBackend {
    if (this.privateStorageOptions) {
      this.#privateStorage ??= new ObjectStorageApi(getEnv().appName, this.privateStorageOptions);
      return this.#privateStorage;
    }
    if (this.objectStorageOptions)
      throw new Err("util.error.adaptorNotConfigured", { adaptor: "StorageApi", option: "privateStorage" });
    return this.blobStorageApi;
  }

  #route(path: string, access?: "public" | "private") {
    return access === "private" || path.startsWith("private/") ? this.#privateBackend : this.#backend;
  }

  get root() {
    return this.#backend.root;
  }
  get urlPrefix() {
    return this.#backend.urlPrefix;
  }
  readData(path: string) {
    return this.#route(path).readData(path);
  }
  readReadyData(path: string) {
    return this.#route(path).readReadyData(path);
  }
  readDataAsJson<T>(path: string) {
    return this.#route(path).readDataAsJson<T>(path);
  }
  getDataList(prefix?: string) {
    return this.#route(prefix ?? "").getDataList(prefix);
  }
  uploadDataFromLocal(request: UploadRequest) {
    return this.#route(request.path, request.access).uploadDataFromLocal(request);
  }
  uploadDataFromStream(request: UploadFromStreamRequest) {
    this.#route(request.path, request.access).uploadDataFromStream(request);
  }
  uploadDataFromReadableStream(request: UploadReadableStreamRequest) {
    return this.#route(request.path, request.access).uploadDataFromReadableStream(request);
  }
  saveData(request: DownloadRequest) {
    return this.#route(request.path).saveData(request);
  }
  copyData(request: CopyRequest) {
    return this.#route(request.pastePath).copyData(request);
  }
  deleteData(url: string) {
    return this.#backend.deleteData(url);
  }
  deleteDataByPath(path: string) {
    return this.#route(path).deleteDataByPath(path);
  }
  presignUpload(path: string, expiresInSec: number) {
    return this.#route(path).presignUpload(path, expiresInSec);
  }
  presignDownload(path: string, expiresInSec: number, opts?: { filename?: string }) {
    return this.#route(path).presignDownload(path, expiresInSec, opts);
  }
  getDataSize(path: string) {
    return this.#route(path).getDataSize(path);
  }
}
