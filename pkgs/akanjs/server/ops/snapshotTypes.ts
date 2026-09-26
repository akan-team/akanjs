import type { DatabaseMode } from "../../base/baseEnv";

export type SnapshotFileRole = "main" | "solid";

export interface SnapshotFile {
  role: SnapshotFileRole;
  name: string;
  sizeBytes: number;
  sha256: string;
  encoding: "gzip";
  uploadBytes: number;
  uploadSha256: string;
}

export interface SnapshotEncryption {
  format: "age";
  recipients: string[];
}

export interface SnapshotManifest {
  format: "akan-snapshot/v1";
  id: string;
  appName: string;
  environment: string;
  akanVersion: string | null;
  buildId: string | null;
  databaseMode: DatabaseMode;
  createdAt: string;
  files: SnapshotFile[];
  integrity: "ok" | string[];
  encryption: SnapshotEncryption | null;
}

export interface SnapshotSources {
  main: string;
  solid: string | null;
}

export type SnapshotJobStatus = "running" | "uploading" | "done" | "failed";

export interface SnapshotUploadUrls {
  main: string;
  solid?: string;
  manifest: string;
}

export interface SnapshotJobState {
  id: string;
  status: SnapshotJobStatus;
  startedAt: string;
  finishedAt?: string;
  manifest?: SnapshotManifest;
  error?: string;
}
