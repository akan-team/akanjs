// FileRef release (bridge v1.1 `cancel` feature: `$bridge.release`).

import { AkanNativeError } from "./errors.ts";
import { BRIDGE_PLUGIN, type FileRef, RELEASE } from "./protocol.ts";
import { runtime } from "./runtime.ts";

/**
 * Stops serving a FileRef. FileRefs live for the app session (architecture review, 2026-09-26), so
 * release the ones the page no longer shows: photos, picked files, downloads. The host forgets the
 * URL and deletes akan-native's own copy of the file; files that belong to the user (a document served in
 * place) stay. Holding the URL is the permission, as for any follow-up on what a call handed out.
 * Resolves whether it was served. On the web, a blob: URL is revoked.
 */
export async function releaseFile(file: FileRef | string): Promise<boolean> {
  const url = typeof file === "string" ? file : file?.url;
  if (typeof url !== "string") throw new AkanNativeError("INVALID_ARGS", "releaseFile needs a FileRef or its url");
  const rt = runtime();
  if (!rt.transport) {
    if (!url.startsWith("blob:")) return false;
    URL.revokeObjectURL(url);
    return true;
  }
  const response = await rt.transport.send({
    v: 1,
    id: ++rt.nextId,
    plugin: BRIDGE_PLUGIN,
    method: RELEASE,
    args: { url },
  });
  if (!response.ok) throw AkanNativeError.fromBody(response.error);
  return (response.result as { released?: unknown } | undefined)?.released === true;
}

export interface FileReadOptions {
  /** Bytes per Range request. Default 4 MiB. */
  chunkSize?: number;
  signal?: AbortSignal;
}

const CONTENT_RANGE = /^bytes (\d+)-(\d+)\/(\d+|\*)$/;

/**
 * Reads a FileRef (or any same-origin URL) in pieces with HTTP Range requests, so a big file never
 * has to be one response: the desktop shell answers without streaming (WRY), reading a whole
 * response into memory (architecture review stage 4). Every host serves FileRefs with
 * `Accept-Ranges: bytes`. A server that ignores Range (200) is streamed as it answers.
 */
export function fileStream(file: FileRef | string, options: FileReadOptions = {}): ReadableStream<Uint8Array> {
  const url = typeof file === "string" ? file : file.url;
  const chunk = Math.max(1, Math.floor(options.chunkSize ?? 4 << 20));
  let offset = 0;
  let total: number | null = typeof file === "object" && Number.isFinite(file.size) ? file.size : null;
  let whole: ReadableStreamDefaultReader<Uint8Array> | null = null;
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        if (whole) {
          const { done, value } = await whole.read();
          if (done) controller.close();
          else controller.enqueue(value);
          return;
        }
        if (total !== null && offset >= total) return controller.close();
        const response = await fetch(url, {
          headers: { range: `bytes=${offset}-${offset + chunk - 1}` },
          ...(options.signal ? { signal: options.signal } : {}),
        });
        if (response.status === 416 && total === null) return controller.close(); // empty file
        if (response.status === 200) {
          // No Range support: take the body as it comes.
          whole = response.body!.getReader();
          return this.pull!(controller);
        }
        if (response.status !== 206)
          throw new AkanNativeError(
            response.status === 404 ? "NOT_FOUND" : "INTERNAL",
            `${url}: HTTP ${response.status}`,
          );
        const range = CONTENT_RANGE.exec(response.headers.get("content-range") ?? "");
        if (range && range[3] !== "*") total = Number(range[3]);
        const bytes = new Uint8Array(await response.arrayBuffer());
        offset += bytes.length;
        if (bytes.length) controller.enqueue(bytes);
        if (bytes.length === 0 || (total !== null && offset >= total)) controller.close();
      } catch (error) {
        controller.error(AkanNativeError.from(error));
      }
    },
    cancel() {
      void whole?.cancel();
    },
  });
}

/** A FileRef as a Blob, read in Range pieces (see fileStream); `type` is the FileRef's MIME type. */
export async function fileBlob(file: FileRef | string, options: FileReadOptions = {}): Promise<Blob> {
  const parts: Uint8Array[] = [];
  const reader = fileStream(file, options).getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    parts.push(value);
  }
  return new Blob(parts as BlobPart[], typeof file === "object" && file.mime ? { type: file.mime } : {});
}
