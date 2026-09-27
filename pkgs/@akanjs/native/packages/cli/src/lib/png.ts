// A small PNG codec for icon generation (CLI-8), so builds need no image tool (sips, ImageMagick).
// Decodes non-interlaced PNGs of every color type (bit depths 1–16) into 8-bit RGBA and
// encodes 8-bit RGBA with a per-row filter choice, as libpng's heuristic does.

import { deflateSync, inflateSync } from "node:zlib";

/** 8-bit RGBA, not premultiplied, rows top to bottom. */
export interface Image {
  width: number;
  height: number;
  data: Uint8Array;
}

const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const CHANNELS: Record<number, number> = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };
const DEPTHS: Record<number, number[]> = { 0: [1, 2, 4, 8, 16], 2: [8, 16], 3: [1, 2, 4, 8], 4: [8, 16], 6: [8, 16] };

export class PngError extends Error {}

function crc(type: Uint8Array, data: Uint8Array): number {
  const both = new Uint8Array(type.length + data.length);
  both.set(type);
  both.set(data, type.length);
  return Bun.hash.crc32(both) >>> 0;
}

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

export function decodePng(bytes: Uint8Array): Image {
  if (bytes.length < 8 || SIGNATURE.some((b, i) => bytes[i] !== b)) throw new PngError("not a PNG file");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let width = 0;
  let height = 0;
  let depth = 0;
  let colorType = -1;
  let palette: Uint8Array | null = null;
  let trns: Uint8Array | null = null;
  const idat: Uint8Array[] = [];
  let p = 8;
  for (;;) {
    if (p + 12 > bytes.length) throw new PngError("truncated PNG (no IEND chunk)");
    const length = view.getUint32(p);
    const type = bytes.subarray(p + 4, p + 8);
    const name = String.fromCharCode(...type);
    if (p + 12 + length > bytes.length) throw new PngError(`truncated PNG (${name} chunk)`);
    const data = bytes.subarray(p + 8, p + 8 + length);
    if (view.getUint32(p + 8 + length) !== crc(type, data)) throw new PngError(`corrupt PNG (bad CRC in ${name})`);
    p += 12 + length;
    if (name === "IHDR") {
      const h = new DataView(data.buffer, data.byteOffset, data.byteLength);
      width = h.getUint32(0);
      height = h.getUint32(4);
      depth = data[8]!;
      colorType = data[9]!;
      if (!(colorType in CHANNELS) || !DEPTHS[colorType]!.includes(depth))
        throw new PngError(`invalid PNG color type ${colorType} with bit depth ${depth}`);
      if (data[12] !== 0)
        throw new PngError("interlaced PNGs are not supported: save the image without interlacing (Adam7)");
      if (!width || !height || width > 16384 || height > 16384)
        throw new PngError(`unsupported PNG size ${width}×${height}`);
    } else if (name === "PLTE") palette = data;
    else if (name === "tRNS") trns = data;
    else if (name === "IDAT") idat.push(data);
    else if (name === "IEND") break;
  }
  if (!width) throw new PngError("PNG has no IHDR chunk");
  if (colorType === 3 && !palette) throw new PngError("palette PNG without a PLTE chunk");

  const compressed = new Uint8Array(idat.reduce((n, c) => n + c.length, 0));
  let o = 0;
  for (const chunk of idat) {
    compressed.set(chunk, o);
    o += chunk.length;
  }
  let raw: Uint8Array;
  try {
    raw = new Uint8Array(inflateSync(compressed));
  } catch (error) {
    throw new PngError(`corrupt PNG image data: ${(error as Error).message}`);
  }

  const channels = CHANNELS[colorType]!;
  const bitsPerPixel = channels * depth;
  const bpp = Math.max(1, bitsPerPixel >> 3); // filter distance in bytes
  const stride = Math.ceil((width * bitsPerPixel) / 8);
  if (raw.length < height * (stride + 1)) throw new PngError("PNG image data is shorter than its size");

  // Undo the row filters in place (PNG spec §9).
  const rows = new Uint8Array(height * stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]!;
    const src = y * (stride + 1) + 1;
    const dst = y * stride;
    const up = dst - stride;
    for (let x = 0; x < stride; x++) {
      const v = raw[src + x]!;
      const a = x >= bpp ? rows[dst + x - bpp]! : 0;
      const b = y > 0 ? rows[up + x]! : 0;
      const c = x >= bpp && y > 0 ? rows[up + x - bpp]! : 0;
      let out: number;
      switch (filter) {
        case 0:
          out = v;
          break;
        case 1:
          out = v + a;
          break;
        case 2:
          out = v + b;
          break;
        case 3:
          out = v + ((a + b) >> 1);
          break;
        case 4:
          out = v + paeth(a, b, c);
          break;
        default:
          throw new PngError(`corrupt PNG (filter type ${filter})`);
      }
      rows[dst + x] = out & 0xff;
    }
  }

  // Samples → 8-bit RGBA.
  const sample = (row: number, index: number): number => {
    if (depth === 8) return rows[row + index]!;
    if (depth === 16) return (rows[row + index * 2]! << 8) | rows[row + index * 2 + 1]!;
    const bit = index * depth;
    return (rows[row + (bit >> 3)]! >> (8 - depth - (bit & 7))) & ((1 << depth) - 1);
  };
  const max = (1 << depth) - 1;
  const to8 = (v: number) => (depth === 8 ? v : depth === 16 ? v >> 8 : Math.round((v * 255) / max));
  const key =
    trns && colorType !== 3
      ? Array.from({ length: trns.length >> 1 }, (_, i) => (trns![i * 2]! << 8) | trns![i * 2 + 1]!)
      : null;
  const out = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    const row = y * stride;
    for (let x = 0; x < width; x++) {
      const q = (y * width + x) * 4;
      if (colorType === 3) {
        const i = sample(row, x);
        if (i * 3 + 2 >= palette!.length) throw new PngError(`palette index ${i} out of range`);
        out[q] = palette![i * 3]!;
        out[q + 1] = palette![i * 3 + 1]!;
        out[q + 2] = palette![i * 3 + 2]!;
        out[q + 3] = trns && i < trns.length ? trns[i]! : 255;
      } else if (colorType === 0 || colorType === 4) {
        const g = sample(row, x * channels);
        out[q] = out[q + 1] = out[q + 2] = to8(g);
        out[q + 3] = colorType === 4 ? to8(sample(row, x * 2 + 1)) : key && g === key[0] ? 0 : 255;
      } else {
        const r = sample(row, x * channels);
        const g = sample(row, x * channels + 1);
        const b = sample(row, x * channels + 2);
        out[q] = to8(r);
        out[q + 1] = to8(g);
        out[q + 2] = to8(b);
        out[q + 3] =
          colorType === 6 ? to8(sample(row, x * 4 + 3)) : key && r === key[0] && g === key[1] && b === key[2] ? 0 : 255;
      }
    }
  }
  return { width, height, data: out };
}

