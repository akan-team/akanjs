import { brotliCompressSync, constants, gzipSync } from "node:zlib";

const COMPRESSIBLE_TYPES = new Set([
  "application/javascript",
  "application/json",
  "application/manifest+json",
  "image/svg+xml",
]);

// gzip stays as the fallback: browsers only advertise `br` on secure origins.
export const CONTENT_ENCODINGS = [
  { encoding: "br", ext: ".br", accept: /(?:^|,)\s*(?:br|\*)(?![\w-])\s*(?:;\s*q=([\d.]+))?/i },
  { encoding: "gzip", ext: ".gz", accept: /(?:^|,)\s*(?:gzip|\*)(?![\w-])\s*(?:;\s*q=([\d.]+))?/i },
] as const;

export type ContentEncoding = (typeof CONTENT_ENCODINGS)[number]["encoding"];

/** `q=0` is an explicit refusal, not a preference. */
export const acceptsEncoding = (acceptEncoding: string, accept: RegExp): boolean => {
  const match = accept.exec(acceptEncoding);
  return !!match && !(match[1] !== undefined && Number.parseFloat(match[1]) <= 0);
};

export const isCompressibleContentType = (contentType: string): boolean => {
  const type = contentType.split(";")[0]?.trim().toLowerCase() ?? "";
  // An event stream never ends, so a sidecar lookup or a buffering compressor would wait forever.
  if (type === "text/event-stream") return false;
  return type.startsWith("text/") || COMPRESSIBLE_TYPES.has(type);
};

// Not brotli's default 11: q11 spends tens of ms per response to save a few hundred bytes over q4.
const BROTLI_QUALITY = 4;
const GZIP_LEVEL = 6;
/** Under a KB the framing bytes and the call cost more than the repetition they remove. */
const MIN_COMPRESS_BYTES = 1024;
//? Compressing blocks the event loop, ~6 ms (br) and ~12 ms (gzip) per MiB of JSON on an M-series core.
const MAX_COMPRESS_BYTES = 4 * 1024 * 1024;

const compressBody = (bytes: Uint8Array, encoding: ContentEncoding) =>
  encoding === "br"
    ? brotliCompressSync(bytes, {
        params: {
          [constants.BROTLI_PARAM_QUALITY]: BROTLI_QUALITY,
          [constants.BROTLI_PARAM_SIZE_HINT]: bytes.byteLength,
        },
      })
    : gzipSync(bytes, { level: GZIP_LEVEL });

//? A Range is Bun.serve's to answer: it sends a file body it gets untouched as a 206 of exactly those bytes.
const isWholeBody = (req: Request, response: Response) =>
  !req.headers.has("range") &&
  !response.headers.has("content-range") &&
  response.status >= 200 &&
  response.status < 300 &&
  response.status !== 206;

// Buffers the body: never pass a streamed response (SSR HTML, RSC flight, SSE) — it would hold the whole render.
export const compressResponse = async (req: Request, response: Response): Promise<Response> => {
  if (response.headers.has("content-encoding") || !response.body) return response;
  if (!isWholeBody(req, response)) return response;
  if (Number(response.headers.get("content-length")) > MAX_COMPRESS_BYTES) return response;
  if (!isCompressibleContentType(response.headers.get("content-type") ?? "")) return response;
  if (process.env.AKAN_HTTP_COMPRESS === "false" || process.env.AKAN_HTTP_COMPRESS === "0") return response;
  const acceptEncoding = req.headers.get("accept-encoding") ?? "";
  const encoding = CONTENT_ENCODINGS.find(({ accept }) => acceptsEncoding(acceptEncoding, accept))?.encoding;
  if (!encoding) return response;
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength < MIN_COMPRESS_BYTES) return new Response(bytes, response);
  const compressed = compressBody(bytes, encoding);
  const headers = new Headers(response.headers);
  headers.set("Content-Encoding", encoding);
  headers.set("Content-Length", String(compressed.byteLength));
  // Without it a shared cache can hand a br body to a client that never asked for one.
  headers.append("Vary", "Accept-Encoding");
  return new Response(compressed, { status: response.status, statusText: response.statusText, headers });
};

export interface EncodedSidecar {
  bytes: ArrayBuffer;
  encoding: string;
}

export const resolveEncodedSidecar = async (
  req: Request,
  filePath: string,
  contentType: string,
): Promise<EncodedSidecar | null> => {
  if (!isCompressibleContentType(contentType)) return null;
  const acceptEncoding = req.headers.get("accept-encoding") ?? "";
  for (const { encoding, ext, accept } of CONTENT_ENCODINGS) {
    if (!acceptsEncoding(acceptEncoding, accept)) continue;
    const file = Bun.file(`${filePath}${ext}`);
    if (!(await file.exists())) continue;
    const bytes = await file.bytes();
    const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    return { bytes: buffer, encoding };
  }
  return null;
};

// A precompressed `.br`/`.gz` sibling when the client takes one, else the file itself.
export const encodedFileResponse = async (
  req: Request,
  filePath: string,
  contentType: string,
  headers: Headers,
): Promise<Response> => {
  const sidecar = await resolveEncodedSidecar(req, filePath, contentType);
  if (!sidecar) return new Response(Bun.file(filePath).stream(), { headers });
  headers.set("Content-Encoding", sidecar.encoding);
  headers.set("Content-Length", String(sidecar.bytes.byteLength));
  headers.set("Vary", "Accept-Encoding");
  return new Response(sidecar.bytes, { headers });
};
