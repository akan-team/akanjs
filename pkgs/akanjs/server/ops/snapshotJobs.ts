import { readdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { Logger } from "akanjs/common";
import type { SnapshotJobState, SnapshotUploadUrls } from "./snapshotTypes";
import type { SnapshotCapture } from "./sqliteSnapshot";

export interface SnapshotJobRequest {
  id: string;
  includeSolid: boolean;
  uploadUrls: SnapshotUploadUrls;
}

export interface SnapshotJobsOptions {
  capture: (request: SnapshotJobRequest) => Promise<SnapshotCapture>;
  snapshotDir: string;
  keep?: number;
  fetcher?: typeof fetch;
  uploadAttempts?: number;
  retryDelayMs?: number;
}

export class SnapshotJobs {
  static readonly maxRemembered = 20;
  static readonly uploadTimeoutMs = 30 * 60_000;

  readonly #logger = new Logger("SnapshotJobs");
  readonly #jobs = new Map<string, SnapshotJobState>();
  readonly #options: Required<Omit<SnapshotJobsOptions, "capture">> & Pick<SnapshotJobsOptions, "capture">;
  #running: Promise<void> | null = null;

  constructor({
    keep = Number(process.env.AKAN_OPS_SNAPSHOT_KEEP ?? 2),
    fetcher = fetch,
    uploadAttempts = 3,
    retryDelayMs = 2_000,
    ...options
  }: SnapshotJobsOptions) {
    this.#options = { ...options, keep: Math.max(1, keep || 1), fetcher, uploadAttempts, retryDelayMs };
  }

  get(id: string) {
    return this.#jobs.get(id) ?? null;
  }

  get busy() {
    return this.#running !== null;
  }

  start(request: SnapshotJobRequest): SnapshotJobState | "busy" | "exists" {
    if (this.#jobs.has(request.id)) return "exists";
    if (this.#running) return "busy";
    const job: SnapshotJobState = { id: request.id, status: "running", startedAt: new Date().toISOString() };
    this.#remember(job);
    this.#running = this.#run(job, request).finally(() => {
      this.#running = null;
    });
    return { ...job };
  }

  async idle() {
    await this.#running;
  }

  async #run(job: SnapshotJobState, request: SnapshotJobRequest) {
    try {
      const capture = await this.#options.capture(request);
      job.manifest = capture.manifest;
      job.status = "uploading";
      for (const file of capture.manifest.files) {
        const url = file.role === "main" ? request.uploadUrls.main : request.uploadUrls.solid;
        const filePath = capture.paths[file.role];
        if (!url || !filePath) throw new Error(`No upload URL for the ${file.role} file`);
        await this.#put(url, Bun.file(filePath), "application/octet-stream", file.name);
      }
      //* Last on purpose: the control plane reads a visible manifest as "every file it names is already there".
      await this.#put(request.uploadUrls.manifest, Bun.file(capture.manifestPath), "application/json", "manifest");
      job.status = "done";
      await this.#prune();
    } catch (error) {
      job.status = "failed";
      job.error = error instanceof Error ? error.message : String(error);
      this.#logger.error(`Snapshot ${job.id} failed: ${job.error}`);
    } finally {
      job.finishedAt = new Date().toISOString();
    }
  }

  async #put(url: string, body: Blob, contentType: string, label: string) {
    let lastError: unknown;
    for (let attempt = 1; attempt <= this.#options.uploadAttempts; attempt++) {
      try {
        const res = await this.#options.fetcher(url, {
          method: "PUT",
          body,
          headers: { "content-type": contentType, "content-length": String(body.size) },
          signal: AbortSignal.timeout(SnapshotJobs.uploadTimeoutMs),
        });
        if (res.ok) return;
        lastError = new Error(`upload of ${label} answered ${res.status}`);
        //* A 4xx is a refused presigned URL (expired, wrong signature); retrying it only burns the edge's uplink.
        if (res.status < 500) break;
      } catch (error) {
        lastError = error;
      }
      if (attempt < this.#options.uploadAttempts)
        await new Promise((resolve) => setTimeout(resolve, this.#options.retryDelayMs * attempt));
    }
    throw lastError instanceof Error ? lastError : new Error(`upload of ${label} failed`);
  }

  #remember(job: SnapshotJobState) {
    this.#jobs.set(job.id, job);
    while (this.#jobs.size > SnapshotJobs.maxRemembered) {
      const oldest = this.#jobs.keys().next().value;
      if (oldest === undefined) break;
      this.#jobs.delete(oldest);
    }
  }

  //* Keeps the newest few on disk as the edge's own fallback copy, for the stretch its uplink or the bucket is down.
  async #prune() {
    const dir = this.#options.snapshotDir;
    const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
    const dated = await Promise.all(
      entries
        .filter((entry) => entry.isDirectory())
        .map(async (entry) => {
          const full = path.join(dir, entry.name);
          const manifest = await stat(path.join(full, "manifest.json")).catch(() => null);
          return manifest ? { full, mtime: manifest.mtimeMs } : null;
        }),
    );
    const snapshots = dated
      .filter((entry): entry is { full: string; mtime: number } => !!entry)
      .sort((a, b) => b.mtime - a.mtime);
    for (const stale of snapshots.slice(this.#options.keep)) await rm(stale.full, { recursive: true, force: true });
  }
}
