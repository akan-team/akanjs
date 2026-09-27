// Binary deltas for app updates (UP-1): new = old + a list of copy / insert operations.
//
// Electrobun patches its update tarballs with bsdiff (zig-bsdiff, electrobun-v1/package/src/cli/
// index.ts:3788-3927). bsdiff builds a suffix array of the whole old file (≈8× its size in memory,
// minutes in JavaScript for a 60 MB bun-compiled executable). The files that change between akan-native
// releases change in blocks (the app's JS appended to an unchanged Bun runtime, resources), which
// an rsync-style block match finds in one pass: blocks of the old file are indexed by a rolling
// checksum, and the new file is scanned for them. Unmatched bytes are stored literally.
//
// Format (little-endian): "AKANDLT1", u64 old size, u64 new size, 32-byte sha256 of old, 32-byte
// sha256 of new, then ops: 0x01 u64 offset u32 length (copy from old) | 0x02 u32 length bytes
// (insert) | 0x00 (end). The applier checks both hashes, so a wrong base fails loudly.

import { createHash } from "node:crypto";

const MAGIC = new TextEncoder().encode("AKANDLT1");
const BLOCK = 8 * 1024;
const MOD = 65521;

const sha256 = (data: Uint8Array) => new Uint8Array(createHash("sha256").update(data).digest());

/** Adler-32 style checksum of data[start, start+len). */
function weak(data: Uint8Array, start: number, len: number): { a: number; b: number } {
  let a = 1;
  let b = 0;
  for (let i = start; i < start + len; i++) {
    a = (a + data[i]!) % MOD;
    b = (b + a) % MOD;
  }
  return { a, b };
}

const strong = (data: Uint8Array, start: number, len: number) => Bun.hash(data.subarray(start, start + len));

class Writer {
  private chunks: Uint8Array[] = [];
  private size = 0;
  bytes(b: Uint8Array) {
    this.chunks.push(b);
    this.size += b.length;
  }
  u8(v: number) {
    this.bytes(Uint8Array.of(v));
  }
  u32(v: number) {
    const b = new Uint8Array(4);
    new DataView(b.buffer).setUint32(0, v, true);
    this.bytes(b);
  }
  u64(v: number) {
    const b = new Uint8Array(8);
    new DataView(b.buffer).setBigUint64(0, BigInt(v), true);
    this.bytes(b);
  }
  result(): Uint8Array<ArrayBuffer> {
    const out = new Uint8Array(this.size);
    let at = 0;
    for (const c of this.chunks) {
      out.set(c, at);
      at += c.length;
    }
    return out;
  }
}

export function createDelta(oldData: Uint8Array, newData: Uint8Array): Uint8Array<ArrayBuffer> {
  const w = new Writer();
  w.bytes(MAGIC);
  w.u64(oldData.length);
  w.u64(newData.length);
  w.bytes(sha256(oldData));
  w.bytes(sha256(newData));

  // Index the old file's whole blocks: weak checksum → block starts.
  const index = new Map<number, number[]>();
  for (let start = 0; start + BLOCK <= oldData.length; start += BLOCK) {
    const { a, b } = weak(oldData, start, BLOCK);
    const key = (b << 16) | a;
    const list = index.get(key);
    if (list) list.push(start);
    else index.set(key, [start]);
  }

  let literalStart = 0;
  let copyFrom = -1;
  let copyLength = 0;
  const flushLiteral = (end: number) => {
    if (end > literalStart) {
      w.u8(2);
      w.u32(end - literalStart);
      w.bytes(newData.subarray(literalStart, end));
    }
  };
  const flushCopy = () => {
    if (copyLength > 0) {
      w.u8(1);
      w.u64(copyFrom);
      w.u32(copyLength);
    }
    copyLength = 0;
    copyFrom = -1;
  };

  let i = 0;
  let sums = newData.length >= BLOCK ? weak(newData, 0, BLOCK) : null;
  while (sums && i + BLOCK <= newData.length) {
    const key = (sums.b << 16) | sums.a;
    const candidates = index.get(key);
    let match = -1;
    if (candidates) {
      const h = strong(newData, i, BLOCK);
      // Prefer the block right after the previous copy (long runs merge into one op).
      const next = copyFrom >= 0 ? copyFrom + copyLength : -1;
      for (const start of candidates) {
        if (strong(oldData, start, BLOCK) === h && (match < 0 || start === next)) match = start;
        if (match === next) break;
      }
    }
    if (match >= 0) {
      if (copyLength > 0 && copyFrom + copyLength === match && literalStart === i) {
        copyLength += BLOCK;
      } else {
        flushCopy();
        flushLiteral(i);
        copyFrom = match;
        copyLength = BLOCK;
      }
      i += BLOCK;
      literalStart = i;
      sums = i + BLOCK <= newData.length ? weak(newData, i, BLOCK) : null;
      continue;
    }
    // Roll the window one byte.
    if (copyLength > 0 && literalStart === i) flushCopy();
    const out = newData[i]!;
    const inn = newData[i + BLOCK];
    i++;
    if (inn === undefined) break;
    const a = (sums.a - out + inn + MOD * 2) % MOD;
    const b = (sums.b - BLOCK * out + a - 1 + MOD * BLOCK * 2) % MOD;
    sums = { a, b: ((b % MOD) + MOD) % MOD };
  }
  flushCopy();
  literalStart = Math.min(literalStart, newData.length);
  flushLiteral(newData.length);
  w.u8(0);
  return w.result();
}

export function applyDelta(oldData: Uint8Array, delta: Uint8Array): Uint8Array<ArrayBuffer> {
  const view = new DataView(delta.buffer, delta.byteOffset, delta.byteLength);
  const fail = (why: string): never => {
    throw new Error(`bad delta: ${why}`);
  };
  if (delta.length < 8 + 16 + 64 || !MAGIC.every((b, i) => delta[i] === b)) fail("not an akan-native delta");
  const oldSize = Number(view.getBigUint64(8, true));
  const newSize = Number(view.getBigUint64(16, true));
  const oldHash = delta.subarray(24, 56);
  const newHash = delta.subarray(56, 88);
  if (oldData.length !== oldSize || !sha256(oldData).every((b, i) => b === oldHash[i]))
    fail("made for another base file");
  const out = new Uint8Array(newSize);
  let at = 0;
  let p = 88;
  for (;;) {
    const op = delta[p++];
    if (op === 0) break;
    if (op === 1) {
      const offset = Number(view.getBigUint64(p, true));
      const length = view.getUint32(p + 8, true);
      p += 12;
      if (offset + length > oldData.length || at + length > newSize) fail("copy out of range");
      out.set(oldData.subarray(offset, offset + length), at);
      at += length;
    } else if (op === 2) {
      const length = view.getUint32(p, true);
      p += 4;
      if (p + length > delta.length || at + length > newSize) fail("insert out of range");
      out.set(delta.subarray(p, p + length), at);
      p += length;
      at += length;
    } else fail(`unknown op ${op}`);
  }
  if (at !== newSize || !sha256(out).every((b, i) => b === newHash[i])) fail("result does not match");
  return out;
}
