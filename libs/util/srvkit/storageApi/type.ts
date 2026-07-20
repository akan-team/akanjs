import type { Logger } from "akanjs/common";

export interface DownloadRequest {
  path: string;
  localPath: string;
  renamePath?: string;
}
export interface LocalFilePath {
  localPath: string;
}
export interface UploadRequest {
  path: string;
  localPath: string;
  meta?: { [key: string]: string };
  rename?: string;
  host?: string;
  access?: "public" | "private";
}
export interface CopyRequest {
  bucket: string;
  copyPath: string;
  pastePath: string;
  filename: string;
  host?: string;
}
export interface UploadFromStreamRequest {
  path: string;
  body: ReadableStream<Uint8Array>;
  mimetype: string;
  root?: string;
  access?: "public" | "private";
  updateProgress: (progress: { loaded?: number; total?: number; part?: number }) => void;
  uploadSuccess: (url: string) => void;
}
export interface UploadReadableStreamRequest {
  path: string;
  body: ReadableStream<Uint8Array>;
  mimetype?: string;
  access?: "public" | "private";
}
export interface UploadResult {
  url: string;
  size: number;
}
export interface UploadProgress {
  loaded?: number;
  total?: number;
  part?: number;
}

export interface StorageApi {
  logger: Logger;
  root: string;
  urlPrefix: string;
  readData(path: string): Promise<ReadableStream>;
  readReadyData(path: string): Promise<ReadableStream<Uint8Array>>;
  readDataAsJson<T>(path: string): Promise<T>;
  getDataList(prefix?: string): Promise<string[]>;
  uploadDataFromLocal(request: UploadRequest): Promise<string>;
  uploadDataFromStream(request: UploadFromStreamRequest): void;
  uploadDataFromReadableStream(request: UploadReadableStreamRequest): Promise<UploadResult>;
  saveData(request: DownloadRequest): Promise<LocalFilePath>;
  copyData(request: CopyRequest): Promise<string>;
  deleteData(url: string): Promise<boolean>;
  deleteDataByPath(path: string): Promise<boolean>;
}
