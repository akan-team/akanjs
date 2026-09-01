import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import type { App } from "../commandDecorators";

const COMPRESSIBLE_EXTS = new Set([".css", ".html", ".js", ".json", ".svg"]);
const MIN_COMPRESS_BYTES = 1024;
/**
 * Quality 11 is roughly 100x slower than gzip, so it is spent only where it pays: there is one CSS asset
 * per basePath and it is the largest single file the app ships, worth ~20% over gzip for ~0.2s. Raising the
 * several hundred JS chunks from 9 to 11 costs ~12s of build time to save a few hundred KB, so they stay at 9.
 */
const BROTLI_QUALITY_BY_EXT = { ".css": 11 } as const;
const DEFAULT_BROTLI_QUALITY = 9;
const GZIP_LEVEL = 9;

export interface PrecompressArtifactsResult {
  files: number;
  inputBytes: number;
  outputBytes: number;
  brotliBytes: number;
}

export async function precompressArtifacts(app: App): Promise<PrecompressArtifactsResult> {
  //* styles too: WebRouter serves both prefixes through the same sidecar-aware #fileResponse, and the
  //* one CSS asset per basePath is the largest uncompressed payload the app ships.
  const roots = [
    path.join(app.dist.cwdPath, ".akan/artifact/client"),
    path.join(app.dist.cwdPath, ".akan/artifact/styles"),
  ];
  const result: PrecompressArtifactsResult = { files: 0, inputBytes: 0, outputBytes: 0, brotliBytes: 0 };

  await Promise.all(roots.map((root) => precompressRoot(root, result)));
  if (result.files > 0) {
    app.verbose(
      `[precompress] wrote ${result.files} sidecars (${formatBytes(result.inputBytes)} -> gzip ${formatBytes(
        result.outputBytes,
      )} / br ${formatBytes(result.brotliBytes)})`,
    );
  }
  return result;
}

async function precompressRoot(root: string, result: PrecompressArtifactsResult): Promise<void> {
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) return;
  const glob = new Bun.Glob("**/*");
  for await (const filePath of glob.scan({ cwd: root, absolute: true })) {
    if (!(await shouldPrecompress(filePath))) continue;
    const bytes = await Bun.file(filePath).bytes();
    const buffer = toArrayBuffer(bytes);
    const gz = Bun.gzipSync(buffer, { level: GZIP_LEVEL });
    const br = brotliCompress(buffer, path.extname(filePath).toLowerCase());
    await Promise.all([Bun.write(`${filePath}.gz`, gz), Bun.write(`${filePath}.br`, br)]);
    result.files += 1;
    result.inputBytes += bytes.byteLength;
    result.outputBytes += gz.byteLength;
    result.brotliBytes += br.byteLength;
  }
}

function brotliCompress(buffer: ArrayBuffer, ext: string): Buffer {
  const quality = BROTLI_QUALITY_BY_EXT[ext as keyof typeof BROTLI_QUALITY_BY_EXT] ?? DEFAULT_BROTLI_QUALITY;
  return zlib.brotliCompressSync(buffer, {
    params: {
      [zlib.constants.BROTLI_PARAM_QUALITY]: quality,
      [zlib.constants.BROTLI_PARAM_SIZE_HINT]: buffer.byteLength,
    },
  });
}

async function shouldPrecompress(filePath: string): Promise<boolean> {
  if (filePath.endsWith(".gz") || filePath.endsWith(".br")) return false;
  if (!COMPRESSIBLE_EXTS.has(path.extname(filePath).toLowerCase())) return false;
  const file = Bun.file(filePath);
  if (!(await file.exists())) return false;
  return file.size >= MIN_COMPRESS_BYTES;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}
