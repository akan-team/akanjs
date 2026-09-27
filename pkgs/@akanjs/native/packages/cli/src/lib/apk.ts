// APK assembler in Bun, replacing `zip` + `zipalign` (verified in docs/research/android.md §2.5):
// - copies the aapt2 output (AndroidManifest.xml, resources.arsc) byte for byte
// - adds dex files STORED and assets (deflate for text, store for already compressed media)
// - aligns every STORED entry's data on 4 bytes with the 0xD935 extra field, like `zipalign 4`
// Sign afterwards: v2/v3 signatures cover the whole file.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { deflateRawSync } from "node:zlib";

interface Entry {
  name: string;
  method: 0 | 8;
  crc: number;
  compressedSize: number;
  size: number;
  data: Uint8Array;
}

const STORE_EXT = new Set([
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "avif",
  "heic",
  "mp4",
  "webm",
  "mov",
  "mp3",
  "m4a",
  "ogg",
  "woff",
  "woff2",
  "zip",
  "gz",
  "br",
]);
const DOS_DATE = (0 << 9) | (1 << 5) | 1; // 1980-01-01, fixed so builds are reproducible
const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function readZip(buf: Uint8Array): Entry[] {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let eocd = buf.length - 22;
  while (eocd >= 0 && view.getUint32(eocd, true) !== 0x06054b50) eocd--;
  if (eocd < 0) throw new Error("not a zip file (no end of central directory)");
  const count = view.getUint16(eocd + 10, true);
  let p = view.getUint32(eocd + 16, true);
  const entries: Entry[] = [];
  for (let i = 0; i < count; i++) {
    if (view.getUint32(p, true) !== 0x02014b50) throw new Error("bad central directory header");
    const method = view.getUint16(p + 10, true);
    if (method !== 0 && method !== 8) throw new Error(`unsupported compression method ${method}`);
    const nameLength = view.getUint16(p + 28, true);
    const extraLength = view.getUint16(p + 30, true);
    const commentLength = view.getUint16(p + 32, true);
    const localOffset = view.getUint32(p + 42, true);
    const compressedSize = view.getUint32(p + 20, true);
    const dataStart =
      localOffset + 30 + view.getUint16(localOffset + 26, true) + view.getUint16(localOffset + 28, true);
    entries.push({
      name: decoder.decode(buf.subarray(p + 46, p + 46 + nameLength)),
      method,
      crc: view.getUint32(p + 16, true),
      compressedSize,
      size: view.getUint32(p + 24, true),
      data: buf.subarray(dataStart, dataStart + compressedSize),
    });
    p += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

export function fileEntry(name: string, bytes: Uint8Array, store: boolean): Entry {
  const crc = Bun.hash.crc32(bytes) >>> 0;
  if (!store) {
    const deflated = deflateRawSync(bytes, { level: 9 });
    if (deflated.length < bytes.length)
      return { name, method: 8, crc, compressedSize: deflated.length, size: bytes.length, data: deflated };
  }
  return { name, method: 0, crc, compressedSize: bytes.length, size: bytes.length, data: bytes };
}

export function writeZip(entries: Entry[]): Uint8Array {
  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const e of entries) {
    const name = encoder.encode(e.name);
    let extra: Uint8Array = new Uint8Array(0);
    if (e.method === 0) {
      // 0xD935 record: id(2) size(2) alignment(2) + padding so the data starts on 4 bytes.
      const base = offset + 30 + name.length;
      const pad = (4 - ((base + 6) % 4)) % 4;
      extra = new Uint8Array(6 + pad);
      const xv = new DataView(extra.buffer);
      xv.setUint16(0, 0xd935, true);
      xv.setUint16(2, 2 + pad, true);
      xv.setUint16(4, 4, true);
    }
    const local = new Uint8Array(30);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, 0x0800, true); // UTF-8 names
    lv.setUint16(8, e.method, true);
    lv.setUint16(12, DOS_DATE, true);
    lv.setUint32(14, e.crc, true);
    lv.setUint32(18, e.compressedSize, true);
    lv.setUint32(22, e.size, true);
    lv.setUint16(26, name.length, true);
    lv.setUint16(28, extra.length, true);

    const header = new Uint8Array(46);
    const cv = new DataView(header.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0x0800, true);
    cv.setUint16(10, e.method, true);
    cv.setUint16(14, DOS_DATE, true);
    cv.setUint32(16, e.crc, true);
    cv.setUint32(20, e.compressedSize, true);
    cv.setUint32(24, e.size, true);
    cv.setUint16(28, name.length, true);
    cv.setUint32(42, offset, true);

    central.push(header, name);
    chunks.push(local, name, extra, e.data);
    offset += 30 + name.length + extra.length + e.data.length;
  }
  const centralSize = central.reduce((n, c) => n + c.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);

  const all = [...chunks, ...central, end];
  const out = new Uint8Array(all.reduce((n, c) => n + c.length, 0));
  let p = 0;
  for (const c of all) {
    out.set(c, p);
    p += c.length;
  }
  return out;
}

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

