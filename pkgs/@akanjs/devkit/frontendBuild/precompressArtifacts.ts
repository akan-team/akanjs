import fs from "node:fs";
import path from "node:path";
import type { App } from "../commandDecorators";

const COMPRESSIBLE_EXTS = new Set([".css", ".html", ".js", ".json", ".svg"]);
const MIN_COMPRESS_BYTES = 1024;

export interface PrecompressArtifactsResult {
  files: number;
  inputBytes: number;
  outputBytes: number;
}

export async function precompressArtifacts(app: App): Promise<PrecompressArtifactsResult> {
  const roots = [path.join(app.dist.cwdPath, ".akan/artifact/client")];
  const result: PrecompressArtifactsResult = { files: 0, inputBytes: 0, outputBytes: 0 };

  await Promise.all(roots.map((root) => precompressRoot(root, result)));
  if (result.files > 0) {
    app.verbose(
      `[precompress] wrote ${result.files} gzip sidecars (${formatBytes(result.inputBytes)} -> ${formatBytes(
        result.outputBytes,
      )})`,
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
    const gz = Bun.gzipSync(toArrayBuffer(bytes));
    await Bun.write(`${filePath}.gz`, gz);
    result.files += 1;
    result.inputBytes += bytes.byteLength;
    result.outputBytes += gz.byteLength;
  }
}

async function shouldPrecompress(filePath: string): Promise<boolean> {
  if (filePath.endsWith(".gz")) return false;
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
