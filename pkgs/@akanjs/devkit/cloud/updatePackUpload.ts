import { Logger, sleep } from "akanjs/common";
import type { BunFile } from "bun";
import { CloudApi, type CloudRecord, type UpdateUploadRequest } from "./cloudApi";

interface UpdatePackUploadOptions {
  putRetryMs?: number;
  commitRetryMs?: number;
  cutOffWindowMs?: number;
  commitLimitMs?: number;
}

//* akasys sits behind Cloudflare's 100 s request cut, so the pack goes straight to its staging bucket and akasys
//* only sees two small JSON calls: request a presigned PUT, then commit the object, which akasys re-hashes.
export class UpdatePackUpload {
  static readonly maxBytes = 200 * 1024 * 1024;
  static readonly #transientPut = new Set([0, 408, 429, 500, 502, 503, 504]);
  readonly #api: CloudApi;
  readonly #devProjectId: string;
  readonly #putRetryMs: number;
  readonly #commitRetryMs: number;
  readonly #cutOffWindowMs: number;
  readonly #commitLimitMs: number;

  constructor(
    api: CloudApi,
    devProjectId: string,
    {
      putRetryMs = 1_000,
      commitRetryMs = 10_000,
      cutOffWindowMs = 15 * 60_000,
      commitLimitMs = 60 * 60_000,
    }: UpdatePackUploadOptions = {},
  ) {
    this.#api = api;
    this.#devProjectId = devProjectId;
    this.#putRetryMs = putRetryMs;
    this.#commitRetryMs = commitRetryMs;
    this.#cutOffWindowMs = cutOffWindowMs;
    this.#commitLimitMs = commitLimitMs;
  }

  async send(archive: string, fields: Omit<UpdateUploadRequest, "size" | "sha256">): Promise<CloudRecord> {
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
      if (status >= 200 && status < 300) return await this.#commit(uploadId);
      if (status !== 403 || ticket === 2)
        throw new Error(`The storage refused the pack upload (${status ? `HTTP ${status}` : "no response"}).`);
    }
  }

  async #request(upload: UpdateUploadRequest) {
    return await this.#api.requestUpdateUpload(this.#devProjectId, upload).catch((error: unknown) => {
      //? A server older than staged uploads has no such route: its 404 is a page, where every refusal is an Err key.
      const message = error instanceof Error ? error.message : String(error);
      if (CloudApi.statusOf(error) === 404 && !/"error"\s*:\s*"[\w$-]+\.error\.[\w$-]+"/.test(message))
        throw new Error(
          "The project's server does not take direct pack uploads yet: update akasys and try again, or upload the pack from the project's release screen.",
        );
      throw error;
    });
  }

  // The URL signs only its host: an unsigned x-amz-* header (a checksum included) makes storage refuse the PUT.
  // A Bun fetch error names the URL, a bearer credential, so nothing but the status leaves this method.
  async #put(url: string, contentType: string, file: BunFile) {
    for (let retry = 0; ; retry++) {
      const status = await fetch(url, { method: "PUT", body: file, headers: { "Content-Type": contentType } })
        .then(async (response) => {
          await response.arrayBuffer().catch(() => undefined);
          return response.status;
        })
        .catch(() => 0);
      if (retry === 3 || !UpdatePackUpload.#transientPut.has(status)) return status;
      await sleep(this.#putRetryMs * (retry + 1));
    }
  }

  // The server finishes a commit whoever stopped listening, and the same id answers the same release afterwards.
  // A 409 is a live claim the server heartbeats, so only the overall limit bounds it; a run of cut-offs with no 409
  // between them may be a server that died, whose claim lapses within minutes, so that run gets the shorter window.
  async #commit(uploadId: string) {
    const limit = performance.now() + this.#commitLimitMs;
    let cutOffSince: number | null = null;
    for (;;) {
      try {
        return await this.#api.commitUpdateUpload(this.#devProjectId, uploadId);
      } catch (error) {
        const now = performance.now();
        if (CloudApi.statusOf(error) === 409) cutOffSince = null;
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

  static #cutOff(error: unknown) {
    const status = CloudApi.statusOf(error);
    if (status === null) return !(error instanceof SyntaxError);
    return status === 502 || status === 504 || (status >= 520 && status <= 527);
  }
}
