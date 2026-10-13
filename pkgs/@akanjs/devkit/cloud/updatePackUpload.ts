import { Logger, sleep } from "akanjs/common";
import type { BunFile } from "bun";
import { CloudApi, type CloudRecord, type UpdateUploadRequest } from "./cloudApi";

interface UpdatePackUploadOptions {
  putRetryMs?: number;
  putTimeoutMs?: number;
  commitRetryMs?: number;
  cutOffWindowMs?: number;
  commitLimitMs?: number;
}

//* akasys sits behind Cloudflare's 100 s request cut, so the pack goes straight to its staging bucket and akasys
//* only sees small calls: request a presigned PUT, then commit the object, or register a binary with it as its
//* embedded pack; either re-hashes it, and an upload is used once, one way.
export class UpdatePackUpload {
  static readonly maxBytes = 200 * 1024 * 1024;
  static readonly #transientPut = new Set([0, 408, 429, 500, 502, 503, 504]);
  //? A stalled PUT never fails on its own, so each try ends once the pack would be through even at this crawl.
  static readonly #putFloorBytesPerSecond = 64 * 1024;
  static readonly #errKey = /"error"\s*:\s*"([\w$-]+\.error\.[\w$-]+)"/;
  readonly #api: CloudApi;
  readonly #devProjectId: string;
  readonly #putRetryMs: number;
  readonly #putTimeoutMs: number;
  readonly #commitRetryMs: number;
  readonly #cutOffWindowMs: number;
  readonly #commitLimitMs: number;

  constructor(
    api: CloudApi,
    devProjectId: string,
    {
      putRetryMs = 1_000,
      putTimeoutMs = 60_000,
      commitRetryMs = 10_000,
      cutOffWindowMs = 15 * 60_000,
      commitLimitMs = 60 * 60_000,
    }: UpdatePackUploadOptions = {},
  ) {
    this.#api = api;
    this.#devProjectId = devProjectId;
    this.#putRetryMs = putRetryMs;
    this.#putTimeoutMs = putTimeoutMs;
    this.#commitRetryMs = commitRetryMs;
    this.#cutOffWindowMs = cutOffWindowMs;
    this.#commitLimitMs = commitLimitMs;
  }

  async send(archive: string, fields: Omit<UpdateUploadRequest, "size" | "sha256">): Promise<CloudRecord> {
    const uploadId = await this.stage(archive, fields);
    return await this.settle(() => this.#api.commitUpdateUpload(this.#devProjectId, uploadId));
  }

  /** Puts the pack in the project's staging storage and answers the upload id a commit or a registration names. */
  async stage(archive: string, fields: Omit<UpdateUploadRequest, "size" | "sha256">): Promise<string> {
    const file = Bun.file(archive);
    if (file.size < 1 || file.size > UpdatePackUpload.maxBytes)
      throw new Error(`The pack archive is ${file.size} bytes; a project takes 1 byte to 200 MiB.`);
    const hasher = new Bun.CryptoHasher("sha256");
    for await (const chunk of file.stream()) hasher.update(chunk);
    const upload = { ...fields, size: file.size, sha256: hasher.digest("hex") };
    //? A URL lives 15 minutes and storage answers 403 past it: one fresh ticket, then the refusal is real.
    for (let ticket = 1; ; ticket++) {
      const { uploadId, uploadUrl, contentType } = await this.#request(upload);
      const status = await this.#put(uploadUrl, contentType, file);
      if (status >= 200 && status < 300) return uploadId;
      if (status !== 403 || ticket === 2)
        throw new Error(`The storage refused the pack upload (${status ? `HTTP ${status}` : "no response"}).`);
    }
  }

  async #request(upload: UpdateUploadRequest) {
    return await this.#api.requestUpdateUpload(this.#devProjectId, upload).catch((error: unknown) => {
      //? A server older than staged uploads has no such route: its 404 is a page, where every refusal is an Err key.
      if (CloudApi.statusOf(error) === 404 && !UpdatePackUpload.#errKeyOf(error))
        throw new Error(
          "The project's server does not take direct pack uploads yet: update Akan Cloud and try again, or upload the pack from the project's release screen.",
        );
      throw error;
    });
  }

  // The URL signs only its host: an unsigned x-amz-* header (a checksum included) makes storage refuse the PUT.
  // A Bun fetch error names the URL, a bearer credential, so nothing but the status leaves this method.
  async #put(url: string, contentType: string, file: BunFile) {
    const timeoutMs = this.#putTimeoutMs + Math.ceil((file.size / UpdatePackUpload.#putFloorBytesPerSecond) * 1000);
    for (let retry = 0; ; retry++) {
      const status = await fetch(url, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": contentType },
        signal: AbortSignal.timeout(timeoutMs),
      })
        .then(async (response) => {
          await response.arrayBuffer().catch(() => undefined);
          return response.status;
        })
        .catch(() => 0);
      if (retry === 3 || !UpdatePackUpload.#transientPut.has(status)) return status;
      await sleep(this.#putRetryMs * (retry + 1));
    }
  }

  /**
   * Sends `call`, which consumes a staged upload, until the server answers it: the server finishes whoever stopped
   * listening, and the same upload id answers the same record afterwards.
   */
  // `uploadCommitInProgress` is a live claim the server heartbeats, so only the overall limit bounds it; a run of
  // cut-offs with none between them may be a server that died, whose claim lapses within minutes: the shorter window.
  async settle<T>(call: () => Promise<T>): Promise<T> {
    const limit = performance.now() + this.#commitLimitMs;
    let cutOffSince: number | null = null;
    for (;;) {
      try {
        return await call();
      } catch (error) {
        const now = performance.now();
        if (UpdatePackUpload.#inProgress(error)) cutOffSince = null;
        else if (UpdatePackUpload.#cutOff(error)) cutOffSince ??= now;
        else throw error;
        const deadline = cutOffSince === null ? limit : Math.min(limit, cutOffSince + this.#cutOffWindowMs);
        if (now + this.#commitRetryMs > deadline) throw error;
        Logger.rawLog(
          `The project is still taking the pack; asking again in ${Math.round(this.#commitRetryMs / 1000)}s.`,
        );
        await sleep(this.#commitRetryMs);
      }
    }
  }

  //? Not every 409: an upload already committed or embedded is answered 409 too, and asking again changes nothing.
  static #inProgress(error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return CloudApi.statusOf(error) === 409 && message.includes("uploadCommitInProgress");
  }

  static #cutOff(error: unknown) {
    const status = CloudApi.statusOf(error);
    if (status === null) return !(error instanceof SyntaxError);
    //? A gateway with no replica ready answers 503; the server's own 503 names an Err key and is a final refusal.
    if (status === 503) {
      const key = UpdatePackUpload.#errKeyOf(error);
      return key === null || key === "base.error.serverUnavailable";
    }
    return status === 502 || status === 504 || (status >= 520 && status <= 527);
  }

  static #errKeyOf(error: unknown) {
    return UpdatePackUpload.#errKey.exec(error instanceof Error ? error.message : String(error))?.[1] ?? null;
  }
}