export interface ApkInput {
  /** aapt2 link output (manifest + resources, no assets). */
  base: Uint8Array;
  /** classes.dex, classes2.dex, ... in order. */
  dex: Uint8Array[];
  /** Folder whose content goes under assets/. */
  assetsDir: string;
  /**
   * More files by their path in the APK (O8): lib/<abi>/*.so of pinned libraries (compressed: the
   * installer extracts them, extractNativeLibs is not set) and META-INF/services/* for ServiceLoader.
   */
  extra?: { name: string; bytes: Uint8Array }[];
}

export function assembleApk({ base, dex, assetsDir, extra = [] }: ApkInput): Uint8Array {
  const entries = readZip(base);
  for (const [i, bytes] of dex.entries())
    entries.push(fileEntry(i === 0 ? "classes.dex" : `classes${i + 1}.dex`, bytes, true));
  for (const e of extra) entries.push(fileEntry(e.name, e.bytes, false));
  for (const file of walk(assetsDir).sort()) {
    const rel = relative(assetsDir, file).split("\\").join("/");
    const ext = rel.split(".").pop()!.toLowerCase();
    entries.push(fileEntry(`assets/${rel}`, new Uint8Array(readFileSync(file)), STORE_EXT.has(ext)));
  }
  return writeZip(entries);
}

/**
 * The base module of an Android App Bundle (akanjs readiness O1-5), for `bundletool build-bundle
 * --modules`: aapt2's --proto-format output with its manifest under manifest/ (resources.pb and res/
 * stay at the root), the dex files under dex/ and the assets under assets/. bundletool decides the
 * APKs' compression and alignment itself.
 */
export function assembleBundleModule({ base, dex, assetsDir, extra = [] }: ApkInput): Uint8Array {
  const entries = readZip(base).map((e) =>
    e.name === "AndroidManifest.xml" ? { ...e, name: "manifest/AndroidManifest.xml" } : e,
  );
  for (const [i, bytes] of dex.entries())
    entries.push(fileEntry(`dex/${i === 0 ? "classes.dex" : `classes${i + 1}.dex`}`, bytes, false));
  // Native libraries keep their lib/<abi>/ path; other files of the APK root go under root/.
  for (const e of extra) entries.push(fileEntry(e.name.startsWith("lib/") ? e.name : `root/${e.name}`, e.bytes, false));
  for (const file of walk(assetsDir).sort()) {
    const rel = relative(assetsDir, file).split("\\").join("/");
    const ext = rel.split(".").pop()!.toLowerCase();
    entries.push(fileEntry(`assets/${rel}`, new Uint8Array(readFileSync(file)), STORE_EXT.has(ext)));
  }
  return writeZip(entries);
}