function chunk(name: string, data: Uint8Array): Uint8Array {
  const type = new TextEncoder().encode(name);
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  out.set(type, 4);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc(type, data));
  return out;
}

/** 8-bit RGBA PNG (RGB when fully opaque). Each row gets the filter with the smallest sum of |bytes|. */
export function encodePng(image: Image): Uint8Array {
  const { width, height, data } = image;
  if (data.length !== width * height * 4) throw new PngError("image data does not match its size");
  let opaque = true;
  for (let i = 3; i < data.length && opaque; i += 4) opaque = data[i] === 255;
  const channels = opaque ? 3 : 4;
  const stride = width * channels;
  const pixels = new Uint8Array(height * stride);
  for (let i = 0, j = 0; i < data.length; i += 4) {
    pixels[j++] = data[i]!;
    pixels[j++] = data[i + 1]!;
    pixels[j++] = data[i + 2]!;
    if (!opaque) pixels[j++] = data[i + 3]!;
  }
  const raw = new Uint8Array(height * (stride + 1));
  const candidate = new Uint8Array(stride);
  for (let y = 0; y < height; y++) {
    const row = y * stride;
    let best = Infinity;
    for (let filter = 0; filter < 5; filter++) {
      let score = 0;
      for (let x = 0; x < stride; x++) {
        const v = pixels[row + x]!;
        const a = x >= channels ? pixels[row + x - channels]! : 0;
        const b = y > 0 ? pixels[row - stride + x]! : 0;
        const c = x >= channels && y > 0 ? pixels[row - stride + x - channels]! : 0;
        const predicted =
          filter === 0 ? 0 : filter === 1 ? a : filter === 2 ? b : filter === 3 ? (a + b) >> 1 : paeth(a, b, c);
        const f = (v - predicted) & 0xff;
        candidate[x] = f;
        score += f < 128 ? f : 256 - f;
      }
      if (score < best) {
        best = score;
        raw[y * (stride + 1)] = filter;
        raw.set(candidate, y * (stride + 1) + 1);
      }
    }
  }
  const ihdr = new Uint8Array(13);
  const h = new DataView(ihdr.buffer);
  h.setUint32(0, width);
  h.setUint32(4, height);
  ihdr[8] = 8;
  ihdr[9] = opaque ? 2 : 6;
  const parts = [
    new Uint8Array(SIGNATURE),
    chunk("IHDR", ihdr),
    chunk("IDAT", new Uint8Array(deflateSync(raw, { level: 9 }))),
    chunk("IEND", new Uint8Array(0)),
  ];
  const out = new Uint8Array(parts.reduce((n, c) => n + c.length, 0));
  let o = 0;
  for (const part of parts) {
    out.set(part, o);
    o += part.length;
  }
  return out;
}
