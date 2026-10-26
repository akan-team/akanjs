import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import type { App } from "../commandDecorators";
import { FontPruner } from "./fontPruner";

const COMPRESSIBLE_EXTS = new Set([".css", ".html", ".js", ".json", ".svg"]);
const MIN_COMPRESS_BYTES = 1024;
// Brotli 11 is ~100x slower than gzip: worth it for the one CSS asset per basePath and one dictionary per locale, not
// for hundreds of JS chunks.
const MAX_BROTLI_QUALITY = 11;
const BROTLI_QUALITY_BY_EXT = { ".css": MAX_BROTLI_QUALITY } as const;
const DEFAULT_BROTLI_QUALITY = 9;
const GZIP_LEVEL = 9;
const { formatBytes } = FontPruner;

export interface PrecompressArtifactsResult {
  files: number;
  inputBytes: number;
  outputBytes: number;
  brotliBytes: number;
}

export async function precompressArtifacts(app: App): Promise<PrecompressArtifactsResult> {
  //* WebRouter serves client/, styles/ and dict/ through the same sidecar-aware #fileResponse.
  const artifactDir = path.join(app.dist.cwdPath, ".akan/artifact");
  const roots = [
    { root: path.join(artifactDir, "client") },
    { root: path.join(artifactDir, "styles") },
    { root: path.join(artifactDir, "dict"), brotliQuality: MAX_BROTLI_QUALITY },
  ];
  const result: PrecompressArtifactsResult = { files: 0, inputBytes: 0, outputBytes: 0, brotliBytes: 0 };

  await Promise.all(roots.map(({ root, brotliQuality }) => precompressRoot(root, result, brotliQuality)));
  if (result.files > 0) {
    app.verbose(
      `[precompress] wrote ${result.files} sidecars (${formatBytes(result.inputBytes)} -> gzip ${formatBytes(
        result.outputBytes,
      )} / br ${formatBytes(result.brotliBytes)})`,
    );
  }
  return result;
}

async function precompressRoot(
  root: string,
  result: PrecompressArtifactsResult,
  brotliQuality?: number,
): Promise<void> {
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) return;
  const glob = new Bun.Glob("**/*");
  for await (const filePath of glob.scan({ cwd: root, absolute: true })) {
    if (!(await shouldPrecompress(filePath))) continue;
    const bytes = await Bun.file(filePath).bytes();
    const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    const gz = Bun.gzipSync(buffer, { level: GZIP_LEVEL });
    const br = brotliCompress(buffer, brotliQuality ?? brotliQualityOf(path.extname(filePath).toLowerCase()));
    await Promise.all([Bun.write(`${filePath}.gz`, gz), Bun.write(`${filePath}.br`, br)]);
    result.files += 1;
    result.inputBytes += bytes.byteLength;
    result.outputBytes += gz.byteLength;
    result.brotliBytes += br.byteLength;
  }
}

function brotliQualityOf(ext: string): number {
  return BROTLI_QUALITY_BY_EXT[ext as keyof typeof BROTLI_QUALITY_BY_EXT] ?? DEFAULT_BROTLI_QUALITY;
}

function brotliCompress(buffer: ArrayBuffer, quality: number): Buffer {
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
