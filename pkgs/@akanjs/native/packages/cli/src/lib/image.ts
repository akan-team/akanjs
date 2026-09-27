// RGBA image operations for icons and splash images (CLI-8). Resizing works on premultiplied
// alpha, or transparent pixels bleed their color into the edges (tauri-cli icon.rs does the
// same for the same reason: image-rs issue 1655).

import type { Image } from "./png.ts";

export type Rgba = [number, number, number, number];

/** "#rrggbb" or "#rrggbbaa" → [r, g, b, a], or null. */
export function parseColor(text: string): Rgba | null {
  const m = /^#([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(text.trim());
  if (!m) return null;
  const v = parseInt(m[1]!, 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255, m[2] ? parseInt(m[2], 16) : 255];
}

export function toHex([r, g, b]: Rgba): string {
  return `#${[r, g, b].map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}

export function blank(width: number, height: number, color: Rgba = [0, 0, 0, 0]): Image {
  const data = new Uint8Array(width * height * 4);
  for (let i = 0; i < data.length; i += 4) data.set(color, i);
  return { width, height, data };
}

export function isOpaque(image: Image): boolean {
  for (let i = 3; i < image.data.length; i += 4) if (image.data[i] !== 255) return false;
  return true;
}

/** Top-left pixel: the background of a full-bleed icon. */
export function cornerColor(image: Image): Rgba {
  const d = image.data;
  return [d[0]!, d[1]!, d[2]!, d[3]!];
}

/** Per destination index: source indices and weights (area average down, linear up). */
function weights(srcLength: number, dstLength: number): { index: number[]; weight: number[] }[] {
  const scale = srcLength / dstLength;
  return Array.from({ length: dstLength }, (_, i) => {
    const index: number[] = [];
    const weight: number[] = [];
    if (scale >= 1) {
      const start = i * scale;
      const end = start + scale;
      for (let j = Math.floor(start); j < Math.ceil(end) && j < srcLength; j++) {
        const overlap = Math.min(end, j + 1) - Math.max(start, j);
        if (overlap > 0) {
          index.push(j);
          weight.push(overlap / scale);
        }
      }
    } else {
      const center = (i + 0.5) * scale - 0.5;
      const j = Math.floor(center);
      const t = center - j;
      index.push(Math.max(0, j), Math.min(srcLength - 1, j + 1));
      weight.push(1 - t, t);
    }
    return { index, weight };
  });
}

export function resize(image: Image, width: number, height: number): Image {
  if (image.width === width && image.height === height) return { width, height, data: image.data.slice() };
  const { width: sw, height: sh, data } = image;
  const pre = new Float32Array(sw * sh * 4);
  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3]! / 255;
    pre[i] = data[i]! * a;
    pre[i + 1] = data[i + 1]! * a;
    pre[i + 2] = data[i + 2]! * a;
    pre[i + 3] = data[i + 3]!;
  }
  const wx = weights(sw, width);
  const wy = weights(sh, height);
  const tmp = new Float32Array(width * sh * 4);
  for (let y = 0; y < sh; y++) {
    for (let x = 0; x < width; x++) {
      const { index, weight } = wx[x]!;
      const o = (y * width + x) * 4;
      for (let k = 0; k < index.length; k++) {
        const s = (y * sw + index[k]!) * 4;
        const w = weight[k]!;
        tmp[o] = tmp[o]! + pre[s]! * w;
        tmp[o + 1] = tmp[o + 1]! + pre[s + 1]! * w;
        tmp[o + 2] = tmp[o + 2]! + pre[s + 2]! * w;
        tmp[o + 3] = tmp[o + 3]! + pre[s + 3]! * w;
      }
    }
  }
  const out = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    const { index, weight } = wy[y]!;
    for (let x = 0; x < width; x++) {
      let r = 0,
        g = 0,
        b = 0,
        a = 0;
      for (let k = 0; k < index.length; k++) {
        const s = (index[k]! * width + x) * 4;
        const w = weight[k]!;
        r += tmp[s]! * w;
        g += tmp[s + 1]! * w;
        b += tmp[s + 2]! * w;
        a += tmp[s + 3]! * w;
      }
      const o = (y * width + x) * 4;
      const alpha = a / 255;
      out[o] = alpha > 0 ? Math.min(255, Math.round(r / alpha)) : 0;
      out[o + 1] = alpha > 0 ? Math.min(255, Math.round(g / alpha)) : 0;
      out[o + 2] = alpha > 0 ? Math.min(255, Math.round(b / alpha)) : 0;
      out[o + 3] = Math.min(255, Math.round(a));
    }
  }
  return { width, height, data: out };
}

/** Draws `top` over `bottom` at (x, y), source-over. */
export function drawOver(bottom: Image, top: Image, x: number, y: number): Image {
  const out = { ...bottom, data: bottom.data.slice() };
  for (let ty = 0; ty < top.height; ty++) {
    const by = y + ty;
    if (by < 0 || by >= out.height) continue;
    for (let tx = 0; tx < top.width; tx++) {
      const bx = x + tx;
      if (bx < 0 || bx >= out.width) continue;
      const s = (ty * top.width + tx) * 4;
      const d = (by * out.width + bx) * 4;
      const sa = top.data[s + 3]! / 255;
      const da = out.data[d + 3]! / 255;
      const a = sa + da * (1 - sa);
      for (let c = 0; c < 3; c++) {
        out.data[d + c] = a > 0 ? Math.round((top.data[s + c]! * sa + out.data[d + c]! * da * (1 - sa)) / a) : 0;
      }
      out.data[d + 3] = Math.round(a * 255);
    }
  }
  return out;
}

/** A size×size transparent canvas with the image scaled to fit a box×box square in its center. */
export function contain(image: Image, size: number, box: number): Image {
  const scale = box / Math.max(image.width, image.height);
  const w = Math.max(1, Math.round(image.width * scale));
  const h = Math.max(1, Math.round(image.height * scale));
  return drawOver(blank(size, size), resize(image, w, h), Math.round((size - w) / 2), Math.round((size - h) / 2));
}

/** The image composited on an opaque color (iOS app icons must not be transparent). */
export function flatten(image: Image, color: Rgba): Image {
  return drawOver(blank(image.width, image.height, [color[0], color[1], color[2], 255]), image, 0, 0);
}

/**
 * Keeps only a centered rounded rectangle (inset from each edge, corner radius in pixels),
 * anti-aliased with a signed distance per pixel.
 */
export function roundedMask(image: Image, inset: number, radius: number): Image {
  const out = { ...image, data: image.data.slice() };
  const cx = image.width / 2;
  const cy = image.height / 2;
  const hw = image.width / 2 - inset;
  const hh = image.height / 2 - inset;
  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) {
      const qx = Math.abs(x + 0.5 - cx) - (hw - radius);
      const qy = Math.abs(y + 0.5 - cy) - (hh - radius);
      const d = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - radius;
      const coverage = Math.min(1, Math.max(0, 0.5 - d));
      const i = (y * image.width + x) * 4 + 3;
      out.data[i] = Math.round(out.data[i]! * coverage);
    }
  }
  return out;
}
